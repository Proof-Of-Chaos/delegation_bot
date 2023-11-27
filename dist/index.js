"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const helpers_1 = require("./helpers");
const chainConfig_1 = require("./chainConfig");
const keyring_1 = require("@polkadot/keyring");
const updateVote_1 = require("./updateVote");
require("@polkadot/api-augment");
async function main() {
    // Connect to a Kusama node
    const provider = new api_1.WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await api_1.ApiPromise.create({ provider });
    const account = await (0, helpers_1.initAccount)();
    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
        console.log(`New block: ${header.number}`);
        const blockNumber = header.number.toNumber();
        // Fetch the latest block
        const signedBlock = await api.rpc.chain.getBlock();
        // Get the API and events at the block hash
        const apiAt = await api.at(signedBlock.block.header.hash);
        const allRecords = await apiAt.query.system.events();
        // Iterate through the extrinsics in the block
        signedBlock.block.extrinsics.forEach(({ method, signer }, index) => {
            allRecords.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index))
                .forEach(({ event }) => {
                if (api.events.system.ExtrinsicSuccess.is(event)) {
                    // Process successful extrinsic
                    // Add your specific logic here, for example, checking if it's a delegation extrinsic
                    if (isDelegationExtrinsic(method.section, method.method) && method.args[1].toString() == "GZDxU5H28YzTrtRk7WAyGrbbpdQCdHNRUG6VKJbxpfo81bu") {
                        // Process delegation extrinsic
                        const track = chainConfig_1.kusama.tracks.find(t => t.id === parseInt(method.args[0].toString()));
                        const trackName = track ? track.name : "unknown";
                        const tweetMessage = `🚨 Delegation Wallet Update 🚨\n\n` +
                            `✨ New Delegation Added!\n` +
                            `- Amount: ${(0, helpers_1.formatAmount)(method.args[3].toString())} 🌟\n` +
                            `- Conviction: ${method.args[2].toString()}\n` +
                            `- Track: ${trackName}\n\n` +
                            `👉 Delegate now: GZDxU5H28YzTrtRk7WAyGrbbpdQCdHNRUG6VKJbxpfo81bu\n\n` +
                            `#ProofOfChaos #KusamaGovernance`;
                        console.log(tweetMessage);
                        (0, helpers_1.postTweet)(tweetMessage);
                    }
                    if (isConvictionVotingExtrinsic(method.section, method.method) && signer.toString() != (0, keyring_1.encodeAddress)(account.address, chainConfig_1.kusama.ss58Format)) {
                        let refId = '';
                        if (method.method === 'vote') {
                            refId = method.args[0].toString(); // For 'vote', the poll_index is the first argument
                        }
                        else if (method.method === 'removeVote') {
                            refId = method.args[1].toString(); // For 'removeVote', the poll_index is the second argument
                        }
                        else if (method.method === 'removeOtherVote') {
                            refId = method.args[2].toString(); // For 'removeOtherVote', the poll_index is the third argument
                        }
                        if (refId) {
                            (0, updateVote_1.updateVote)(api, refId, blockNumber);
                        }
                    }
                    // Add other specific extrinsic processing logic if needed
                }
                else if (api.events.system.ExtrinsicFailed.is(event)) {
                    // Process failed extrinsic
                    // You can add logic here if you need to handle failed extrinsics
                }
            });
        });
    });
    const isConvictionVotingExtrinsic = (section, method) => {
        const convictionVoteMethods = ['vote', 'removeVote', 'removeOtherVote'];
        const convictionVoteSection = 'convictionVoting';
        return section === convictionVoteSection && convictionVoteMethods.includes(method);
    };
    const isDelegationExtrinsic = (section, method) => {
        const convictionVoteMethod = 'delegate';
        const convictionVoteSection = 'convictionVoting';
        return section === convictionVoteSection && convictionVoteMethod === method;
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
