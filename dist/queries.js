"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIndexerHealth = exports.getNftIds = exports.fetchIpfsContent = exports.getGovNftIds = exports.formatCastingVoteIndexer = exports.fetchVotesDelegationWallet = exports.sleep = exports.QUERY_USER_VOTES = exports.initAccount = exports.transformVote = exports.transformVoteMulti = exports.getDelegationWalletDelegations = exports.getGovNftCountWallet = exports.fetchAllTallies = exports.getWalletVotePower = void 0;
const uniquery_1 = require("@kodadot1/uniquery");
const api_1 = require("@polkadot/api");
const util_crypto_1 = require("@polkadot/util-crypto");
const mongoClient_1 = require("./mongoClient"); // Adjust the path as necessary
const util_1 = require("@polkadot/util");
const graphql_tag_1 = __importDefault(require("graphql-tag"));
const graphql_request_1 = require("graphql-request");
const keyring_1 = require("@polkadot/keyring");
const chainConfig_1 = require("./chainConfig");
//<-------Required in .env---------->
// MNEMONIC=YOUR_DELEGATION_WALLET_MNEMONIC_HERE
// MONGODB_USERNAME=your_mongodb_username
// MONGODB_PASSWORD=your_mongodb_password
//<-----------MAIN FUNCTION--------------->
const getWalletVotePower = async (address, api, refs) => {
    var _a, _b;
    // Retrieve all IDs of Proof of Chaos (POC) NFTs.
    const allGovNftIds = await (0, exports.getGovNftIds)();
    // Determine the count of POC NFTs held by the wallet.
    const walletNftCount = await (0, exports.getGovNftCountWallet)(address, allGovNftIds);
    // If the wallet has no NFTs, return a map with all referendum IDs mapping to zero vote power increase.
    if (walletNftCount === 0) {
        let zeroVotePowerMap = new Map();
        for (const refId of refs.keys()) {
            zeroVotePowerMap.set(refId, new util_1.BN(0));
        }
        return zeroVotePowerMap;
    }
    // Fetch the delegation data for the wallet.
    const walletDelegations = await (0, exports.getDelegationWalletDelegations)(api);
    // Extract all referendum IDs from the refs map.
    const refIds = Array.from(refs.keys());
    // Initialize the account for which vote power is being calculated.
    const account = await (0, exports.initAccount)();
    const accountAddress = account.address;
    // Fetch all voting tallies for referendums.
    const votingTallies = await (0, exports.fetchAllTallies)();
    // Fetch votes cast by the delegation wallet for the specified referendums.
    const walletVotes = await (0, exports.fetchVotesDelegationWallet)(refIds, (0, keyring_1.encodeAddress)(accountAddress, chainConfig_1.kusama.ss58Format));
    // Format the fetched votes into a more usable structure.
    let formattedVotes = [];
    for (const vote of walletVotes) {
        const formattedVote = (0, exports.formatCastingVoteIndexer)(vote.voter, vote);
        if (formattedVote) {
            formattedVotes.push(formattedVote);
        }
    }
    // Calculate the increase in vote power for each referendum.
    let votePowerIncreasePerRef = new Map();
    for (const [refId, { track, userVoteDirection }] of refs) {
        // Get the delegation amount for the track associated with the referendum.
        const delegationAmount = ((_a = walletDelegations.get(track)) === null || _a === void 0 ? void 0 : _a.delegationCapital) || new util_1.BN(0);
        // Find the tally for the specific referendum.
        const tally = votingTallies.find(t => t.referendum === refId);
        // Convert user vote direction to the corresponding field name in the tally.
        const voteDirectionField = (userVoteDirection === null || userVoteDirection === void 0 ? void 0 : userVoteDirection.toLowerCase()) + 's'; // e.g., "Aye" -> "ayes"
        // Find the vote direction of the delegation wallet.
        const walletVoteDirection = (_b = formattedVotes.find(vote => vote.referendumIndex === refId)) === null || _b === void 0 ? void 0 : _b.voteDirection;
        // If either the user or the delegation wallet has not voted, calculate the vote power increase using total votes.
        if (!userVoteDirection || !walletVoteDirection) {
            const totalVotes = ((tally === null || tally === void 0 ? void 0 : tally.ayes) || 0) + ((tally === null || tally === void 0 ? void 0 : tally.nays) || 0) + ((tally === null || tally === void 0 ? void 0 : tally.abstains) || 0);
            if (totalVotes > 0) {
                const voteIncreaseSize = new util_1.BN(walletNftCount).mul(delegationAmount).div(new util_1.BN(totalVotes));
                votePowerIncreasePerRef.set(refId, voteIncreaseSize);
            }
            else {
                votePowerIncreasePerRef.set(refId, new util_1.BN(0));
            }
        }
        // Else, if the user's vote direction matches the delegation wallet's direction, calculate the vote power increase.
        else if (walletVoteDirection === userVoteDirection) {
            const voteDirectionCount = tally && voteDirectionField in tally ? tally[voteDirectionField] : 0;
            if (voteDirectionCount > 0) {
                const voteIncreaseSize = new util_1.BN(walletNftCount).mul(delegationAmount).div(new util_1.BN(voteDirectionCount));
                votePowerIncreasePerRef.set(refId, voteIncreaseSize);
            }
            else {
                votePowerIncreasePerRef.set(refId, new util_1.BN(0));
            }
        }
        else {
            // If the user's vote direction does not match the delegation wallet's direction, set the increase to zero.
            votePowerIncreasePerRef.set(refId, new util_1.BN(0));
        }
    }
    return votePowerIncreasePerRef;
};
exports.getWalletVotePower = getWalletVotePower;
// // <--------HOW TO CALL THE MAIN FUNCTION-------->
async function main() {
    await (0, mongoClient_1.connectToServer)();
    // Create a Map of referendums and their respective details
    const refs = new Map([
        ["309", { track: 33, userVoteDirection: "Aye" }],
        ["317", { track: 33, userVoteDirection: null }], //user did not vote yet on 317
        // ["291", { track: "someOtherTrack", userVoteDirection: "Aye" }]
    ]);
    const address = "FF4KRpru9a1r2nfWeLmZRk6N8z165btsWYaWvqaVgR6qVic"; // Replace with the actual wallet address
    const provider = new api_1.WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await api_1.ApiPromise.create({ provider });
    // Call the function with the address, API instance, and the refs Map
    const votePower = await (0, exports.getWalletVotePower)(address, api, refs);
    console.log(votePower);
}
main();
const fetchAllTallies = async () => {
    const db = (0, mongoClient_1.getDb)();
    const collection = db.collection('tallies');
    try {
        const tallies = await collection.find({}).toArray();
        return tallies;
    }
    catch (error) {
        console.error('Error fetching tallies:', error);
        throw error; // Or handle error as needed
    }
};
exports.fetchAllTallies = fetchAllTallies;
const getGovNftCountWallet = async (address, allNftIds) => {
    const client = (0, uniquery_1.getClient)('ahk');
    const query = client.itemListByOwner(address);
    const result = await client.fetch(query);
    let count = 0;
    result.data.items.forEach((item) => {
        if (allNftIds.includes(item.id)) {
            count++;
        }
    });
    return count;
};
exports.getGovNftCountWallet = getGovNftCountWallet;
const getDelegationWalletDelegations = async (api) => {
    const account = await (0, exports.initAccount)();
    const accountAddress = account.address;
    const delegationVotingFor = await api.query.convictionVoting.votingFor.entries(accountAddress);
    const delegationVotingForFormatted = delegationVotingFor === null || delegationVotingFor === void 0 ? void 0 : delegationVotingFor.map(exports.transformVoteMulti);
    let delegationsPerTrack = new Map();
    // Iterate through the list of accounts in the network that are voting
    for (const vote of delegationVotingForFormatted) {
        if (vote.voteData.isCasting) {
            const { track } = vote;
            const { delegations: { votes: delegationVotes, capital: delegationCapital }, } = vote.voteData.asCasting;
            // Update the Map with the track data
            delegationsPerTrack.set(track, { delegationVotes, delegationCapital });
        }
    }
    return delegationsPerTrack;
};
exports.getDelegationWalletDelegations = getDelegationWalletDelegations;
const transformVoteMulti = ([storageKey, codec]) => {
    // Extract data from storageKey
    const [accountId, track] = storageKey.args;
    return (0, exports.transformVote)(accountId.toString(), track.toNumber(), codec);
};
exports.transformVoteMulti = transformVoteMulti;
const transformVote = (accountId, track, codec) => {
    // Cast Codec to the specific type PalletConvictionVotingVoteVoting and extract necessary fields
    const voteData = codec;
    return {
        accountId: accountId,
        track: track,
        voteData,
    };
};
exports.transformVote = transformVote;
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
exports.QUERY_USER_VOTES = (0, graphql_tag_1.default) `
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
const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};
exports.sleep = sleep;
const fetchVotesDelegationWallet = async (refIds, address) => {
    let allVotes = [];
    let lastId = null;
    let hasMore = true;
    let votes_query = exports.QUERY_USER_VOTES;
    try {
        while (hasMore) {
            const filterCastingVote = {
                referendumId: { in: refIds }
            };
            // Add the voter filter only if address is provided and not null
            if (address) {
                filterCastingVote.voter = { equalTo: address };
            }
            const variables = {
                filterCastingVote,
                after: lastId // Use the cursor from the last item of the previous batch
            };
            const response = await (0, graphql_request_1.request)("https://api.subquery.network/sq/nova-wallet/nova-wallet-kusama-governance2", votes_query, variables);
            (0, exports.checkIndexerHealth)(response);
            //check if indexer is caught up to block with last vote extrinsic
            const votes = response.castingVotings.nodes;
            allVotes.push(...votes);
            if (!response.castingVotings.pageInfo.hasNextPage) {
                hasMore = false;
            }
            else {
                lastId = response.castingVotings.pageInfo.endCursor;
            }
        }
    }
    catch (error) {
        if (error instanceof Error) {
            console.error(error);
        }
        else {
            console.error('An unknown error occurred');
        }
    }
    return allVotes;
};
exports.fetchVotesDelegationWallet = fetchVotesDelegationWallet;
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
        return;
    }
    return formattedVote;
};
exports.formatCastingVoteIndexer = formatCastingVoteIndexer;
const getGovNftIds = async () => {
    const id = '102';
    const client = (0, uniquery_1.getClient)('ahk');
    const query = client.itemListByCollectionId(id);
    const result = await client.fetch(query);
    //health check?
    let allNftIds = [];
    for (const item of result.data.items) {
        try {
            const cleanedLink = item.metadata.replace('ipfs://ipfs/', '');
            const content = await (0, exports.fetchIpfsContent)(cleanedLink);
            const nftIds = (0, exports.getNftIds)(content);
            allNftIds = allNftIds.concat(nftIds);
        }
        catch (error) {
            console.error('Error:', error);
        }
    }
    return allNftIds;
};
exports.getGovNftIds = getGovNftIds;
// Function to fetch content from an IPFS link
const fetchIpfsContent = async (cid) => {
    try {
        //maybe we use our endpoint instead.
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
        }
        else {
            console.error('An unknown error occurred');
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
        throw new Error("Indexer is not healthy!");
    }
};
exports.checkIndexerHealth = checkIndexerHealth;
