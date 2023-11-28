"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVote = void 0;
const uniquery_1 = require("@kodadot1/uniquery");
const util_1 = require("@polkadot/util");
const types_1 = require("./types");
const helpers_1 = require("./helpers");
const mongoClient_1 = require("./mongoClient");
//PROGRAM HAS FOLLOWING STEPS
//get all the governance nfts and read out ids: use indexer
//get all the voters for the given referendum: use indexer
//for each voter query nfts
//check which nfts are in governance nft ids
//tally up all ayes, nays, abstain.
//read governance vote from delegation wallet
//if not in line with current tally, send vote extrinsic
async function updateVote(api, refIndex, blockNumber) {
    await (0, helpers_1.sleep)(20000); //give indexers 20 seconds to catch up
    //get all the proof of chaos nft IDS
    const id = '102';
    const client = (0, uniquery_1.getClient)('ahk');
    const query = client.itemListByCollectionId(id);
    const result = await client.fetch(query);
    //health check?
    let allNftIds = [];
    for (const item of result.data.items) {
        try {
            const cleanedLink = item.metadata.replace('ipfs://ipfs/', '');
            const content = await (0, helpers_1.fetchIpfsContent)(cleanedLink);
            const nftIds = (0, helpers_1.getNftIds)(content);
            allNftIds = allNftIds.concat(nftIds);
        }
        catch (error) {
            console.error('Error:', error);
        }
    }
    const allVotes = await (0, helpers_1.fetchVotes)(refIndex, blockNumber);
    //do formatting
    let formattedVotes = [];
    for (const vote of allVotes) {
        const formattedVote = (0, helpers_1.formatCastingVoteIndexer)(vote.voter, vote);
        if (formattedVote) {
            formattedVotes.push(formattedVote);
        }
    }
    // console.log(formattedVotes)
    // Create an array of promises for fetching NFTs for each voter
    const nftFetchPromises = formattedVotes.map(vote => (0, helpers_1.fetchNftsForVoter)(vote, allNftIds));
    // Execute the promises in parallel using Promise.all
    const results = await Promise.all(nftFetchPromises);
    let ayes = 0, nays = 0, abstains = 0;
    let numberOfVotesWithNfts = 0;
    // Process the results
    results.forEach(({ vote, count }) => {
        if (count > 0) {
            numberOfVotesWithNfts++;
            if (vote.voteDirection == "Aye") {
                ayes += count;
            }
            else if (vote.voteDirection == "Nay") {
                nays += count;
            }
            else {
                abstains += count;
            }
        }
    });
    console.log(`Referendum ${refIndex} - Ayes: ${ayes}, Nays: ${nays}, Abstains: ${abstains}`);
    const db = (0, mongoClient_1.getDb)();
    const talliesCollection = db.collection("tallies");
    // Check if an entry with the given refIndex already exists
    const existingEntry = await talliesCollection.findOne({ referendum: refIndex });
    if (existingEntry) {
        // Update existing entry
        await talliesCollection.updateOne({ referendum: refIndex }, { $set: { ayes, nays, abstains } });
    }
    else {
        // Insert new entry
        await talliesCollection.insertOne({
            referendum: refIndex,
            ayes,
            nays,
            abstains
        });
    }
    //add/update entry with id refIndex in tallies table in mongoDB
    let currentVoteDirection = types_1.VoteChoice.Abstain; // Default to "Aye", change based on counts
    // Determine the highest vote count
    if (nays > ayes && nays > abstains) {
        currentVoteDirection = types_1.VoteChoice.Nay;
    }
    else if (ayes > abstains && ayes > nays) {
        currentVoteDirection = types_1.VoteChoice.Aye;
    }
    //only continue if there are at least 20 separate voters with NFTs
    if (numberOfVotesWithNfts > 20) {
        //query the current on-chain vote for this ref
        const delegationWalletVote = await (0, helpers_1.getAccountVote)(refIndex, blockNumber);
        const formattedVote = delegationWalletVote ? (0, helpers_1.formatCastingVoteIndexer)(delegationWalletVote.voter, delegationWalletVote) : undefined;
        // console.log(currentVoteDirection.toString())
        // console.log(formattedVote?.voteDirection)
        if (!formattedVote || formattedVote.voteDirection != currentVoteDirection.toString()) {
            //create vote extrinsic
            const balances = {
                aye: new util_1.BN(currentVoteDirection === types_1.VoteChoice.Aye ? 1 : 0),
                nay: new util_1.BN(currentVoteDirection === types_1.VoteChoice.Nay ? 1 : 0),
                abstain: new util_1.BN(currentVoteDirection === types_1.VoteChoice.Abstain ? 1 : 0)
            };
            //send vote extrinisc to chain
            await (0, helpers_1.sendTransaction)(api, currentVoteDirection, parseInt(refIndex), balances, 1, ayes, nays, abstains, !!formattedVote, formattedVote ? formattedVote.voteDirection : undefined);
        }
    }
}
exports.updateVote = updateVote;
