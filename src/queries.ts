import { getClient } from '@kodadot1/uniquery';
import { ApiPromise, WsProvider, Keyring } from '@polkadot/api';
import { ResponseDataWalletVotesIndexer } from './types';
import { cryptoWaitReady } from "@polkadot/util-crypto";
import { KeyringPair } from "@polkadot/keyring/types";
import { connectToServer, getDb } from './mongoClient'; // Adjust the path as necessary
import { AccountId32 } from "@polkadot/types/interfaces";
import { Codec } from "@polkadot/types/types";
import type { StorageKey, u16 } from "@polkadot/types";
import type {
    PalletConvictionVotingVoteVoting,
} from "@polkadot/types/lookup";
import { BN } from '@polkadot/util';
import gql from 'graphql-tag';
import { request } from "graphql-request";
import { encodeAddress } from "@polkadot/keyring";
import { kusama } from './chainConfig';


//<-------Required in .env---------->
// MNEMONIC=YOUR_DELEGATION_WALLET_MNEMONIC_HERE
// MONGODB_USERNAME=your_mongodb_username
// MONGODB_PASSWORD=your_mongodb_password




//<-----------MAIN FUNCTION--------------->

export const getWalletVotePower = async (
    address: string,
    api: ApiPromise,
    refs: Map<string, { track: number, userVoteDirection: string | null }>
): Promise<Map<string, BN>> => {

    // Retrieve all IDs of Proof of Chaos (POC) NFTs.
    const allGovNftIds: string[] = await getGovNftIds();

    // Determine the count of POC NFTs held by the wallet.
    const walletNftCount: number = await getGovNftCountWallet(address, allGovNftIds);

    // If the wallet has no NFTs, return a map with all referendum IDs mapping to zero vote power increase.
    if (walletNftCount === 0) {
        let zeroVotePowerMap = new Map<string, BN>();
        for (const refId of refs.keys()) {
            zeroVotePowerMap.set(refId, new BN(0));
        }
        return zeroVotePowerMap;
    }

    // Fetch the delegation data for the wallet.
    const walletDelegations: DelegationMap = await getDelegationWalletDelegations(api);

    // Extract all referendum IDs from the refs map.
    const refIds = Array.from(refs.keys());

    // Initialize the account for which vote power is being calculated.
    const account = await initAccount();
    const accountAddress = account.address;

    // Fetch all voting tallies for referendums.
    const votingTallies = await fetchAllTallies();

    // Fetch votes cast by the delegation wallet for the specified referendums.
    const walletVotes = await fetchVotesDelegationWallet(refIds, encodeAddress(accountAddress, kusama.ss58Format));

    // Format the fetched votes into a more usable structure.
    let formattedVotes: DecoratedConvictionVote[] = [];
    for (const vote of walletVotes) {
        const formattedVote: DecoratedConvictionVote | undefined = formatCastingVoteIndexer(vote.voter, vote);
        if (formattedVote) {
            formattedVotes.push(formattedVote);
        }
    }

    // Calculate the increase in vote power for each referendum.
    let votePowerIncreasePerRef = new Map<string, BN>();
    for (const [refId, { track, userVoteDirection }] of refs) {
        // Get the delegation amount for the track associated with the referendum.
        const delegationAmount = walletDelegations.get(track)?.delegationCapital || new BN(0);

        // Find the tally for the specific referendum.
        const tally = votingTallies.find(t => t.referendum === refId);

        // Convert user vote direction to the corresponding field name in the tally.
        const voteDirectionField = userVoteDirection?.toLowerCase() + 's'; // e.g., "Aye" -> "ayes"

        // Find the vote direction of the delegation wallet.
        const walletVoteDirection = formattedVotes.find(vote => vote.referendumIndex === refId)?.voteDirection;

        // If either the user or the delegation wallet has not voted, calculate the vote power increase using total votes.
        if (!userVoteDirection || !walletVoteDirection) {
            const totalVotes = (tally?.ayes || 0) + (tally?.nays || 0) + (tally?.abstains || 0);
            if (totalVotes > 0) {
                const voteIncreaseSize = new BN(walletNftCount).mul(delegationAmount).div(new BN(totalVotes));
                votePowerIncreasePerRef.set(refId, voteIncreaseSize);
            } else {
                votePowerIncreasePerRef.set(refId, new BN(0));
            }
        }
        // Else, if the user's vote direction matches the delegation wallet's direction, calculate the vote power increase.
        else if (walletVoteDirection === userVoteDirection) {
            const voteDirectionCount = tally && voteDirectionField in tally ? tally[voteDirectionField] : 0;
            if (voteDirectionCount > 0) {
                const voteIncreaseSize = new BN(walletNftCount).mul(delegationAmount).div(new BN(voteDirectionCount));
                votePowerIncreasePerRef.set(refId, voteIncreaseSize);
            } else {
                votePowerIncreasePerRef.set(refId, new BN(0));
            }
        } else {
            // If the user's vote direction does not match the delegation wallet's direction, set the increase to zero.
            votePowerIncreasePerRef.set(refId, new BN(0));
        }
    }

    return votePowerIncreasePerRef;
};







// // <--------HOW TO CALL THE MAIN FUNCTION-------->

async function main(): Promise<void> {
    await connectToServer();
    // Create a Map of referendums and their respective details
    const refs = new Map<string, { track: number, userVoteDirection: string | null }>([
        ["309", { track: 33, userVoteDirection: "Aye" }],
        ["317", { track: 33, userVoteDirection: null }], //user did not vote yet on 317
        // ["291", { track: "someOtherTrack", userVoteDirection: "Aye" }]
    ]);

    const address = ""; // Replace with the actual wallet address

    const provider = new WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await ApiPromise.create({ provider });

    // Call the function with the address, API instance, and the refs Map
    const votePower: any = await getWalletVotePower(address, api, refs);
    console.log(votePower)
}

main();









// <-----------HELPER FUNCTIONS AND TYPES------------>

export interface VotePolkadot {
    accountId: string;
    track: number;
    voteData: PalletConvictionVotingVoteVoting;
}

export const fetchAllTallies = async (): Promise<any[]> => {
    const db = getDb();
    const collection = db.collection('tallies');

    try {
        const tallies = await collection.find({}).toArray();
        return tallies;
    } catch (error) {
        console.error('Error fetching tallies:', error);
        throw error; // Or handle error as needed
    }
};

export const getGovNftCountWallet = async (address: string, allNftIds: string[]): Promise<number> => {
    const client = getClient('ahk');
    const query = client.itemListByOwner(address);
    const result: any = await client.fetch(query);
    let count = 0;

    result.data.items.forEach((item: { id: string; }) => {
        if (allNftIds.includes(item.id)) {
            count++;
        }
    });

    return count;
}

type DelegationInfo = {
    delegationVotes: BN;
    delegationCapital: BN;
};

type DelegationMap = Map<number, DelegationInfo>;

export const getDelegationWalletDelegations = async (api: ApiPromise): Promise<DelegationMap> => {
    const account = await initAccount();
    const accountAddress = account.address;
    const delegationVotingFor = await api.query.convictionVoting.votingFor.entries(accountAddress);
    const delegationVotingForFormatted: VotePolkadot[] = delegationVotingFor?.map(transformVoteMulti);

    let delegationsPerTrack = new Map<number, DelegationInfo>();
    // Iterate through the list of accounts in the network that are voting
    for (const vote of delegationVotingForFormatted) {
        if (vote.voteData.isCasting) {
            const { track } = vote;

            const {
                delegations: { votes: delegationVotes, capital: delegationCapital },
            } = vote.voteData.asCasting;

            // Update the Map with the track data
            delegationsPerTrack.set(track, { delegationVotes, delegationCapital });
        }
    }

    return delegationsPerTrack;
};



export const transformVoteMulti = ([storageKey, codec]: [
    StorageKey<[AccountId32, u16]>,
    Codec
]): VotePolkadot => {
    // Extract data from storageKey
    const [accountId, track] = storageKey.args;

    return transformVote(accountId.toString(), track.toNumber(), codec);
};

export const transformVote = (
    accountId: string,
    track: number,
    codec: Codec
): VotePolkadot => {
    // Cast Codec to the specific type PalletConvictionVotingVoteVoting and extract necessary fields
    const voteData = codec as PalletConvictionVotingVoteVoting;

    return {
        accountId: accountId,
        track: track,
        voteData,
    };
};

export const initAccount = async (): Promise<KeyringPair> => {
    if (!process.env.MNEMONIC) {
        throw new Error("No MNEMONIC provided in .env");
    }
    const keyring = new Keyring({ type: "sr25519" });
    await cryptoWaitReady();
    const account = keyring.addFromUri(process.env.MNEMONIC);
    return account;
};

type Vote = {
    amount: string;
    conviction: string;
};

type CastingVotingNode = {
    referendumId: string;
    standardVote: {
        aye: boolean;
        vote: Vote;
    } | null;
    splitVote: {
        ayeAmount: string;
        nayAmount: string;
    } | null;
    splitAbstainVote: {
        ayeAmount: string;
        nayAmount: string;
        abstainAmount: string;
    } | null;
    referendum: {
        trackId: number;
    };
    voter: string;
};

export const QUERY_USER_VOTES = gql`
  query UserVotesQuery($filterCastingVote: CastingVotingFilter, $after: Cursor) {
    _metadata {
      lastProcessedHeight
      indexerHealthy
    }
    castingVotings(
      orderBy: REFERENDUM_ID_ASC,
      filter: $filterCastingVote,
      after: $after
    ) {
      nodes {
        referendumId
        standardVote
        voter
        splitVote
        splitAbstainVote
        referendum {
          trackId
        }
        nodeId
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
      }
    }
  }
`;

export const sleep = (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export const fetchVotesDelegationWallet = async (refIds: string[], address: string,): Promise<CastingVotingNode[]> => {
    let allVotes = [];
    let lastId = null;
    let hasMore = true;

    let votes_query = QUERY_USER_VOTES

    try {
        while (hasMore) {
            const filterCastingVote: any = {
                referendumId: { in: refIds }
            };

            // Add the voter filter only if address is provided and not null
            if (address) {
                filterCastingVote.voter = { equalTo: address };
            }

            const variables: any = {
                filterCastingVote,
                after: lastId // Use the cursor from the last item of the previous batch
            };

            const response: ResponseDataWalletVotesIndexer = await request(
                "https://api.subquery.network/sq/nova-wallet/nova-wallet-kusama-governance2",
                votes_query,
                variables
            );

            checkIndexerHealth(response);

            //check if indexer is caught up to block with last vote extrinsic
            const votes = response.castingVotings.nodes;
            allVotes.push(...votes);

            if (!response.castingVotings.pageInfo.hasNextPage) {
                hasMore = false;
            } else {
                lastId = response.castingVotings.pageInfo.endCursor;
            }
        }
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
        } else {
            console.error('An unknown error occurred');
        }
    }
    return allVotes;

}

export type ConvictionVote = {
    // The particular governance track
    track: number;
    // The account that is voting
    address: string;
    // The index of the referendum
    referendumIndex: string;
    // The conviction being voted with, ie `None`, `Locked1x`, `Locked5x`, etc
    conviction: string;
    // The balance they are voting with themselves, sans delegated balance
    balance: {
        aye: string;
        nay: string;
        abstain: string;
    };
    // The total amount of tokens that were delegated to them (including conviction)
    delegatedConvictionBalance?: string;
    // the total amount of tokens that were delegated to them (without conviction)
    delegatedBalance?: string;
    // The vote type, either 'aye', or 'nay'
    voteDirection: string;
    // Either "Standard", "Split", or "SplitAbstain",
    voteDirectionType: string;
    // Whether the person is voting themselves or delegating
    voteType: string;
    // Who the person is delegating to
    delegatedTo: string | null;
};

export interface DecoratedConvictionVote extends ConvictionVote {
    lockedWithConviction?: BN;
    dragonEquipped?: string;
    quizCorrect?: number;
    encointerScore?: number;
    meetsRequirements?: boolean;
    lockedWithConvictionDecimal?: number;
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
        return;
    }

    return formattedVote;
}

export const getGovNftIds = async (): Promise<string[]> => {
    const id = '102';
    const client = getClient('ahk');
    const query = client.itemListByCollectionId(id);
    const result: any = await client.fetch(query);

    //health check?

    let allNftIds: string[] = [];

    for (const item of result.data.items) {
        try {
            const cleanedLink = item.metadata.replace('ipfs://ipfs/', '');
            const content = await fetchIpfsContent(cleanedLink);
            const nftIds = getNftIds(content);
            allNftIds = allNftIds.concat(nftIds);
        } catch (error) {
            console.error('Error:', error);
        }
    }
    return allNftIds;
}

// Function to fetch content from an IPFS link
export const fetchIpfsContent = async (cid: string): Promise<any> => {
    try {
        //maybe we use our endpoint instead.
        const url = `https://ipfs.io/ipfs/${cid}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
    } catch (error: unknown) {
        if (error instanceof Error) {
            console.error(error);
        } else {
            console.error('An unknown error occurred');
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
        throw new Error("Indexer is not healthy!");
    }
}