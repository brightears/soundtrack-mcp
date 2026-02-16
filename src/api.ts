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
    const scopedIds = getScopedAccountIds();
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

    const scopedIds = getScopedAccountIds();
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

export default router;
