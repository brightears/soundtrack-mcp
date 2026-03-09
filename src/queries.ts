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
