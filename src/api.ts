import { Router, Request, Response } from "express";
import { graphql, extractNodes, getScopedAccountIds } from "./client.js";
import * as Q from "./queries.js";

const router = Router();

// ── Types ──────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  businessName: string;
  locations?: { edges: Array<{ node: Location }> };
}

interface Location {
  id: string;
  name: string;
  soundZones?: { edges: Array<{ node: SoundZone }> };
}

interface SoundZone {
  id: string;
  name: string;
  isPaired: boolean;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface AccountsPageData {
  me: {
    accounts: {
      edges: Array<{ node: Account }>;
      pageInfo: PageInfo;
    };
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function fetchAllAccounts(): Promise<Account[]> {
  const all: Account[] = [];
  let cursor: string | null = null;
  let hasMore = true;

  while (hasMore) {
    const res: { data?: AccountsPageData } =
      await graphql<AccountsPageData>(Q.ME_ACCOUNTS_PAGE, {
        first: 100,
        after: cursor,
      });
    const page: AccountsPageData["me"]["accounts"] =
      res.data!.me.accounts;
    const nodes: Account[] = extractNodes(page);
    all.push(...nodes);
    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }
  return all;
}

async function fetchAccountsByIds(ids: string[]): Promise<Account[]> {
  const results: Account[] = [];
  for (const id of ids) {
    try {
      const res = await graphql<{ account: Account }>(Q.ACCOUNT_BY_ID, { id });
      if (res.data?.account) results.push(res.data.account);
    } catch {
      // skip
    }
  }
  return results;
}

function wrap(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response) => void {
  return (req, res) => {
    fn(req, res).catch((err: Error) => {
      console.error("API error:", err.message);
      res.status(500).json({ error: err.message });
    });
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// GET /api/accounts
router.get(
  "/accounts",
  wrap(async (_req, res) => {
    const scopedIds =
      (res.locals.scopedAccountIds as string[] | undefined) ??
      getScopedAccountIds();
    const accounts = scopedIds
      ? await fetchAccountsByIds(scopedIds)
      : await fetchAllAccounts();

    res.json({
      count: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.businessName.trim(),
      })),
    });
  })
);

// GET /api/accounts/search?name=hilton
router.get(
  "/accounts/search",
  wrap(async (req, res) => {
    const name = (req.query.name as string) || "";
    if (!name) {
      res.status(400).json({ error: "name query parameter is required" });
      return;
    }

    const scopedIds =
      (res.locals.scopedAccountIds as string[] | undefined) ??
      getScopedAccountIds();
    const term = name.toLowerCase();
    let matches: Account[];

    if (scopedIds) {
      const accounts = await fetchAccountsByIds(scopedIds);
      matches = accounts.filter((a) =>
        a.businessName.toLowerCase().includes(term)
      );
    } else {
      matches = [];
      let cursor: string | null = null;
      let hasMore = true;
      while (hasMore) {
        const res: { data?: AccountsPageData } =
          await graphql<AccountsPageData>(Q.ME_ACCOUNTS_PAGE, {
            first: 100,
            after: cursor,
          });
        const page: AccountsPageData["me"]["accounts"] =
          res.data!.me.accounts;
        const nodes: Account[] = extractNodes(page);
        for (const a of nodes) {
          if (a.businessName.toLowerCase().includes(term)) matches.push(a);
        }
        hasMore = page.pageInfo.hasNextPage;
        cursor = page.pageInfo.endCursor;
      }
    }

    res.json({
      count: matches.length,
      query: name,
      accounts: matches.map((a) => ({
        id: a.id,
        name: a.businessName.trim(),
      })),
    });
  })
);

// GET /api/accounts/:accountId/locations
router.get(
  "/accounts/:accountId/locations",
  wrap(async (req, res) => {
    const r = await graphql<{ account: Account }>(Q.ACCOUNT_LOCATIONS, {
      accountId: req.params.accountId,
    });
    const account = r.data!.account;
    const locations = extractNodes(account.locations!);

    res.json({
      account: account.businessName.trim(),
      count: locations.length,
      locations: locations.map((l) => ({ id: l.id, name: l.name.trim() })),
    });
  })
);

// GET /api/accounts/:accountId/zones
router.get(
  "/accounts/:accountId/zones",
  wrap(async (req, res) => {
    const r = await graphql<{
      account: { locations: { edges: Array<{ node: Location }> } };
    }>(Q.LOCATION_SOUND_ZONES, {
      accountId: req.params.accountId,
      first: 50,
    });

    const locations = extractNodes(r.data!.account.locations);
    const result = locations.map((loc) => {
      const zones = loc.soundZones ? extractNodes(loc.soundZones) : [];
      return {
        location: loc.name.trim(),
        locationId: loc.id,
        zones: zones.map((z) => ({
          id: z.id,
          name: z.name,
          isPaired: z.isPaired,
        })),
      };
    });

    res.json({ locations: result });
  })
);

// GET /api/zones/:zoneId/now-playing
router.get(
  "/zones/:zoneId/now-playing",
  wrap(async (req, res) => {
    const r = await graphql<{
      nowPlaying: {
        track: {
          name: string;
          artists: Array<{ name: string }>;
          album?: { name: string; image?: { url: string } };
        };
      } | null;
    }>(Q.NOW_PLAYING, { soundZone: req.params.zoneId });

    const np = r.data!.nowPlaying;
    if (!np?.track) {
      res.json({ playing: false, message: "Nothing currently playing" });
      return;
    }

    res.json({
      playing: true,
      track: np.track.name,
      artists: np.track.artists.map((a) => a.name),
      album: np.track.album?.name || null,
      albumArt: np.track.album?.image?.url || null,
    });
  })
);

// POST /api/zones/:zoneId/volume  { "volume": 8 }
router.post(
  "/zones/:zoneId/volume",
  wrap(async (req, res) => {
    const volume = req.body.volume;
    if (typeof volume !== "number" || volume < 0) {
      res.status(400).json({ error: "volume must be a non-negative number" });
      return;
    }

    const r = await graphql<{ setVolume: { volume: number } }>(Q.SET_VOLUME, {
      soundZone: req.params.zoneId,
      volume,
    });

    res.json({ volume: r.data!.setVolume.volume });
  })
);

// POST /api/zones/:zoneId/skip
router.post(
  "/zones/:zoneId/skip",
  wrap(async (req, res) => {
    const r = await graphql<{
      skipTrack: {
        nowPlaying: {
          track: { name: string; artists: Array<{ name: string }> };
        };
      };
    }>(Q.SKIP_TRACK, { soundZone: req.params.zoneId });

    const track = r.data!.skipTrack?.nowPlaying?.track;
    if (track) {
      res.json({
        skipped: true,
        nowPlaying: {
          track: track.name,
          artists: track.artists.map((a) => a.name),
        },
      });
    } else {
      res.json({ skipped: true });
    }
  })
);

// POST /api/zones/:zoneId/play
router.post(
  "/zones/:zoneId/play",
  wrap(async (req, res) => {
    await graphql(Q.PLAY, { soundZone: req.params.zoneId });
    res.json({ status: "playing" });
  })
);

// POST /api/zones/:zoneId/pause
router.post(
  "/zones/:zoneId/pause",
  wrap(async (req, res) => {
    await graphql(Q.PAUSE, { soundZone: req.params.zoneId });
    res.json({ status: "paused" });
  })
);

// ── Library & Discovery ──────────────────────────────────────────────────────

// GET /api/accounts/:accountId/playlists
router.get(
  "/accounts/:accountId/playlists",
  wrap(async (req, res) => {
    const r = await graphql<{
      account: {
        businessName: string;
        musicLibrary: {
          playlists: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
        };
      };
    }>(Q.LIST_PLAYLISTS, {
      accountId: req.params.accountId as string,
      first: 50,
    });

    const playlists = r.data!.account.musicLibrary.playlists.edges.map(
      (e) => e.node
    );
    res.json({
      account: r.data!.account.businessName.trim(),
      count: playlists.length,
      playlists,
    });
  })
);

// GET /api/accounts/:accountId/schedules
router.get(
  "/accounts/:accountId/schedules",
  wrap(async (req, res) => {
    const r = await graphql<{
      account: {
        businessName: string;
        musicLibrary: {
          schedules: {
            edges: Array<{ node: { id: string; name: string } }>;
          };
        };
      };
    }>(Q.LIST_SCHEDULES, {
      accountId: req.params.accountId as string,
      first: 50,
    });

    const schedules = r.data!.account.musicLibrary.schedules.edges.map(
      (e) => e.node
    );
    res.json({
      account: r.data!.account.businessName.trim(),
      count: schedules.length,
      schedules,
    });
  })
);

// GET /api/search?query=jazz&type=playlist&limit=10
router.get(
  "/search",
  wrap(async (req, res) => {
    const query = (req.query.query as string) || "";
    const type = (req.query.type as string) || "playlist";
    const limit = parseInt((req.query.limit as string) || "10", 10);

    if (!query) {
      res.status(400).json({ error: "query parameter is required" });
      return;
    }

    const r = await graphql<{
      search: {
        edges: Array<{
          node: {
            __typename: string;
            id: string;
            name: string;
            artists?: Array<{ name: string }>;
          };
        }>;
      };
    }>(Q.SEARCH_MUSIC, { query, type, first: limit });

    const results = r.data!.search.edges.map((e) => ({
      type: e.node.__typename,
      id: e.node.id,
      name: e.node.name,
      artists: e.node.artists?.map((a) => a.name) || undefined,
    }));

    res.json({ count: results.length, query, type, results });
  })
);

// GET /api/categories and GET /api/categories/:categoryId/playlists
router.get(
  "/categories/:categoryId/playlists",
  wrap(async (req, res) => {
    const r = await graphql<{
      browseCategory: {
        name: string;
        playlists: {
          edges: Array<{ node: { id: string; name: string } }>;
        };
      };
    }>(Q.BROWSE_CATEGORY_PLAYLISTS, {
      id: req.params.categoryId as string,
      first: 30,
    });

    const playlists = r.data!.browseCategory.playlists.edges.map(
      (e) => e.node
    );
    res.json({
      category: r.data!.browseCategory.name,
      count: playlists.length,
      playlists,
    });
  })
);

router.get(
  "/categories",
  wrap(async (_req, res) => {
    const r = await graphql<{
      browseCategories: {
        edges: Array<{ node: { id: string; name: string; slug: string } }>;
      };
    }>(Q.BROWSE_CATEGORIES, {});

    const categories = r.data!.browseCategories.edges.map((e) => e.node);
    res.json({ count: categories.length, categories });
  })
);

// GET /api/playlists/:playlistId/tracks
router.get(
  "/playlists/:playlistId/tracks",
  wrap(async (req, res) => {
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const r = await graphql<{
      playlist: {
        name: string;
        tracks: {
          edges: Array<{
            node: {
              id: string;
              name: string;
              artists: Array<{ name: string }>;
            };
          }>;
        };
      };
    }>(Q.PLAYLIST_TRACKS, {
      id: req.params.playlistId as string,
      first: limit,
    });

    const tracks = r.data!.playlist.tracks.edges.map((e) => ({
      id: e.node.id,
      name: e.node.name,
      artists: e.node.artists.map((a) => a.name),
    }));
    res.json({
      playlist: r.data!.playlist.name,
      count: tracks.length,
      tracks,
    });
  })
);

// ── Schedule Management ──────────────────────────────────────────────────────

// Helper: convert simplified slot format to API format
function convertSlots(
  slots: Array<{
    playlist_id: string;
    days: string;
    start_time: string;
    duration_hours: number;
  }>
) {
  const DAY_MAP: Record<string, string> = {
    daily: "MO,TU,WE,TH,FR,SA,SU",
    weekdays: "MO,TU,WE,TH,FR",
    weekends: "SA,SU",
  };
  return slots.flatMap((s) => {
    const days = (DAY_MAP[s.days] || s.days).split(",");
    const [hh, mm] = s.start_time.split(":");
    const start = `${hh.padStart(2, "0")}${(mm || "00").padStart(2, "0")}00`;
    const duration = Math.round(s.duration_hours * 3600000);
    return days.map((day) => ({
      rrule: `FREQ=WEEKLY;BYDAY=${day.trim()}`,
      start,
      duration,
      playlistIds: [s.playlist_id],
    }));
  });
}

// POST /api/accounts/:accountId/schedules
router.post(
  "/accounts/:accountId/schedules",
  wrap(async (req, res) => {
    const { name, description, slots } = req.body;
    if (!name || !slots || !Array.isArray(slots) || slots.length === 0) {
      res
        .status(400)
        .json({ error: "name and slots (non-empty array) are required" });
      return;
    }

    const input: Record<string, unknown> = {
      ownerId: req.params.accountId as string,
      name,
      presentAs: "daily",
      slots: convertSlots(slots),
    };
    if (description) input.description = description;

    const r = await graphql<{
      createSchedule: {
        id: string;
        name: string;
        slots: Array<{ id: string }>;
      };
    }>(Q.CREATE_SCHEDULE, { input });

    res.json({
      id: r.data!.createSchedule.id,
      name: r.data!.createSchedule.name,
      slotCount: r.data!.createSchedule.slots.length,
    });
  })
);

// PUT /api/schedules/:scheduleId
router.put(
  "/schedules/:scheduleId",
  wrap(async (req, res) => {
    const { name, description, slots } = req.body;
    const input: Record<string, unknown> = {
      id: req.params.scheduleId as string,
    };
    if (name) input.name = name;
    if (description) input.description = description;
    if (slots) input.slots = convertSlots(slots);

    const r = await graphql<{
      updateSchedule: {
        id: string;
        name: string;
        slots: Array<{ id: string }>;
      };
    }>(Q.UPDATE_SCHEDULE, { input });

    res.json({
      id: r.data!.updateSchedule.id,
      name: r.data!.updateSchedule.name,
      slotCount: r.data!.updateSchedule.slots.length,
    });
  })
);

// GET /api/schedules/:scheduleId
router.get(
  "/schedules/:scheduleId",
  wrap(async (req, res) => {
    const r = await graphql<{
      schedule: {
        id: string;
        name: string;
        description?: string;
        presentAs?: string;
        slots?: Array<{
          id: string;
          rrule?: string;
          start?: string;
          duration?: number;
          playlistIds?: string[];
        }>;
      };
    }>(Q.SCHEDULE_DETAILS, { id: req.params.scheduleId as string });

    res.json(r.data!.schedule);
  })
);

// ── Zone Assignment ──────────────────────────────────────────────────────────

// POST /api/zones/assign-source  { "sound_zone_ids": [...], "source_id": "..." }
router.post(
  "/zones/assign-source",
  wrap(async (req, res) => {
    const { sound_zone_ids, source_id } = req.body;
    if (
      !sound_zone_ids ||
      !Array.isArray(sound_zone_ids) ||
      sound_zone_ids.length === 0 ||
      !source_id
    ) {
      res.status(400).json({
        error: "sound_zone_ids (non-empty array) and source_id are required",
      });
      return;
    }

    const r = await graphql<{
      soundZoneAssignSource: {
        soundZones: string[];
        source?: { id: string; name: string };
      };
    }>(Q.ASSIGN_SOURCE, {
      input: { soundZones: sound_zone_ids, source: source_id },
    });

    res.json({
      assigned: true,
      zones: sound_zone_ids.length,
      source: r.data!.soundZoneAssignSource.source || { id: source_id },
    });
  })
);

// GET /api/zones/:zoneId/source
router.get(
  "/zones/:zoneId/source",
  wrap(async (req, res) => {
    const r = await graphql<{
      soundZone: {
        id: string;
        name: string;
        playFrom?: { id: string; name: string; __typename?: string } | null;
      };
    }>(Q.ZONE_SOURCE, { id: req.params.zoneId as string });

    const zone = r.data!.soundZone;
    res.json({
      zone: zone.name,
      zoneId: zone.id,
      source: zone.playFrom || null,
    });
  })
);

// ── Content Management ───────────────────────────────────────────────────────

// POST /api/accounts/:accountId/playlists  { "name": "...", "track_ids": [...] }
router.post(
  "/accounts/:accountId/playlists",
  wrap(async (req, res) => {
    const { name, description, track_ids } = req.body;
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const input: Record<string, unknown> = {
      ownerId: req.params.accountId as string,
      name,
    };
    if (description) input.description = description;
    if (track_ids && Array.isArray(track_ids)) input.trackIds = track_ids;

    const r = await graphql<{
      createManualPlaylist: { id: string; name: string };
    }>(Q.CREATE_MANUAL_PLAYLIST, { input });

    res.json(r.data!.createManualPlaylist);
  })
);

// POST /api/zones/:zoneId/queue  { "track_ids": [...], "play_next": true }
router.post(
  "/zones/:zoneId/queue",
  wrap(async (req, res) => {
    const { track_ids, play_next } = req.body;
    if (!track_ids || !Array.isArray(track_ids) || track_ids.length === 0) {
      res
        .status(400)
        .json({ error: "track_ids (non-empty array) is required" });
      return;
    }

    await graphql(Q.QUEUE_TRACKS, {
      input: {
        soundZone: req.params.zoneId as string,
        tracks: track_ids,
        immediate: play_next !== false,
      },
    });

    res.json({ queued: track_ids.length });
  })
);

// POST /api/zones/:zoneId/block  { "track_id": "..." }
router.post(
  "/zones/:zoneId/block",
  wrap(async (req, res) => {
    const { track_id } = req.body;
    if (!track_id) {
      res.status(400).json({ error: "track_id is required" });
      return;
    }

    await graphql(Q.BLOCK_TRACK, {
      input: {
        parent: req.params.zoneId as string,
        source: track_id,
        reasons: ["dislike"],
      },
    });

    res.json({ blocked: true });
  })
);

// POST /api/accounts/:accountId/library  { "source_id": "..." }
router.post(
  "/accounts/:accountId/library",
  wrap(async (req, res) => {
    const { source_id } = req.body;
    if (!source_id) {
      res.status(400).json({ error: "source_id is required" });
      return;
    }

    await graphql(Q.ADD_TO_MUSIC_LIBRARY, {
      input: {
        parent: req.params.accountId as string,
        source: source_id,
      },
    });

    res.json({ added: true });
  })
);

// DELETE /api/accounts/:accountId/library/:sourceId
router.delete(
  "/accounts/:accountId/library/:sourceId",
  wrap(async (req, res) => {
    await graphql(Q.REMOVE_FROM_MUSIC_LIBRARY, {
      input: {
        parent: req.params.accountId as string,
        source: req.params.sourceId as string,
      },
    });

    res.json({ removed: true });
  })
);

// ── AI Features ──────────────────────────────────────────────────────────────

// POST /api/generate-playlist  { "prompt": "...", "market": "US" }
router.post(
  "/generate-playlist",
  wrap(async (req, res) => {
    const { prompt, market } = req.body;
    if (!prompt) {
      res.status(400).json({ error: "prompt is required" });
      return;
    }

    const variables: Record<string, unknown> = { query: prompt };
    if (market) variables.market = market;

    const r = await graphql<{
      getMusicFromPrompt: {
        playlists: Array<{ id: string; name: string }>;
        trackingId?: string;
      };
    }>(Q.GENERATE_PLAYLIST, variables);

    res.json({
      prompt,
      playlists: r.data!.getMusicFromPrompt?.playlists || [],
    });
  })
);

export default router;
