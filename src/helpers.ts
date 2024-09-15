import { getClient } from '@kodadot1/uniquery';
import { request } from "graphql-request";
import { BN, formatBalance } from "@polkadot/util";
import dotenv from 'dotenv';
import { ApiPromise, Keyring } from '@polkadot/api';
import { encodeAddress } from "@polkadot/keyring";
import { CastingVotingNode, DecoratedConvictionVote, ResponseDataWalletVotesIndexer, VoteChoice } from './types';
import { QUERY_USER_VOTES } from './userVotesQuery';
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { KeyringPair } from "@polkadot/keyring/types";
import { kusama } from './chainConfig';
import axios from 'axios';
import Twitter, { TweetV1 } from 'twitter-api-v2'

dotenv.config();

// Twitter client setup

if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET || !process.env.TWITTER_ACCESS_TOKEN || !process.env.TWITTER_ACCESS_SECRET) {
    throw new Error("No TWITTER_API_KEY or TWITTER_API_SECRET or TWITTER_ACCESS_TOKEN or TWITTER_ACCESS_SECRET provided in .env");
}

const twitterClient = new Twitter({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
});

const rwClient = twitterClient.readWrite;


// Function to fetch content from an IPFS link
export const fetchIpfsContent = async (cid: string): Promise<any> => {
    try {
        const url = `https://ipfs.io/ipfs/${cid}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
            sendTelegramMessage(`Error in fetchIpfsContent: ${error.message}`);
        } else {
            console.error('An unknown error occurred');
            sendTelegramMessage('An unknown error occurred in main execution');
        }
    }

}

export const getNftIds = (content: any): string[] => {
    const collectionIdAttr = content.attributes.find((attr: { trait_type: string; value: string }) => attr.trait_type === 'collection_id');
    const collectionId = collectionIdAttr ? collectionIdAttr.value : '';

    const nftIds = content.attributes
        .filter((attr: { trait_type: string; value: string }) => attr.trait_type.startsWith('nftIds_'))
        .flatMap((attr: { value: string }) => attr.value.split(',').map(id => `${collectionId}-${id}`));

    return nftIds;
}


export const checkIndexerHealth = (response: ResponseDataWalletVotesIndexer): void => {
    if (!response._metadata.indexerHealthy) {
        sendTelegramMessage(`Indexer is not healthy!`);
        throw new Error("Indexer is not healthy!");
    }
}

export const formatCastingVoteIndexer = (
    accountId: string,
    castingVote: CastingVotingNode
): DecoratedConvictionVote | undefined => {
    const { referendumId, standardVote, splitVote, splitAbstainVote, referendum } = castingVote;
    const track = referendum.trackId;

    let formattedVote: DecoratedConvictionVote;
    let voteBase = {
        track,
        address: accountId,
        referendumIndex: referendumId,
        voteType: "Casting",
        delegatedTo: null,
    };

    if (standardVote) {
        const { aye, vote } = standardVote;
        formattedVote = {
            ...voteBase,
            conviction: vote.conviction,
            balance: {
                aye: aye ? vote.amount : "0",
                nay: aye ? "0" : vote.amount,
                abstain: "0",
            },
            voteDirection: aye ? "Aye" : "Nay",
            voteDirectionType: "Standard",
        };
    } else if (splitVote) {
        const { ayeAmount, nayAmount } = splitVote;
        formattedVote = {
            ...voteBase,
            conviction: "Locked1x",
            balance: {
                aye: ayeAmount,
                nay: nayAmount,
                abstain: "0",
            },
            voteDirection: new BN(ayeAmount) >= new BN(nayAmount) ? "Aye" : "Nay",
            voteDirectionType: "Split",
        };
    } else if (splitAbstainVote) {
        const { ayeAmount, nayAmount, abstainAmount } = splitAbstainVote;
        formattedVote = {
            ...voteBase,
            conviction: "Locked1x",
            balance: {
                aye: ayeAmount,
                nay: nayAmount,
                abstain: abstainAmount,
            },
            voteDirection:
                new BN(abstainAmount) >= new BN(ayeAmount) && new BN(abstainAmount) >= new BN(nayAmount)
                    ? "Abstain"
                    : new BN(ayeAmount) >= new BN(nayAmount)
                        ? "Aye"
                        : "Nay",
            voteDirectionType: "SplitAbstain",
        };
    } else {
        console.log("Unknown vote type for castingVote", castingVote);
        sendTelegramMessage(`Unknown vote type for castingVote ${castingVote}`);
        return;
    }

    return formattedVote;
}

export const fetchNftsForVoter = async (vote: DecoratedConvictionVote, allNftIds: string[]): Promise<{ vote: DecoratedConvictionVote; count: number }> => {
    const client = getClient('ahk');
    const query = client.itemListByOwner(vote.address);
    const result: any = await client.fetch(query);
    let count = 0;

    result.data.items.forEach((item: { id: string; }) => {
        if (allNftIds.includes(item.id)) {
            count++;
        }
    });

    return { vote, count };
}

export const fetchVotes = async (refIndex: string, blockNumber: number, address?: string,): Promise<CastingVotingNode[]> => {
    let allVotes = [];
    let lastId = null;
    let hasMore = true;

    let votes_query = QUERY_USER_VOTES

    try {
        while (hasMore) {
            const filterCastingVote: any = {
                referendumId: { equalTo: refIndex }
            };

            // Add the voter filter only if address is provided and not null
            if (address) {
                filterCastingVote.voter = { equalTo: address };
            }

            const variables: any = {
                filterCastingVote,
                referendumId: refIndex,
                after: lastId // Use the cursor from the last item of the previous batch
            };

            const response: ResponseDataWalletVotesIndexer = await request(
                "https://subquery-governance-kusama-prod.novasamatech.org",
                votes_query,
                variables
            );

            checkIndexerHealth(response);

            //check that referenda not expired
            if (response.referendum.finished) {
                return [];
            }

            //check if indexer is caught up to block with last vote extrinsic
            if (response._metadata.lastProcessedHeight >= blockNumber) {
                const votes: CastingVotingNode[] = response.castingVotings.nodes;
                allVotes.push(...votes);

                if (!response.castingVotings.pageInfo.hasNextPage) {
                    hasMore = false;
                } else {
                    lastId = response.castingVotings.pageInfo.endCursor;
                }
            }
            else {
                await sleep(5000);
            }
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
            sendTelegramMessage(`Error in fetchVotes: ${error.message}`);
        } else {
            console.error('An unknown error occurred');
            sendTelegramMessage('An unknown error occurred in main execution');
        }
    }
    return allVotes;

}

export const initAccount = async (): Promise<KeyringPair> => {
    if (!process.env.MNEMONIC) {
        throw new Error("No MNEMONIC provided in .env");
    }
    const keyring = new Keyring({ type: "sr25519" });
    await cryptoWaitReady();
    const account = keyring.addFromUri(process.env.MNEMONIC);
    return account;
};

export const getAccountVote = async (refIndex: string, blockNumber: number): Promise<any> => {
    const account = await initAccount()
    const accountAddress = account.address;

    return (await fetchVotes(refIndex, blockNumber, encodeAddress(accountAddress, kusama.ss58Format)))[0]; //should only be one vote per ref per account
}

export const getVoteTx = (
    api: ApiPromise | undefined,
    voteChoice: VoteChoice,
    ref: number,
    balances: { aye: BN; nay: BN; abstain: BN },
    conviction: number
) => {
    let vote: any = {};

    switch (voteChoice) {
        case VoteChoice.Aye:
        case VoteChoice.Nay:
            vote = {
                Standard: {
                    vote: {
                        aye: voteChoice === VoteChoice.Aye,
                        conviction: conviction,
                    },
                    balance: voteChoice === VoteChoice.Aye ? balances.aye : balances.nay,
                },
            };
            break;
        case VoteChoice.Split:
            vote = {
                Split: {
                    aye: balances.aye,
                    nay: balances.nay,
                },
            };
            break;
        case VoteChoice.Abstain:
            vote = {
                SplitAbstain: {
                    aye: balances.aye,
                    nay: balances.nay,
                    abstain: balances.abstain,
                },
            };
    }

    return api?.tx.convictionVoting.vote(ref, vote);
}

export const sendTransaction = async (
    api: ApiPromise,
    voteDirection: VoteChoice,
    referendumIndex: number,
    balances: { aye: BN; nay: BN; abstain: BN },
    conviction: number,
    ayes: number,
    nays: number,
    abstains: number,
    isUpdate: boolean,
    previousVoteDirection?: string
): Promise<void> => {
    try {
        const account = await initAccount();
        const tx = getVoteTx(api, voteDirection, referendumIndex, balances, conviction);

        if (tx) {
            // Sign and send the transaction
            const unsub = await tx.signAndSend(account, ({ status, dispatchError }) => {
                if (status.isInBlock || status.isFinalized) {
                    console.log(`Transaction included at blockHash ${status.asInBlock}`);
                    const voteChangedText = isUpdate && previousVoteDirection ? `from ${previousVoteDirection.toUpperCase()} to ${voteDirection.toUpperCase()}` : `: ${voteDirection.toUpperCase()}`;
                    const tweetMessage = `🚨 Delegation Wallet Alert\n\nVote for Referendum ${referendumIndex} ${voteChangedText}.\n\nNFT votes:\n👍 AYES: ${ayes}\n👎 NAYS: ${nays}\n🤐 ABSTAIN: ${abstains}\n\nVote may change as more holders participate.\n\nDelegate for impactful governance.\n#ProofOfChaos #KusamaGovernance`;
                    postTweet(tweetMessage, referendumIndex);
                    unsub();
                } else {
                    console.log(`Current transaction status: ${status.type}`);
                }

                if (dispatchError) {
                    if (dispatchError.isModule) {
                        // for module errors, we have the section indexed, lookup
                        const decoded = api.registry.findMetaError(dispatchError.asModule);
                        const { docs, name, section } = decoded;

                        console.log(`${section}.${name}: ${docs.join(' ')}`);
                    } else {
                        // Other, CannotLookup, BadOrigin, no extra info
                        console.log(dispatchError.toString());
                        sendTelegramMessage(`Dispatch error in sendTransaction: ${dispatchError.toString()}`);
                    }
                }
            });
        }

    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
            sendTelegramMessage(`Error in sendTransaction: ${error.message}`);
        } else {
            console.error('An unknown error occurred');
            sendTelegramMessage('An unknown error occurred in main execution');
        }
    }
}

export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const formatAmount = (value: string): string => {
    return formatBalance(value, {
        decimals: kusama.decimals,
        forceUnit: "-",
        withSi: true,
        withUnit: kusama.symbol,
    })
}

export const sendTelegramMessage = async (message: string): Promise<void> => {
    if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        throw new Error("No TELEGRAM_TOKEN or TELEGRAM_CHAT_ID provided in .env");
    }
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
    const body = {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
    };

    try {
        await axios.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
        });
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
        } else {
            console.error('An unknown error occurred');
        }
    }
};

// Record for storing the last tweet timestamps
const lastTweetTimes: Record<number, number> = {};

// Function to check if a tweet can be sent
const canSendTweet = (referendumIndex?: number): boolean => {
    if (referendumIndex === undefined) {
        return true; // Always allow if no referendumIndex is provided
    }
    const now = Date.now();
    const lastTweetTime = lastTweetTimes[referendumIndex];

    // Check if the last tweet was sent more than a minute ago
    return !lastTweetTime || now - lastTweetTime > 60000; // 60000 milliseconds = 1 minute
};

export const postTweet = async (message: string, referendumIndex?: number): Promise<void> => {
    if (canSendTweet(referendumIndex)) {
        try {
            await rwClient.v2.tweet(message);
            console.log('Tweet sent:', message);
            sendTelegramMessage(`A new Tweet has been sent:\n\n${message}`);

            // Update the last tweet time if referendumIndex is provided
            if (referendumIndex !== undefined) {
                lastTweetTimes[referendumIndex] = Date.now();
            }
        } catch (error: unknown) {
            if (error instanceof Error) {
                console.error(error);
                sendTelegramMessage(`Error sending tweet: ${error.message}`);
            } else {
                console.error('An unknown error occurred');
                sendTelegramMessage('An unknown error occurred in postTweet');
            }
        }
    } else {
        console.log(`A tweet for Referendum ${referendumIndex} was already sent in the last minute. Skipping.`);
    }
};





