import { ApiPromise, WsProvider } from '@polkadot/api';
import { initAccount, sendTelegramMessage } from './helpers';
import { kusama } from './chainConfig';
import { encodeAddress } from "@polkadot/keyring";
import { updateVote } from './updateVote';

async function main(): Promise<void> {
    // Connect to a Kusama node
    const provider = new WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await ApiPromise.create({ provider });
    const account = await initAccount();

    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async header => {
        console.log(`New block: ${header.number}`);

        const blockNumber = header.number.toNumber();
        // Fetch the block hash
        const hash = await api.rpc.chain.getBlockHash(blockNumber);
        // Fetch the block
        const block = await api.rpc.chain.getBlock(hash);
        // Iterate through the extrinsics in the block
        for (const extrinsic of block.block.extrinsics) {
            // Check for convictionVotes
            if (isConvictionVotingExtrinsic(extrinsic) && extrinsic.signer.toString() != encodeAddress(account.address, kusama.ss58Format)) {
                const { method: { args, method } } = extrinsic;
                let refId = '';

                if (method === 'vote') {
                    refId = args[0].toString(); // For 'vote', the poll_index is the first argument
                } else if (method === 'removeVote') {
                    refId = args[1].toString(); // For 'removeVote', the poll_index is the second argument
                } else if (method === 'removeOtherVote') {
                    refId = args[2].toString(); // For 'removeOtherVote', the poll_index is the third argument
                }

                if (refId) {
                    updateVote(api, refId, blockNumber);
                }
                updateVote(api, refId, blockNumber);
            }
        }
    });

    const isConvictionVotingExtrinsic = (extrinsic: any): boolean => {
        const convictionVoteMethods = ['vote', 'removeVote', 'removeOtherVote'];
        const convictionVoteSection = 'convictionVoting';

        return extrinsic.method.section === convictionVoteSection && convictionVoteMethods.includes(extrinsic.method.method);
    };


}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error);
        sendTelegramMessage(`Error in main execution: ${error.message}`);
    } else {
        console.error('An unknown error occurred');
        sendTelegramMessage('An unknown error occurred in main execution');
    }
});


