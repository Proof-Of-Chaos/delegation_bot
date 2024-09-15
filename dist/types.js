"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VoteChoice = exports.SubstrateChain = void 0;
var SubstrateChain;
(function (SubstrateChain) {
    SubstrateChain["Kusama"] = "kusama";
    SubstrateChain["Polkadot"] = "polkadot";
    SubstrateChain["Westend"] = "westend";
    SubstrateChain["Rococo"] = "rococo";
    SubstrateChain["Local"] = "local";
})(SubstrateChain = exports.SubstrateChain || (exports.SubstrateChain = {}));
var VoteChoice;
(function (VoteChoice) {
    VoteChoice["Aye"] = "Aye";
    VoteChoice["Nay"] = "Nay";
    VoteChoice["Split"] = "Split";
    VoteChoice["Abstain"] = "Abstain";
})(VoteChoice = exports.VoteChoice || (exports.VoteChoice = {}));
