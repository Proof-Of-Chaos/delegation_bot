"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postTweet = exports.sendTelegramMessage = exports.formatAmount = exports.sleep = exports.sendTransaction = exports.getVoteTx = exports.getAccountVote = exports.initAccount = exports.fetchVotes = exports.fetchNftsForVoter = exports.formatCastingVoteIndexer = exports.checkIndexerHealth = exports.getNftIds = exports.fetchIpfsContent = void 0;
const uniquery_1 = require("@kodadot1/uniquery");
const graphql_request_1 = require("graphql-request");
const util_1 = require("@polkadot/util");
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = require("@polkadot/api");
const keyring_1 = require("@polkadot/keyring");
const types_1 = require("./types");
const userVotesQuery_1 = require("./userVotesQuery");
const util_crypto_1 = require("@polkadot/util-crypto");
const chainConfig_1 = require("./chainConfig");
const axios_1 = __importDefault(require("axios"));
const twitter_api_v2_1 = __importDefault(require("twitter-api-v2"));
dotenv_1.default.config();
// Twitter client setup
if (!process.env.TWITTER_API_KEY || !process.env.TWITTER_API_SECRET || !process.env.TWITTER_ACCESS_TOKEN || !process.env.TWITTER_ACCESS_SECRET) {
    throw new Error("No TWITTER_API_KEY or TWITTER_API_SECRET or TWITTER_ACCESS_TOKEN or TWITTER_ACCESS_SECRET provided in .env");
}
const twitterClient = new twitter_api_v2_1.default({
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_SECRET,
});
const rwClient = twitterClient.readWrite;
// Function to fetch content from an IPFS link
const fetchIpfsContent = async (cid) => {
    try {
        const url = `https://ipfs.io/ipfs/${cid}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error);
            (0, exports.sendTelegramMessage)(`Error in fetchIpfsContent: ${error.message}`);
        }
        else {
            console.error('An unknown error occurred');
            (0, exports.sendTelegramMessage)('An unknown error occurred in main execution');
        }
    }
};
exports.fetchIpfsContent = fetchIpfsContent;
const getNftIds = (content) => {
    const collectionIdAttr = content.attributes.find((attr) => attr.trait_type === 'collection_id');
    const collectionId = collectionIdAttr ? collectionIdAttr.value : '';
    const nftIds = content.attributes
        .filter((attr) => attr.trait_type.startsWith('nftIds_'))
        .flatMap((attr) => attr.value.split(',').map(id => `${collectionId}-${id}`));
    return nftIds;
};
exports.getNftIds = getNftIds;
const checkIndexerHealth = (response) => {
    if (!response._metadata.indexerHealthy) {
        (0, exports.sendTelegramMessage)(`Indexer is not healthy!`);
        throw new Error("Indexer is not healthy!");
    }
};
exports.checkIndexerHealth = checkIndexerHealth;
const formatCastingVoteIndexer = (accountId, castingVote) => {
    const { referendumId, standardVote, splitVote, splitAbstainVote, referendum } = castingVote;
    const track = referendum.trackId;
    let formattedVote;
    let voteBase = {
        track,
        address: accountId,
        referendumIndex: referendumId,
        voteType: "Casting",
        delegatedTo: null,
    };
    if (standardVote) {
        const { aye, vote } = standardVote;
        formattedVote = Object.assign(Object.assign({}, voteBase), { conviction: vote.conviction, balance: {
                aye: aye ? vote.amount : "0",
                nay: aye ? "0" : vote.amount,
                abstain: "0",
            }, voteDirection: aye ? "Aye" : "Nay", voteDirectionType: "Standard" });
    }
    else if (splitVote) {
        const { ayeAmount, nayAmount } = splitVote;
        formattedVote = Object.assign(Object.assign({}, voteBase), { conviction: "Locked1x", balance: {
                aye: ayeAmount,
                nay: nayAmount,
                abstain: "0",
            }, voteDirection: new util_1.BN(ayeAmount) >= new util_1.BN(nayAmount) ? "Aye" : "Nay", voteDirectionType: "Split" });
    }
    else if (splitAbstainVote) {
        const { ayeAmount, nayAmount, abstainAmount } = splitAbstainVote;
        formattedVote = Object.assign(Object.assign({}, voteBase), { conviction: "Locked1x", balance: {
                aye: ayeAmount,
                nay: nayAmount,
                abstain: abstainAmount,
            }, voteDirection: new util_1.BN(abstainAmount) >= new util_1.BN(ayeAmount) && new util_1.BN(abstainAmount) >= new util_1.BN(nayAmount)
                ? "Abstain"
                : new util_1.BN(ayeAmount) >= new util_1.BN(nayAmount)
                    ? "Aye"
                    : "Nay", voteDirectionType: "SplitAbstain" });
    }
    else {
        console.log("Unknown vote type for castingVote", castingVote);
        (0, exports.sendTelegramMessage)(`Unknown vote type for castingVote ${castingVote}`);
        return;
    }
    return formattedVote;
};
exports.formatCastingVoteIndexer = formatCastingVoteIndexer;
const fetchNftsForVoter = async (vote, allNftIds) => {
    const client = (0, uniquery_1.getClient)('ahk');
    const query = client.itemListByOwner(vote.address);
    const result = await client.fetch(query);
    let count = 0;
    result.data.items.forEach((item) => {
        if (allNftIds.includes(item.id)) {
            count++;
        }
    });
    return { vote, count };
};
exports.fetchNftsForVoter = fetchNftsForVoter;
const fetchVotes = async (refIndex, blockNumber, address) => {
    let allVotes = [];
    let lastId = null;
    let hasMore = true;
    let votes_query = userVotesQuery_1.QUERY_USER_VOTES;
    try {
        while (hasMore) {
            const filterCastingVote = {
                referendumId: { equalTo: refIndex }
            };
            // Add the voter filter only if address is provided and not null
            if (address) {
                filterCastingVote.voter = { equalTo: address };
            }
            const variables = {
                filterCastingVote,
                referendumId: refIndex,
                after: lastId // Use the cursor from the last item of the previous batch
            };
            const response = await (0, graphql_request_1.request)("https://subquery-governance-kusama-prod.novasamatech.org", votes_query, variables);
            (0, exports.checkIndexerHealth)(response);
            //check that referenda not expired
            if (response.referendum.finished) {
                return [];
            }
            //check if indexer is caught up to block with last vote extrinsic
            if (response._metadata.lastProcessedHeight >= blockNumber) {
                const votes = response.castingVotings.nodes;
                allVotes.push(...votes);
                if (!response.castingVotings.pageInfo.hasNextPage) {
                    hasMore = false;
                }
                else {
                    lastId = response.castingVotings.pageInfo.endCursor;
                }
            }
            else {
                await (0, exports.sleep)(5000);
            }
        }
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error);
            (0, exports.sendTelegramMessage)(`Error in fetchVotes: ${error.message}`);
        }
        else {
            console.error('An unknown error occurred');
            (0, exports.sendTelegramMessage)('An unknown error occurred in main execution');
        }
    }
    return allVotes;
};
exports.fetchVotes = fetchVotes;
const initAccount = async () => {
    if (!process.env.MNEMONIC) {
        throw new Error("No MNEMONIC provided in .env");
    }
    const keyring = new api_1.Keyring({ type: "sr25519" });
    await (0, util_crypto_1.cryptoWaitReady)();
    const account = keyring.addFromUri(process.env.MNEMONIC);
    return account;
};
exports.initAccount = initAccount;
const getAccountVote = async (refIndex, blockNumber) => {
    const account = await (0, exports.initAccount)();
    const accountAddress = account.address;
    return (await (0, exports.fetchVotes)(refIndex, blockNumber, (0, keyring_1.encodeAddress)(accountAddress, chainConfig_1.kusama.ss58Format)))[0]; //should only be one vote per ref per account
};
exports.getAccountVote = getAccountVote;
const getVoteTx = (api, voteChoice, ref, balances, conviction) => {
    let vote = {};
    switch (voteChoice) {
        case types_1.VoteChoice.Aye:
        case types_1.VoteChoice.Nay:
            vote = {
                Standard: {
                    vote: {
                        aye: voteChoice === types_1.VoteChoice.Aye,
                        conviction: conviction,
                    },
                    balance: voteChoice === types_1.VoteChoice.Aye ? balances.aye : balances.nay,
                },
            };
            break;
        case types_1.VoteChoice.Split:
            vote = {
                Split: {
                    aye: balances.aye,
                    nay: balances.nay,
                },
            };
            break;
        case types_1.VoteChoice.Abstain:
            vote = {
                SplitAbstain: {
                    aye: balances.aye,
                    nay: balances.nay,
                    abstain: balances.abstain,
                },
            };
    }
    return api === null || api === void 0 ? void 0 : api.tx.convictionVoting.vote(ref, vote);
};
exports.getVoteTx = getVoteTx;
const sendTransaction = async (api, voteDirection, referendumIndex, balances, conviction, ayes, nays, abstains, isUpdate, previousVoteDirection) => {
    try {
        const account = await (0, exports.initAccount)();
        const tx = (0, exports.getVoteTx)(api, voteDirection, referendumIndex, balances, conviction);
        if (tx) {
            // Sign and send the transaction
            const unsub = await tx.signAndSend(account, ({ status, dispatchError }) => {
                if (status.isInBlock || status.isFinalized) {
                    console.log(`Transaction included at blockHash ${status.asInBlock}`);
                    const voteChangedText = isUpdate && previousVoteDirection ? `from ${previousVoteDirection.toUpperCase()} to ${voteDirection.toUpperCase()}` : `: ${voteDirection.toUpperCase()}`;
                    const tweetMessage = `🚨 Delegation Wallet Alert\n\nVote for Referendum ${referendumIndex} ${voteChangedText}.\n\nNFT votes:\n👍 AYES: ${ayes}\n👎 NAYS: ${nays}\n🤐 ABSTAIN: ${abstains}\n\nVote may change as more holders participate.\n\nDelegate for impactful governance.\n#ProofOfChaos #KusamaGovernance`;
                    (0, exports.postTweet)(tweetMessage, referendumIndex);
                    unsub();
                }
                else {
                    console.log(`Current transaction status: ${status.type}`);
                }
                if (dispatchError) {
                    if (dispatchError.isModule) {
                        // for module errors, we have the section indexed, lookup
                        const decoded = api.registry.findMetaError(dispatchError.asModule);
                        const { docs, name, section } = decoded;
                        console.log(`${section}.${name}: ${docs.join(' ')}`);
                    }
                    else {
                        // Other, CannotLookup, BadOrigin, no extra info
                        console.log(dispatchError.toString());
                        (0, exports.sendTelegramMessage)(`Dispatch error in sendTransaction: ${dispatchError.toString()}`);
                    }
                }
            });
        }
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error);
            (0, exports.sendTelegramMessage)(`Error in sendTransaction: ${error.message}`);
        }
        else {
            console.error('An unknown error occurred');
            (0, exports.sendTelegramMessage)('An unknown error occurred in main execution');
        }
    }
};
exports.sendTransaction = sendTransaction;
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
exports.sleep = sleep;
const formatAmount = (value) => {
    return (0, util_1.formatBalance)(value, {
        decimals: chainConfig_1.kusama.decimals,
        forceUnit: "-",
        withSi: true,
        withUnit: chainConfig_1.kusama.symbol,
    });
};
exports.formatAmount = formatAmount;
const sendTelegramMessage = async (message) => {
    if (!process.env.TELEGRAM_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
        throw new Error("No TELEGRAM_TOKEN or TELEGRAM_CHAT_ID provided in .env");
    }
    const url = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`;
    const body = {
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
    };
    try {
        await axios_1.default.post(url, {
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: message,
        });
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error);
        }
        else {
            console.error('An unknown error occurred');
        }
    }
};
exports.sendTelegramMessage = sendTelegramMessage;
// Record for storing the last tweet timestamps
const lastTweetTimes = {};
// Function to check if a tweet can be sent
const canSendTweet = (referendumIndex) => {
    if (referendumIndex === undefined) {
        return true; // Always allow if no referendumIndex is provided
    }
    const now = Date.now();
    const lastTweetTime = lastTweetTimes[referendumIndex];
    // Check if the last tweet was sent more than a minute ago
    return !lastTweetTime || now - lastTweetTime > 60000; // 60000 milliseconds = 1 minute
};
const postTweet = async (message, referendumIndex) => {
    if (canSendTweet(referendumIndex)) {
        try {
            await rwClient.v2.tweet(message);
            console.log('Tweet sent:', message);
            (0, exports.sendTelegramMessage)(`A new Tweet has been sent:\n\n${message}`);
            // Update the last tweet time if referendumIndex is provided
            if (referendumIndex !== undefined) {
                lastTweetTimes[referendumIndex] = Date.now();
            }
        }
        catch (error) {
            if (error instanceof Error) {
                console.error(error);
                (0, exports.sendTelegramMessage)(`Error sending tweet: ${error.message}`);
            }
            else {
                console.error('An unknown error occurred');
                (0, exports.sendTelegramMessage)('An unknown error occurred in postTweet');
            }
        }
    }
    else {
        console.log(`A tweet for Referendum ${referendumIndex} was already sent in the last minute. Skipping.`);
    }
};
exports.postTweet = postTweet;
