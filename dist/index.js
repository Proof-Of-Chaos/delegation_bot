"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("@polkadot/api");
const helpers_1 = require("./helpers");
const chainConfig_1 = require("./chainConfig");
const keyring_1 = require("@polkadot/keyring");
const updateVote_1 = require("./updateVote");
require("@polkadot/api-augment");
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
const isBatchCall = (method) => {
    return method.section === 'utility' && (method.method === 'batchAll' || method.method === 'batch');
};
const processConvictionVoting = (api, method, blockNumber) => {
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
};
async function main() {
    // Connect to a Kusama node
    const provider = new api_1.WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await api_1.ApiPromise.create({ provider });
    const account = await (0, helpers_1.initAccount)();
    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(async (header) => {
        console.log(`New block: ${header.number}`);
        const blockNumber = header.number.toNumber();
        // Fetch the latest block
        const signedBlock = await api.rpc.chain.getBlock();
        // Get the API and events at the block hash
        const apiAt = await api.at(signedBlock.block.header.hash);
        const allRecords = await apiAt.query.system.events();
        let allTracks = new Set(chainConfig_1.kusama.tracks.map(t => t.name)); // Set of all track names
        signedBlock.block.extrinsics.forEach((extrinsic, index) => {
            const { method, signer } = extrinsic;
            allRecords.filter(({ phase }) => phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index))
                .forEach(({ event }) => {
                if (api.events.system.ExtrinsicSuccess.is(event)) {
                    if (isBatchCall(method)) {
                        const innerCallsRaw = method.args[0];
                        const innerCalls = innerCallsRaw;
                        let delegationTracks = new Set();
                        let amountDelegated = "";
                        let conviction = "";
                        let processedDelegation = false;
                        innerCalls.forEach((innerCall) => {
                            if (isDelegationExtrinsic(innerCall.section, innerCall.method)) {
                                const trackId = parseInt(innerCall.args[0].toString());
                                const track = chainConfig_1.kusama.tracks.find(t => t.id === trackId);
                                if (track) {
                                    delegationTracks.add(track.name);
                                }
                                processedDelegation = true;
                                amountDelegated = (0, helpers_1.formatAmount)(innerCall.args[3].toString());
                                conviction = innerCall.args[2].toString();
                            }
                            else if (isConvictionVotingExtrinsic(method.section, method.method) && signer.toString() != (0, keyring_1.encodeAddress)(account.address, chainConfig_1.kusama.ss58Format)) {
                                processConvictionVoting(api, innerCall, blockNumber);
                            }
                        });
                        if (processedDelegation && delegationTracks.size > 0) {
                            let trackCount = delegationTracks.size.toString();
                            // Check if all tracks are covered
                            if (delegationTracks.size === allTracks.size && [...allTracks].every(name => delegationTracks.has(name))) {
                                trackCount = 'all';
                            }
                            const tweetMessage = `🚨 Delegation Wallet Update 🚨\n\n` +
                                `✨ New Delegation Added!\n` +
                                `- Amount: ${amountDelegated} 🌟\n` +
                                `- Conviction: ${conviction}\n` +
                                `- Track Count: ${trackCount}\n\n` +
                                `👉 Delegate now: GZDxU5H28YzTrtRk7WAyGrbbpdQCdHNRUG6VKJbxpfo81bu\n\n` +
                                `#ProofOfChaos #KusamaGovernance`;
                            // console.log(tweetMessage)
                            (0, helpers_1.postTweet)(tweetMessage);
                        }
                    }
                    else {
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
                            // console.log(tweetMessage)
                            (0, helpers_1.postTweet)(tweetMessage);
                        }
                        else if (isConvictionVotingExtrinsic(method.section, method.method) && signer.toString() != (0, keyring_1.encodeAddress)(account.address, chainConfig_1.kusama.ss58Format)) {
                            processConvictionVoting(api, method, blockNumber);
                        }
                    }
                }
            });
        });
    });
}
;
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
