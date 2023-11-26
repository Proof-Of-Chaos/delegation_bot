"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const _1 = require(".");
async function main() {
    // Connect to a Kusama node
    const provider = new api_1.WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await api_1.ApiPromise.create({ provider });
    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(async (header) => {
        console.log(`New block: ${header.number}`);
        const blockNumber = header.number.toNumber();
        // Fetch the block hash
        const hash = await api.rpc.chain.getBlockHash(blockNumber);
        // Fetch the block
        const block = await api.rpc.chain.getBlock(hash);
        //just for testing
        await (0, _1.fetchData)(api, "300");
        // Iterate through the extrinsics in the block
        for (const extrinsic of block.block.extrinsics) {
            // Check for convictionVotes
            console.log(extrinsic.method.method);
            if (isConvictionVote(extrinsic)) {
                const { method: { args } } = extrinsic;
                const refId = args[0].toString(); //this is the poll_index 
                await (0, _1.fetchData)(api, refId);
            }
        }
    });
    function isConvictionVote(extrinsic) {
        const convictionVoteMethod = 'vote';
        const convictionVoteSection = 'convictionVoting';
        return extrinsic.method.section === convictionVoteSection && extrinsic.method.method === convictionVoteMethod;
    }
}
main().catch(console.error);
