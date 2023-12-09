import { ApiPromise, WsProvider } from "@polkadot/api";
import { BN } from "@polkadot/util";

export type CastingVotingNode = {
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

export type DelegatorVotingNode = {
    vote: Vote;
    parent: {
        referendumId: string;
        voter: string;
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
    };
};

export type Vote = {
    amount: string;
    conviction: string;
};


export type ResponseDataWalletVotesIndexer = {
    _metadata: {
        lastProcessedHeight: number;
        indexerHealthy: boolean;
    };
    castingVotings: {
        nodes: CastingVotingNode[];
        pageInfo: {
            hasNextPage: boolean,
            endCursor: string
        }
    };
    referendum: {
        finished: boolean;
    }
};

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

export type Endpoint = {
    name: string;
    url: string;
};

export type ChainType = "relay" | "assetHub" | "bridgeHub";

export type EndpointMap = {
    [key in ChainType]?: Endpoint[];
};

export enum SubstrateChain {
    Kusama = "kusama",
    Polkadot = "polkadot",
    Westend = "westend",
    Rococo = "rococo",
    Local = "local",
}


export type ChainConfig = {
    name: SubstrateChain;
    symbol: string;
    decimals: number;
    ss58Format: number;
    blockTime: number;
    endpoints: EndpointMap;
    selectedEndpoint: number;
    selectedAssetHubEndpoint: number;
    tracks: any[];
    provider?: WsProvider;
    assetHubProvider?: WsProvider;
    api?: ApiPromise;
    assetHubApi?: ApiPromise;
    subscan?: string;
    subscanAssetHub?: string;
    kodadot?: string;
};

export enum VoteChoice {
    Aye = "Aye",
    Nay = "Nay",
    Split = "Split",
    Abstain = "Abstain",
}
