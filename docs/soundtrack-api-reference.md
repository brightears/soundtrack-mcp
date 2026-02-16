# Soundtrack Your Brand - API Reference

## Endpoint
`https://api.soundtrackyourbrand.com/v2` (GraphQL)

## Authentication
Basic Auth: `Authorization: Basic <base64_token>`

## Entity Hierarchy
Account > Location > SoundZone > Device

## Queries

### Introspection (me)
```graphql
query {
  me {
    ...on PublicAPIClient {
      accounts(first: 50) {
        edges {
          node {
            id
            businessName
            locations(first: 50) {
              edges {
                node {
                  id
                  name
                  soundZones(first: 50) {
                    edges {
                      node {
                        id
                        name
                        isPaired
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Now Playing
```graphql
query NowPlaying($soundZone: ID!) {
  nowPlaying(soundZone: $soundZone) {
    track {
      name
      artists { name }
      album {
        name
        image { url width height }
      }
    }
  }
}
```

### Sound Zone Details
```graphql
query SoundZone($id: ID!) {
  soundZone(id: $id) {
    id
    name
    isPaired
    device { id }
  }
}
```

## Mutations

### Set Volume
```graphql
mutation SetVolume($soundZone: ID!, $volume: Int!) {
  setVolume(input: { soundZone: $soundZone, volume: $volume }) {
    volume
  }
}
```

### Skip Track
```graphql
mutation SkipTrack($soundZone: ID!) {
  skipTrack(input: { soundZone: $soundZone }) {
    # returns next track info
  }
}
```

### Play / Pause
```graphql
mutation Play($soundZone: ID!) {
  play(input: { soundZone: $soundZone }) { ... }
}

mutation Pause($soundZone: ID!) {
  pause(input: { soundZone: $soundZone }) { ... }
}
```

## Subscriptions (WebSocket)
```graphql
subscription NowPlayingUpdate($soundZone: ID!) {
  nowPlayingUpdate(input: { soundZone: $soundZone }) {
    nowPlaying {
      track {
        name
        artists { name }
      }
    }
  }
}
```

## Rate Limits
- Starting tokens: 3600
- Recovery: 50 tokens/second
- Check headers: `x-ratelimiting-cost`, `x-ratelimiting-tokens-available`

## Pagination (Relay)
Uses `first`, `after` params with `edges { node }` and `pageInfo { hasNextPage, endCursor }` pattern.
