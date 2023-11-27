import { ApiPromise, WsProvider } from '@polkadot/api';
import { formatAmount, initAccount, postTweet, sendTelegramMessage } from './helpers';
import { kusama } from './chainConfig';
import { encodeAddress } from "@polkadot/keyring";
import { updateVote } from './updateVote';
import '@polkadot/api-augment';

const isConvictionVotingExtrinsic = (section: string, method: string): boolean => {
    const convictionVoteMethods = ['vote', 'removeVote', 'removeOtherVote'];
    const convictionVoteSection = 'convictionVoting';

    return section === convictionVoteSection && convictionVoteMethods.includes(method);
};

const isDelegationExtrinsic = (section: string, method: string): boolean => {
    const convictionVoteMethod = 'delegate';
    const convictionVoteSection = 'convictionVoting';

    return section === convictionVoteSection && convictionVoteMethod === method;
};

const isBatchCall = (method: any): boolean => {
    return method.section === 'utility' && (method.method === 'batchAll' || method.method === 'batch');
};


const processConvictionVoting = (api: ApiPromise, method: any, blockNumber: number) => {
    let refId = '';
    if (method.method === 'vote') {
        refId = method.args[0].toString(); // For 'vote', the poll_index is the first argument
    } else if (method.method === 'removeVote') {
        refId = method.args[1].toString(); // For 'removeVote', the poll_index is the second argument
    } else if (method.method === 'removeOtherVote') {
        refId = method.args[2].toString(); // For 'removeOtherVote', the poll_index is the third argument
    }

    if (refId) {
        updateVote(api, refId, blockNumber);
    }
};


async function main(): Promise<void> {
    // Connect to a Kusama node
    const provider = new WsProvider('wss://kusama-rpc.polkadot.io/');
    const api = await ApiPromise.create({ provider });
    const account = await initAccount();

    // Subscribe to new blocks
    const unsubscribe = await api.rpc.chain.subscribeNewHeads(async header => {
        console.log(`New block: ${header.number}`);

        const blockNumber = header.number.toNumber();
        // Fetch the latest block
        const signedBlock = await api.rpc.chain.getBlock();
        // Get the API and events at the block hash
        const apiAt = await api.at(signedBlock.block.header.hash);
        const allRecords = await apiAt.query.system.events();
        let allTracks = new Set(kusama.tracks.map(t => t.name)); // Set of all track names

        signedBlock.block.extrinsics.forEach((extrinsic, index) => {
            const { method, signer } = extrinsic;
            allRecords.filter(({ phase }) =>
                phase.isApplyExtrinsic && phase.asApplyExtrinsic.eq(index)
            )
                .forEach(({ event }) => {
                    if (api.events.system.ExtrinsicSuccess.is(event)) {
                        if (isBatchCall(method)) {
                            const innerCallsRaw = method.args[0];
                            const innerCalls = (innerCallsRaw as unknown as any[]);
                            let delegationTracks = new Set();
                            let amountDelegated = "";
                            let conviction = "";
                            let processedDelegation = false;

                            innerCalls.forEach((innerCall: any) => {
                                if (isDelegationExtrinsic(innerCall.section, innerCall.method)) {
                                    const trackId = parseInt(innerCall.args[0].toString());
                                    const track = kusama.tracks.find(t => t.id === trackId);
                                    if (track) {
                                        delegationTracks.add(track.name);
                                    }
                                    processedDelegation = true;
                                    amountDelegated = formatAmount(innerCall.args[3].toString());
                                    conviction = innerCall.args[2].toString();

                                } else if (isConvictionVotingExtrinsic(method.section, method.method) && signer.toString() != encodeAddress(account.address, kusama.ss58Format)) {
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
                                postTweet(tweetMessage);
                            }
                        } else {
                            if (isDelegationExtrinsic(method.section, method.method) && method.args[1].toString() == "GZDxU5H28YzTrtRk7WAyGrbbpdQCdHNRUG6VKJbxpfo81bu") {
                                // Process delegation extrinsic
                                const track = kusama.tracks.find(t => t.id === parseInt(method.args[0].toString()));
                                const trackName = track ? track.name : "unknown";
                                const tweetMessage = `🚨 Delegation Wallet Update 🚨\n\n` +
                                    `✨ New Delegation Added!\n` +
                                    `- Amount: ${formatAmount(method.args[3].toString())} 🌟\n` +
                                    `- Conviction: ${method.args[2].toString()}\n` +
                                    `- Track: ${trackName}\n\n` +
                                    `👉 Delegate now: GZDxU5H28YzTrtRk7WAyGrbbpdQCdHNRUG6VKJbxpfo81bu\n\n` +
                                    `#ProofOfChaos #KusamaGovernance`;

                                // console.log(tweetMessage)
                                postTweet(tweetMessage);
                            }
                            else if (isConvictionVotingExtrinsic(method.section, method.method) && signer.toString() != encodeAddress(account.address, kusama.ss58Format)) {
                                processConvictionVoting(api, method, blockNumber);
                            }
                        }
                    }
                });

        });


    });
};

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(error);
        sendTelegramMessage(`Error in main execution: ${error.message}`);
    } else {
        console.error('An unknown error occurred');
        sendTelegramMessage('An unknown error occurred in main execution');
    }
});


