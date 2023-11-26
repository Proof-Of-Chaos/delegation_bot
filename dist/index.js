"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const helpers_1 = require("./helpers");
const chainConfig_1 = require("./chainConfig");
const keyring_1 = require("@polkadot/keyring");
const updateVote_1 = require("./updateVote");
async function main() {
    // Connect to a Kusama node
    const provider = new api_1.WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await api_1.ApiPromise.create({ provider });
    const account = await (0, helpers_1.initAccount)();
    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
        console.log(`New block: ${header.number}`);
        const blockNumber = header.number.toNumber();
        // Fetch the block hash
        const hash = await api.rpc.chain.getBlockHash(blockNumber);
        // Fetch the block
        const block = await api.rpc.chain.getBlock(hash);
        // Iterate through the extrinsics in the block
        for (const extrinsic of block.block.extrinsics) {
            // Check for convictionVotes
            if (isConvictionVote(extrinsic) && extrinsic.signer.toString() != (0, keyring_1.encodeAddress)(account.address, chainConfig_1.kusama.ss58Format)) {
                const { method: { args } } = extrinsic;
                const refId = args[0].toString(); //this is the poll_index 
                (0, updateVote_1.updateVote)(api, refId, blockNumber);
            }
        }
    });
    const isConvictionVote = (extrinsic) => {
        const convictionVoteMethods = ['vote', 'removeVote', 'removeOtherVote'];
        const convictionVoteSection = 'convictionVoting';
        return extrinsic.method.section === convictionVoteSection && convictionVoteMethods.includes(extrinsic.method.method);
    };
}
main().catch((error) => {
    if (error instanceof Error) {
        console.error(error);
        (0, helpers_1.sendTelegramMessage)(`Error in main execution: ${error.message}`);
    }
    else {
        console.error('An unknown error occurred');
        (0, helpers_1.sendTelegramMessage)('An unknown error occurred in main execution');
    }
});
