import gql from 'graphql-tag';

export const QUERY_USER_VOTES = gql`
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