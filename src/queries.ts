// ── Introspection ──────────────────────────────────────────────────────────

export const ME_ACCOUNTS = `
query ListAccounts {
  me {
    ... on PublicAPIClient {
      accounts(first: 100) {
        edges {
          node {
            id
            businessName
          }
        }
      }
    }
  }
}`;

export const ACCOUNT_LOCATIONS = `
query AccountLocations($accountId: ID!) {
  account(id: $accountId) {
    id
    businessName
    locations(first: 100) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}`;

export const LOCATION_SOUND_ZONES = `
query LocationSoundZones($accountId: ID!, $first: Int) {
  account(id: $accountId) {
    locations(first: 100) {
      edges {
        node {
          id
          name
          soundZones(first: $first) {
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
}`;

// ── Now Playing ────────────────────────────────────────────────────────────

export const NOW_PLAYING = `
query NowPlaying($soundZone: ID!) {
  nowPlaying(soundZone: $soundZone) {
    track {
      name
      artists {
        name
      }
      album {
        name
        image {
          url
          width
          height
        }
      }
    }
  }
}`;

// ── Sound Zone Details ─────────────────────────────────────────────────────

export const SOUND_ZONE_DETAILS = `
query SoundZoneDetails($id: ID!) {
  soundZone(id: $id) {
    id
    name
    isPaired
  }
}`;

// ── Mutations ──────────────────────────────────────────────────────────────

export const SET_VOLUME = `
mutation SetVolume($soundZone: ID!, $volume: Int!) {
  setVolume(input: { soundZone: $soundZone, volume: $volume }) {
    volume
  }
}`;

export const SKIP_TRACK = `
mutation SkipTrack($soundZone: ID!) {
  skipTrack(input: { soundZone: $soundZone }) {
    nowPlaying {
      track {
        name
        artists {
          name
        }
      }
    }
  }
}`;

export const PLAY = `
mutation Play($soundZone: ID!) {
  play(input: { soundZone: $soundZone }) {
    playing
  }
}`;

export const PAUSE = `
mutation Pause($soundZone: ID!) {
  pause(input: { soundZone: $soundZone }) {
    playing
  }
}`;

// ── Full Overview ──────────────────────────────────────────────────────────

export const FULL_OVERVIEW = `
query FullOverview {
  me {
    ... on PublicAPIClient {
      accounts(first: 100) {
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
}`;
