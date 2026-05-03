// ── Introspection (paginated) ──────────────────────────────────────────────

export const ME_ACCOUNTS_PAGE = `
query ListAccounts($first: Int!, $after: String) {
  me {
    ... on PublicAPIClient {
      accounts(first: $first, after: $after) {
        edges {
          node {
            id
            businessName
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}`;

// ── Direct Account Lookup ──────────────────────────────────────────────────

export const ACCOUNT_BY_ID = `
query AccountById($id: ID!) {
  account(id: $id) {
    id
    businessName
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
mutation SetVolume($soundZone: ID!, $volume: Volume!) {
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

// ── Account Overview (for scoped accounts) ─────────────────────────────────

export const ACCOUNT_OVERVIEW = `
query AccountOverview($id: ID!) {
  account(id: $id) {
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
}`;

// ── Library & Discovery ──────────────────────────────────────────────────────

export const LIST_PLAYLISTS = `
query ListPlaylists($accountId: ID!, $first: Int) {
  account(id: $accountId) {
    id
    businessName
    musicLibrary {
      playlists(first: $first) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
}`;

export const LIST_SCHEDULES = `
query ListSchedules($accountId: ID!, $first: Int) {
  account(id: $accountId) {
    id
    businessName
    musicLibrary {
      schedules(first: $first) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
}`;

export const SEARCH_MUSIC = `
query SearchMusic($query: String!, $type: SearchType!, $first: Int) {
  search(query: $query, type: $type, first: $first) {
    edges {
      node {
        __typename
        ... on Playlist { id name }
        ... on Track { id name artists { name } }
        ... on Artist { id name }
        ... on Album { id name artists { name } }
      }
    }
  }
}`;

export const BROWSE_CATEGORIES = `
query BrowseCategories {
  browseCategories {
    edges {
      node {
        id
        name
        slug
      }
    }
  }
}`;

export const BROWSE_CATEGORY_PLAYLISTS = `
query BrowseCategoryPlaylists($id: ID!, $first: Int) {
  browseCategory(id: $id) {
    id
    name
    playlists(first: $first) {
      edges {
        node {
          id
          name
        }
      }
    }
  }
}`;

export const PLAYLIST_TRACKS = `
query PlaylistTracks($id: ID!, $first: Int) {
  playlist(id: $id) {
    id
    name
    tracks(first: $first) {
      edges {
        node {
          id
          name
          artists {
            name
          }
        }
      }
    }
  }
}`;

// ── Schedule Management ──────────────────────────────────────────────────────

export const SCHEDULE_DETAILS = `
query ScheduleDetails($id: ID!) {
  schedule(id: $id) {
    id
    name
    description
    presentAs
    slots {
      id
      rrule
      start
      duration
      playlistIds
    }
  }
}`;

export const CREATE_SCHEDULE = `
mutation CreateSchedule($input: CreateScheduleInput!) {
  createSchedule(input: $input) {
    id
    name
    slots {
      id
    }
  }
}`;

export const UPDATE_SCHEDULE = `
mutation UpdateSchedule($input: UpdateScheduleInput!) {
  updateSchedule(input: $input) {
    id
    name
    slots {
      id
    }
  }
}`;

// ── Zone Assignment ──────────────────────────────────────────────────────────

export const ASSIGN_SOURCE = `
mutation AssignSource($input: SoundZoneAssignSourceInput!) {
  soundZoneAssignSource(input: $input) {
    soundZones
    source {
      ... on Schedule { id name }
      ... on Playlist { id name }
    }
  }
}`;

export const ZONE_SOURCE = `
query ZoneSource($id: ID!) {
  soundZone(id: $id) {
    id
    name
    playFrom {
      ... on Playlist { id name }
      ... on Schedule { id name }
    }
  }
}`;

// ── Content Management ───────────────────────────────────────────────────────

export const CREATE_MANUAL_PLAYLIST = `
mutation CreateManualPlaylist($input: CreateManualPlaylistInput!) {
  createManualPlaylist(input: $input) {
    id
    name
  }
}`;

export const QUEUE_TRACKS = `
mutation QueueTracks($input: SoundZoneQueueTracksInput!) {
  soundZoneQueueTracks(input: $input) {
    status
  }
}`;

export const BLOCK_TRACK = `
mutation BlockTrack($input: BlockTrackInput!) {
  blockTrack(input: $input) {
    __typename
  }
}`;

export const ADD_TO_MUSIC_LIBRARY = `
mutation AddToMusicLibrary($input: AddToMusicLibraryInput!) {
  addToMusicLibrary(input: $input) {
    musicLibrary {
      id
    }
  }
}`;

export const REMOVE_FROM_MUSIC_LIBRARY = `
mutation RemoveFromMusicLibrary($input: RemoveFromMusicLibraryInput!) {
  removeFromMusicLibrary(input: $input) {
    musicLibrary {
      id
    }
  }
}`;

// ── AI Features ──────────────────────────────────────────────────────────────

export const GENERATE_PLAYLIST = `
query GeneratePlaylist($query: String!, $market: IsoCountry) {
  getMusicFromPrompt(query: $query, market: $market) {
    playlists {
      id
      name
    }
    trackingId
  }
}`;

// ── Admin: Account Lifecycle ────────────────────────────────────────────────

export const ACCOUNT_REGISTER = `
mutation AccountRegister($input: AccountRegisterInput!) {
  accountRegister(input: $input) {
    account { id businessName plan country }
  }
}`;

export const ACCOUNT_ADD_USER = `
mutation AccountAddUser($input: AccountAddUserInput!) {
  accountAddUser(input: $input) {
    user { __typename }
  }
}`;

// ── Admin: Location Lifecycle ───────────────────────────────────────────────

export const LOCATION_CREATE = `
mutation LocationCreate($input: LocationCreateInput!) {
  locationCreate(input: $input) {
    location {
      id name
      soundZones(first: 10) { edges { node { id name } } }
    }
  }
}`;

export const LOCATION_UPDATE = `
mutation LocationUpdate($input: LocationUpdateInput!) {
  locationUpdate(input: $input) {
    location { id name }
  }
}`;

export const LOCATION_DELETE = `
mutation LocationDelete($input: LocationDeleteInput!) {
  locationDelete(input: $input) {
    location { id name }
  }
}`;

export const LOCATION_ACCOUNT_LOOKUP = `
query LocationAccountLookup($id: ID!) {
  location(id: $id) { id name account { id } }
}`;

// ── Admin: Sound Zone Lifecycle ─────────────────────────────────────────────

export const SOUND_ZONE_CREATE = `
mutation SoundZoneCreate($input: SoundZoneCreateInput!) {
  soundZoneCreate(input: $input) {
    soundZone { id name }
  }
}`;

export const SOUND_ZONE_UPDATE = `
mutation SoundZoneUpdate($input: SoundZoneUpdateMutationInput!) {
  soundZoneUpdate(input: $input) {
    soundZone { id name }
  }
}`;

export const SOUND_ZONE_DELETE = `
mutation SoundZoneDelete($input: SoundZoneDeleteInput!) {
  soundZoneDelete(input: $input) {
    soundZone { id name }
  }
}`;

export const SOUND_ZONE_INITIATE_PAIRING = `
mutation SoundZoneInitiatePairing($input: SoundZoneInitiatePairingInput!) {
  soundZoneInitiatePairing(input: $input) {
    device { pairingCode }
  }
}`;

export const SOUND_ZONE_UNPAIR = `
mutation SoundZoneUnpair($input: SoundZoneUnpairInput!) {
  soundZoneUnpair(input: $input) {
    soundZone { id name isPaired }
  }
}`;

export const SOUND_ZONE_ACCOUNT_LOOKUP = `
query SoundZoneAccountLookup($id: ID!) {
  soundZone(id: $id) { id name account { id } }
}`;

// ── Admin: Subscription Lifecycle (operator-gated) ──────────────────────────

export const SUBSCRIPTION_ACTIVATE = `
mutation SubscriptionActivate($input: SubscriptionActivateInput!) {
  subscriptionActivate(input: $input) {
    soundZone {
      id name
      account { id businessName plan }
    }
  }
}`;

export const SUBSCRIPTION_CANCEL = `
mutation SubscriptionCancel($input: SubscriptionCancelInput!) {
  subscriptionCancel(input: $input) {
    soundZone { id name }
  }
}`;

// ── Admin: Verification (read-only, useful after mutations) ─────────────────

export const ACCOUNT_BILLING_STATUS = `
query AccountBillingStatus($id: ID!) {
  account(id: $id) {
    id businessName plan country
    soundZoneStatuses { status total }
    billing {
      subscription {
        activeFrom activeTo
        billingCycle
        activeStreamingSubscriptions
        checkoutState
      }
    }
  }
}`;

export const SOUND_ZONE_FULL_STATE = `
query SoundZoneFullState($id: ID!) {
  soundZone(id: $id) {
    id name isPaired online
    account { id }
    subscription { state isActive activeUntil }
    playFrom {
      __typename
      ... on Schedule { id name }
      ... on Playlist { id name }
    }
  }
}`;

export const SOUND_ZONE_PLAYBACK_HISTORY = `
query SoundZonePlaybackHistory($id: ID!, $first: Int!) {
  soundZone(id: $id) {
    id name
    playbackHistory(first: $first) {
      edges {
        node {
          startedAt finishedAt
          playFrom {
            __typename
            ... on Schedule { id name }
            ... on Playlist { id name }
          }
          track {
            name
            artists { name }
          }
        }
      }
    }
  }
}`;
