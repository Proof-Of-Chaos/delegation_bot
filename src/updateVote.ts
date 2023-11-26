import { getClient } from '@kodadot1/uniquery';
import { BN } from "@polkadot/util";
import { ApiPromise } from '@polkadot/api';
import { DecoratedConvictionVote, VoteChoice } from './types';
import { fetchIpfsContent, fetchNftsForVoter, fetchVotes, formatCastingVoteIndexer, getAccountVote, getNftIds, sendTransaction, sleep } from './helpers';

//PROGRAM HAS FOLLOWING STEPS

//get all the governance nfts and read out ids: use indexer

//get all the voters for the given referendum: use indexer

//for each voter query nfts

//check which nfts are in governance nft ids

//tally up all ayes, nays, abstain.

//read governance vote from delegation wallet

//if not in line with current tally, send vote extrinsic

export async function updateVote(api: ApiPromise, refIndex: string, blockNumber: number) {
    await sleep(20000); //give indexers 20 seconds to catch up
    //get all the proof of chaos nft IDS
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

    const allVotes = await fetchVotes(refIndex, blockNumber);

    //do formatting
    let formattedVotes: DecoratedConvictionVote[] = [];

    for (const vote of allVotes) {
        const formattedVote: DecoratedConvictionVote | undefined = formatCastingVoteIndexer(vote.voter, vote)
        if (formattedVote) {
            formattedVotes.push(formattedVote);
        }
    }

    // console.log(formattedVotes)

    // Create an array of promises for fetching NFTs for each voter
    const nftFetchPromises = formattedVotes.map(vote =>
        fetchNftsForVoter(vote, allNftIds)
    );

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
            } else if (vote.voteDirection == "Nay") {
                nays += count;
            } else {
                abstains += count;
            }
        }
    });

    console.log(`Ayes: ${ayes}, Nays: ${nays}, Abstains: ${abstains}`);

    let currentVoteDirection = VoteChoice.Abstain; // Default to "Aye", change based on counts

    // Determine the highest vote count
    if (nays > ayes && nays > abstains) {
        currentVoteDirection = VoteChoice.Nay;
    } else if (ayes > abstains && ayes > nays) {
        currentVoteDirection = VoteChoice.Aye;
    }

    //only continue if there are at least 20 separate voters with NFTs
    if (numberOfVotesWithNfts > 20) {
        //query the current on-chain vote for this ref
        const delegationWalletVote = await getAccountVote(refIndex, blockNumber);

        const formattedVote: DecoratedConvictionVote | undefined = delegationWalletVote ? formatCastingVoteIndexer(delegationWalletVote.voter, delegationWalletVote) : undefined

        // console.log(currentVoteDirection.toString())
        // console.log(formattedVote?.voteDirection)
        if (!formattedVote || formattedVote.voteDirection != currentVoteDirection.toString()) {
            //create vote extrinsic
            const balances = {
                aye: new BN(currentVoteDirection === VoteChoice.Aye ? 1 : 0),
                nay: new BN(currentVoteDirection === VoteChoice.Nay ? 1 : 0),
                abstain: new BN(currentVoteDirection === VoteChoice.Abstain ? 1 : 0)
            };
            //send vote extrinisc to chain
            await sendTransaction(api, currentVoteDirection, parseInt(refIndex), balances, 1, ayes, nays, abstains, !!formattedVote, formattedVote ? formattedVote.voteDirection : undefined);
        }
    }
}