"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUERY_USER_VOTES = void 0;
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.QUERY_USER_VOTES = (0, graphql_tag_1.default) `
  query UserVotesQuery($filterCastingVote: CastingVotingFilter, $referendumId: String!, $after: Cursor) {
    _metadata {
      lastProcessedHeight
      indexerHealthy
    }
    castingVotings(
      orderBy: REFERENDUM_ID_ASC,
      filter: $filterCastingVote,
      after: $after
    ) {
      nodes {
        referendumId
        standardVote
        voter
        splitVote
        splitAbstainVote
        referendum {
          trackId
        }
        nodeId
      }
      pageInfo {
        startCursor
        endCursor
        hasNextPage
      }
    }
    referendum(id: $referendumId) {
      finished
    }
  }
`;
