import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { graphql, extractNodes, getScopedAccountIds } from "./client.js";
import * as Q from "./queries.js";

// ── Types ──────────────────────────────────────────────────────────────────

interface Account {
  id: string;
  businessName: string;
  locations?: {
    edges: Array<{
      node: Location;
    }>;
  };
}

interface Location {
  id: string;
  name: string;
  soundZones?: {
    edges: Array<{
      node: SoundZone;
    }>;
  };
}

interface SoundZone {
  id: string;
  name: string;
  isPaired: boolean;
}

interface Track {
  name: string;
  artists: Array<{ name: string }>;
  album?: {
    name: string;
    image?: { url: string; width: number; height: number };
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

function sybUrl(id: string) {
  return `https://app.soundtrack.io/music/${id}`;
}

// Convert simplified slot format to Soundtrack API format
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

// Fetch accounts by specific IDs (for scoped mode)
async function fetchAccountsByIds(ids: string[]): Promise<Account[]> {
  const results: Account[] = [];
  for (const id of ids) {
    try {
      const res = await graphql<{ account: Account }>(Q.ACCOUNT_BY_ID, {
        id,
      });
      if (res.data?.account) {
        results.push(res.data.account);
      }
    } catch {
      // Skip accounts that fail (may have been deleted)
    }
  }
  return results;
}

// Paginate through ALL accounts (for unscoped/internal mode)
interface AccountsPageData {
  me: {
    accounts: {
      edges: Array<{ node: Account }>;
      pageInfo: PageInfo;
    };
  };
}

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

// Search for an account by name across all pages
async function searchAccountByName(
  searchTerm: string
): Promise<Account[]> {
  const term = searchTerm.toLowerCase();
  const matches: Account[] = [];
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
      if (a.businessName.toLowerCase().includes(term)) {
        matches.push(a);
      }
    }

    hasMore = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  return matches;
}

// ── Scope check helpers ────────────────────────────────────────────────────

export type Role = "operator" | "client";

async function assertAccountScope(
  scopedIds: string[] | null,
  accountId: string
): Promise<void> {
  if (!scopedIds) return;
  if (!scopedIds.includes(accountId)) {
    throw new Error(
      `Access denied: account ${accountId} is outside this connection's scope.`
    );
  }
}

async function assertLocationScope(
  scopedIds: string[] | null,
  locationId: string
): Promise<void> {
  if (!scopedIds) return;
  const res = await graphql<{ location?: { account?: { id: string } } }>(
    Q.LOCATION_ACCOUNT_LOOKUP,
    { id: locationId }
  );
  const acctId = res.data?.location?.account?.id;
  if (!acctId || !scopedIds.includes(acctId)) {
    throw new Error(
      `Access denied: location ${locationId} is outside this connection's scope.`
    );
  }
}

async function assertZoneScope(
  scopedIds: string[] | null,
  zoneId: string
): Promise<void> {
  if (!scopedIds) return;
  const res = await graphql<{ soundZone?: { account?: { id: string } } }>(
    Q.SOUND_ZONE_ACCOUNT_LOOKUP,
    { id: zoneId }
  );
  const acctId = res.data?.soundZone?.account?.id;
  if (!acctId || !scopedIds.includes(acctId)) {
    throw new Error(
      `Access denied: sound zone ${zoneId} is outside this connection's scope.`
    );
  }
}

// ── Register All Tools ─────────────────────────────────────────────────────

export function registerTools(
  server: McpServer,
  accountIds?: string[],
  role: Role = "client"
) {
  const scopedIds = accountIds ?? getScopedAccountIds();
  const isScoped = scopedIds !== null;
  const isOperator = role === "operator";

  // ── list_accounts ──────────────────────────────────────────────────────

  server.tool(
    "list_accounts",
    isScoped
      ? "List your configured Soundtrack Your Brand accounts."
      : "List ALL Soundtrack Your Brand accounts you have access to (paginates through all pages). Use search_account if you know the name.",
    {},
    async () => {
      const accounts = isScoped
        ? await fetchAccountsByIds(scopedIds)
        : await fetchAllAccounts();

      if (accounts.length === 0) {
        return text("No accounts found.");
      }

      const lines = accounts.map(
        (a, i) => `${i + 1}. ${a.businessName.trim()}\n   ID: ${a.id}`
      );

      return text(
        `Found ${accounts.length} account(s):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── search_account (only useful when NOT scoped) ───────────────────────

  server.tool(
    "search_account",
    "Search for an account by name. Searches through ALL accounts (900+) to find matches. Use this instead of list_accounts when looking for a specific account.",
    {
      name: z
        .string()
        .describe(
          "The account/business name to search for (partial match, case-insensitive)"
        ),
    },
    async ({ name }) => {
      if (isScoped) {
        // In scoped mode, just search within the configured accounts
        const accounts = await fetchAccountsByIds(scopedIds);
        const matches = accounts.filter((a) =>
          a.businessName.toLowerCase().includes(name.toLowerCase())
        );

        if (matches.length === 0) {
          return text(
            `No configured account matches "${name}". Your configured accounts: ${accounts.map((a) => a.businessName.trim()).join(", ")}`
          );
        }

        const lines = matches.map(
          (a) => `- ${a.businessName.trim()}\n  ID: ${a.id}`
        );
        return text(`Found ${matches.length} match(es):\n\n${lines.join("\n\n")}`);
      }

      // Unscoped: paginate through all accounts
      const matches = await searchAccountByName(name);

      if (matches.length === 0) {
        return text(`No account found matching "${name}".`);
      }

      const lines = matches.map(
        (a) => `- ${a.businessName.trim()}\n  ID: ${a.id}`
      );
      return text(
        `Found ${matches.length} match(es) for "${name}":\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── list_locations ─────────────────────────────────────────────────────

  server.tool(
    "list_locations",
    "List all locations for a specific account. Requires an account ID (get it from list_accounts or search_account first).",
    {
      account_id: z
        .string()
        .describe("The account ID to list locations for"),
    },
    async ({ account_id }) => {
      const res = await graphql<{
        account: Account;
      }>(Q.ACCOUNT_LOCATIONS, { accountId: account_id });

      const account = res.data!.account;
      const locations = extractNodes(account.locations!);

      if (locations.length === 0) {
        return text(`No locations found for ${account.businessName.trim()}.`);
      }

      const lines = locations.map(
        (l, i) => `${i + 1}. ${l.name.trim()}\n   ID: ${l.id}`
      );

      return text(
        `${account.businessName.trim()} - ${locations.length} location(s):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── list_sound_zones ───────────────────────────────────────────────────

  server.tool(
    "list_sound_zones",
    "List all sound zones for an account, organized by location. Shows zone name, ID, and whether a player is paired. Requires an account ID.",
    {
      account_id: z
        .string()
        .describe("The account ID to list sound zones for"),
    },
    async ({ account_id }) => {
      const res = await graphql<{
        account: { locations: { edges: Array<{ node: Location }> } };
      }>(Q.LOCATION_SOUND_ZONES, { accountId: account_id, first: 50 });

      const locations = extractNodes(res.data!.account.locations);
      const sections: string[] = [];

      for (const loc of locations) {
        const zones = loc.soundZones ? extractNodes(loc.soundZones) : [];
        const zoneLines = zones.map(
          (sz) =>
            `  - ${sz.name} ${sz.isPaired ? "(paired)" : "(not paired)"}\n    ID: ${sz.id}`
        );
        sections.push(
          `${loc.name.trim()} (${zones.length} zone${zones.length !== 1 ? "s" : ""}):\n${zoneLines.join("\n")}`
        );
      }

      return text(sections.join("\n\n"));
    }
  );

  // ── get_now_playing ────────────────────────────────────────────────────

  server.tool(
    "get_now_playing",
    "Get the currently playing track for a specific sound zone. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to check"),
    },
    async ({ sound_zone_id }) => {
      const res = await graphql<{
        nowPlaying: { track: Track } | null;
      }>(Q.NOW_PLAYING, { soundZone: sound_zone_id });

      const np = res.data!.nowPlaying;

      if (!np?.track) {
        return text(
          "Nothing is currently playing in this zone (player may be offline or paused)."
        );
      }

      const track = np.track;
      const artists = track.artists.map((a) => a.name).join(", ");
      const album = track.album?.name
        ? ` from album "${track.album.name}"`
        : "";

      return text(`Now playing: "${track.name}" by ${artists}${album}`);
    }
  );

  // ── set_volume ─────────────────────────────────────────────────────────

  server.tool(
    "set_volume",
    "Set the volume for a sound zone. Scale is 0-16 (0=silent, 8=medium, 16=max). There is no way to read the current volume. If the user says 'louder' or 'quieter' without a number, ask them what level to set it to, or suggest a value. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to adjust volume for"),
      volume: z
        .number()
        .int()
        .min(0)
        .describe("Volume level (typically 0-16, depends on hardware)"),
    },
    async ({ sound_zone_id, volume }) => {
      const res = await graphql<{
        setVolume: { volume: number };
      }>(Q.SET_VOLUME, { soundZone: sound_zone_id, volume });

      return text(`Volume set to ${res.data!.setVolume.volume}.`);
    }
  );

  // ── skip_track ─────────────────────────────────────────────────────────

  server.tool(
    "skip_track",
    "Skip to the next track in a sound zone. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to skip the track in"),
    },
    async ({ sound_zone_id }) => {
      const res = await graphql<{
        skipTrack: { nowPlaying: { track: Track } };
      }>(Q.SKIP_TRACK, { soundZone: sound_zone_id });

      const track = res.data!.skipTrack?.nowPlaying?.track;
      if (track) {
        const artists = track.artists.map((a) => a.name).join(", ");
        return text(
          `Track skipped. Now playing: "${track.name}" by ${artists}`
        );
      }
      return text("Track skipped.");
    }
  );

  // ── play ───────────────────────────────────────────────────────────────

  server.tool(
    "play",
    "Resume playback in a sound zone. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to resume playback in"),
    },
    async ({ sound_zone_id }) => {
      await graphql(Q.PLAY, { soundZone: sound_zone_id });
      return text("Playback resumed.");
    }
  );

  // ── pause ──────────────────────────────────────────────────────────────

  server.tool(
    "pause",
    "Pause playback in a sound zone. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to pause playback in"),
    },
    async ({ sound_zone_id }) => {
      await graphql(Q.PAUSE, { soundZone: sound_zone_id });
      return text("Playback paused.");
    }
  );

  // ── get_account_overview ───────────────────────────────────────────────

  server.tool(
    "get_account_overview",
    isScoped
      ? "Get a full overview of your configured accounts, locations, and sound zones."
      : "Get a full overview of ALL accounts, locations, and sound zones. Warning: with 900+ accounts this will be very slow. Use search_account first to find specific accounts.",
    {},
    async () => {
      let accounts: Account[];

      if (isScoped) {
        // Fetch full details for each scoped account
        const results: Account[] = [];
        for (const id of scopedIds) {
          try {
            const res = await graphql<{ account: Account }>(
              Q.ACCOUNT_OVERVIEW,
              { id }
            );
            if (res.data?.account) results.push(res.data.account);
          } catch {
            // skip
          }
        }
        accounts = results;
      } else {
        // Paginate all accounts, but only fetch names (overview of 900+ with zones would be too heavy)
        accounts = await fetchAllAccounts();
        return text(
          `You have access to ${accounts.length} accounts. Use search_account to find a specific one, or list_sound_zones with an account ID to see zones.\n\nFirst 20:\n${accounts
            .slice(0, 20)
            .map((a, i) => `${i + 1}. ${a.businessName.trim()} (${a.id})`)
            .join("\n")}\n\n...and ${Math.max(0, accounts.length - 20)} more.`
        );
      }

      const sections: string[] = [];
      let totalLocations = 0;
      let totalZones = 0;
      let pairedZones = 0;

      for (const account of accounts) {
        const locations = account.locations
          ? extractNodes(account.locations)
          : [];
        totalLocations += locations.length;

        const locSections: string[] = [];
        for (const loc of locations) {
          const zones = loc.soundZones ? extractNodes(loc.soundZones) : [];
          totalZones += zones.length;
          pairedZones += zones.filter((sz) => sz.isPaired).length;

          const zoneLines = zones.map(
            (sz) =>
              `      - ${sz.name} ${sz.isPaired ? "(paired)" : "(not paired)"}`
          );
          locSections.push(
            `    ${loc.name.trim()}\n${zoneLines.join("\n")}`
          );
        }

        sections.push(
          `${account.businessName.trim()}\n${locSections.join("\n")}`
        );
      }

      const summary = `Summary: ${accounts.length} accounts, ${totalLocations} locations, ${totalZones} sound zones (${pairedZones} paired)`;

      return text(`${summary}\n\n${sections.join("\n\n")}`);
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category A: Library & Discovery
  // ══════════════════════════════════════════════════════════════════════════

  // ── list_playlists ────────────────────────────────────────────────────────

  server.tool(
    "list_playlists",
    "List playlists in an account's music library. Requires an account ID. Use these playlist IDs with create_schedule or assign_source.",
    {
      account_id: z
        .string()
        .describe("The account ID to list playlists for"),
    },
    async ({ account_id }) => {
      const res = await graphql<{
        account: {
          businessName: string;
          musicLibrary: {
            playlists: { edges: Array<{ node: { id: string; name: string } }> };
          };
        };
      }>(Q.LIST_PLAYLISTS, { accountId: account_id, first: 50 });

      const account = res.data!.account;
      const playlists = extractNodes(account.musicLibrary.playlists);

      if (playlists.length === 0) {
        return text(
          `No playlists found in ${account.businessName.trim()}'s music library. Use search_music to find playlists from the Soundtrack catalog.`
        );
      }

      const lines = playlists.map(
        (p, i) => `${i + 1}. ${p.name}\n   ID: ${p.id}\n   Preview: ${sybUrl(p.id)}`
      );

      return text(
        `${account.businessName.trim()} - ${playlists.length} playlist(s):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── list_schedules ────────────────────────────────────────────────────────

  server.tool(
    "list_schedules",
    "List schedules in an account's music library. Requires an account ID. Use get_schedule_details to see a schedule's time slots.",
    {
      account_id: z
        .string()
        .describe("The account ID to list schedules for"),
    },
    async ({ account_id }) => {
      const res = await graphql<{
        account: {
          businessName: string;
          musicLibrary: {
            schedules: { edges: Array<{ node: { id: string; name: string } }> };
          };
        };
      }>(Q.LIST_SCHEDULES, { accountId: account_id, first: 50 });

      const account = res.data!.account;
      const schedules = extractNodes(account.musicLibrary.schedules);

      if (schedules.length === 0) {
        return text(
          `No schedules found in ${account.businessName.trim()}'s music library. Use create_schedule to create one.`
        );
      }

      const lines = schedules.map(
        (s, i) => `${i + 1}. ${s.name}\n   ID: ${s.id}`
      );

      return text(
        `${account.businessName.trim()} - ${schedules.length} schedule(s):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── search_music ──────────────────────────────────────────────────────────

  server.tool(
    "search_music",
    "Search the Soundtrack music catalog for playlists, tracks, artists, or albums. Returns IDs you can use with other tools (e.g. playlist IDs for create_schedule, track IDs for queue_tracks).",
    {
      query: z
        .string()
        .describe("Search query (e.g. 'jazz', 'chill lounge', 'bossa nova')"),
      type: z
        .enum(["playlist", "track", "artist", "album"])
        .default("playlist")
        .describe("Type of content to search for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(10)
        .describe("Number of results to return (default 10, max 50)"),
    },
    async ({ query, type, limit }) => {
      const res = await graphql<{
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

      const results = res.data!.search.edges.map((e) => e.node);

      if (results.length === 0) {
        return text(`No ${type}s found matching "${query}".`);
      }

      const lines = results.map((r, i) => {
        const artists =
          r.artists && r.artists.length > 0
            ? ` by ${r.artists.map((a) => a.name).join(", ")}`
            : "";
        const link = r.__typename === "Playlist" ? `\n   Preview: ${sybUrl(r.id)}` : "";
        return `${i + 1}. ${r.name}${artists}\n   ID: ${r.id}${link}`;
      });

      return text(
        `Found ${results.length} ${type}(s) matching "${query}":\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── browse_categories ─────────────────────────────────────────────────────

  server.tool(
    "browse_categories",
    "Browse music categories from the Soundtrack catalog. Each category contains curated playlists. Pass a category_id to see its playlists, or omit it to list all categories.",
    {
      category_id: z
        .string()
        .optional()
        .describe(
          "A category ID to browse playlists within. Omit to list all categories."
        ),
    },
    async ({ category_id }) => {
      if (category_id) {
        const res = await graphql<{
          browseCategory: {
            name: string;
            playlists: {
              edges: Array<{ node: { id: string; name: string } }>;
            };
          };
        }>(Q.BROWSE_CATEGORY_PLAYLISTS, { id: category_id, first: 30 });

        const cat = res.data!.browseCategory;
        const playlists = cat.playlists.edges.map((e) => e.node);

        if (playlists.length === 0) {
          return text(`No playlists found in category "${cat.name}".`);
        }

        const lines = playlists.map(
          (p, i) => `${i + 1}. ${p.name}\n   ID: ${p.id}\n   Preview: ${sybUrl(p.id)}`
        );

        return text(
          `${cat.name} - ${playlists.length} playlist(s):\n\n${lines.join("\n\n")}`
        );
      }

      const res = await graphql<{
        browseCategories: {
          edges: Array<{ node: { id: string; name: string; slug: string } }>;
        };
      }>(Q.BROWSE_CATEGORIES, {});

      const categories = res.data!.browseCategories.edges.map((e) => e.node);

      if (!categories || categories.length === 0) {
        return text("No categories found.");
      }

      const lines = categories.map(
        (c, i) => `${i + 1}. ${c.name}\n   ID: ${c.id}`
      );

      return text(
        `${categories.length} music categories:\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ── get_playlist_tracks ───────────────────────────────────────────────────

  server.tool(
    "get_playlist_tracks",
    "See the tracks inside a playlist. Requires a playlist ID (get it from list_playlists or search_music).",
    {
      playlist_id: z.string().describe("The playlist ID to get tracks for"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Number of tracks to return (default 20, max 100)"),
    },
    async ({ playlist_id, limit }) => {
      const res = await graphql<{
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
      }>(Q.PLAYLIST_TRACKS, { id: playlist_id, first: limit });

      const playlist = res.data!.playlist;
      const tracks = playlist.tracks.edges.map((e) => e.node);

      if (tracks.length === 0) {
        return text(`No tracks found in playlist "${playlist.name}".`);
      }

      const lines = tracks.map((t, i) => {
        const artists = t.artists.map((a) => a.name).join(", ");
        return `${i + 1}. ${t.name} - ${artists}\n   ID: ${t.id}`;
      });

      return text(
        `${playlist.name} (${sybUrl(playlist_id)}) - ${tracks.length} track(s):\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category B: Schedule Management
  // ══════════════════════════════════════════════════════════════════════════

  // ── create_schedule ───────────────────────────────────────────────────────

  server.tool(
    "create_schedule",
    `Create a music schedule with recurring weekly time slots. Each slot assigns a playlist to specific days and times.

Days options: "daily", "weekdays" (Mon-Fri), "weekends" (Sat-Sun), or specific days like "MO,WE,FR".
Valid day codes: MO, TU, WE, TH, FR, SA, SU.

LIMITATION: Schedules are recurring weekly only — they cannot be set to start/end on specific dates (e.g. "Dec 1-26" or one-time events). For date-bounded or event-based scheduling, bmasia clients can use the Music Brief tool at https://bmasia-music-brief-v2.onrender.com/ — others can contact bmasia at https://bmasiamusic.com for assistance.

After creating, use add_to_library to make it visible in the Soundtrack app, then assign_source to activate it on zones.`,
    {
      account_id: z
        .string()
        .describe("The account ID that will own this schedule"),
      name: z.string().describe("Name for the schedule"),
      description: z.string().optional().describe("Optional description"),
      slots: z
        .array(
          z.object({
            playlist_id: z
              .string()
              .describe(
                "Playlist ID to play (get from search_music, list_playlists, or browse_categories)"
              ),
            days: z
              .string()
              .describe(
                'When to play: "daily", "weekdays", "weekends", or specific days like "MO,WE,FR"'
              ),
            start_time: z
              .string()
              .describe('Start time in HH:MM format (24-hour), e.g. "09:00"'),
            duration_hours: z
              .number()
              .positive()
              .describe(
                "Duration in hours (e.g. 3 for 3 hours, 1.5 for 90 minutes)"
              ),
          })
        )
        .min(1)
        .describe("Time slots defining when each playlist plays"),
    },
    async ({ account_id, name, description, slots }) => {
      const convertedSlots = convertSlots(slots);

      const input: Record<string, unknown> = {
        ownerId: account_id,
        name,
        presentAs: "daily",
        slots: convertedSlots,
      };
      if (description) input.description = description;

      const res = await graphql<{
        createSchedule: { id: string; name: string; slots: Array<{ id: string }> };
      }>(Q.CREATE_SCHEDULE, { input });

      const schedule = res.data!.createSchedule;

      return text(
        `Schedule created: "${schedule.name}"\nID: ${schedule.id}\nSlots: ${schedule.slots.length}\n\nNext steps:\n1. Use add_to_library to make it visible in the Soundtrack app\n2. Use assign_source to activate it on sound zones`
      );
    }
  );

  // ── update_schedule ───────────────────────────────────────────────────────

  server.tool(
    "update_schedule",
    "Update an existing schedule. WARNING: providing slots replaces ALL existing slots (does not merge). Use get_schedule_details first to see current slots. Requires a schedule ID (get it from list_schedules).",
    {
      schedule_id: z.string().describe("The schedule ID to update"),
      name: z.string().optional().describe("New name for the schedule"),
      description: z
        .string()
        .optional()
        .describe("New description for the schedule"),
      slots: z
        .array(
          z.object({
            playlist_id: z.string().describe("Playlist ID to play"),
            days: z
              .string()
              .describe(
                'When to play: "daily", "weekdays", "weekends", or specific days like "MO,WE,FR"'
              ),
            start_time: z
              .string()
              .describe('Start time in HH:MM format (24-hour), e.g. "09:00"'),
            duration_hours: z
              .number()
              .positive()
              .describe("Duration in hours"),
          })
        )
        .optional()
        .describe(
          "New time slots (REPLACES all existing slots). Omit to only update name/description."
        ),
    },
    async ({ schedule_id, name, description, slots }) => {
      const input: Record<string, unknown> = { id: schedule_id };
      if (name) input.name = name;
      if (description) input.description = description;
      if (slots) input.slots = convertSlots(slots);

      const res = await graphql<{
        updateSchedule: { id: string; name: string; slots: Array<{ id: string }> };
      }>(Q.UPDATE_SCHEDULE, { input });

      const schedule = res.data!.updateSchedule;

      return text(
        `Schedule updated: "${schedule.name}"\nID: ${schedule.id}\nSlots: ${schedule.slots.length}`
      );
    }
  );

  // ── get_schedule_details ──────────────────────────────────────────────────

  server.tool(
    "get_schedule_details",
    "See the time slots and playlists inside a schedule. Requires a schedule ID (get it from list_schedules).",
    {
      schedule_id: z.string().describe("The schedule ID to get details for"),
    },
    async ({ schedule_id }) => {
      const res = await graphql<{
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
      }>(Q.SCHEDULE_DETAILS, { id: schedule_id });

      const schedule = res.data!.schedule;
      const parts: string[] = [
        `Schedule: "${schedule.name}"`,
        `ID: ${schedule.id}`,
      ];

      if (schedule.description) {
        parts.push(`Description: ${schedule.description}`);
      }

      if (schedule.slots && schedule.slots.length > 0) {
        parts.push(`\nSlots (${schedule.slots.length}):`);
        for (const slot of schedule.slots) {
          const playlists = slot.playlistIds?.join(", ") || "none";
          const rrule = slot.rrule || "No recurrence";
          const start = slot.start
            ? `${slot.start.slice(0, 2)}:${slot.start.slice(2, 4)}`
            : "?";
          const hours = slot.duration
            ? `${(slot.duration / 3600000).toFixed(1)}h`
            : "?";
          parts.push(`  - ${rrule} | ${start} for ${hours} | playlists: ${playlists}`);
        }
      }

      return text(parts.join("\n"));
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category C: Zone Assignment
  // ══════════════════════════════════════════════════════════════════════════

  // ── assign_source ─────────────────────────────────────────────────────────

  server.tool(
    "assign_source",
    "Assign a schedule or playlist to one or more sound zones. This is the action that makes music actually play. Requires zone IDs (from list_sound_zones) and a source ID (from list_playlists, list_schedules, search_music, or create_schedule).",
    {
      sound_zone_ids: z
        .array(z.string())
        .min(1)
        .describe("One or more sound zone IDs to assign the source to"),
      source_id: z
        .string()
        .describe("The schedule or playlist ID to assign as the music source"),
    },
    async ({ sound_zone_ids, source_id }) => {
      const res = await graphql<{
        soundZoneAssignSource: {
          soundZones: string[];
          source?: { id: string; name: string };
        };
      }>(Q.ASSIGN_SOURCE, {
        input: { soundZones: sound_zone_ids, source: source_id },
      });

      const result = res.data!.soundZoneAssignSource;
      const sourceName = result.source?.name || source_id;

      return text(
        `Source assigned to ${sound_zone_ids.length} zone(s).\nSource: "${sourceName}"`
      );
    }
  );

  // ── get_zone_source ───────────────────────────────────────────────────────

  server.tool(
    "get_zone_source",
    "See what schedule or playlist is currently assigned to a sound zone. This shows the music source, not the current track (use get_now_playing for that). Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to check the music source for"),
    },
    async ({ sound_zone_id }) => {
      const res = await graphql<{
        soundZone: {
          id: string;
          name: string;
          playFrom?: { id: string; name: string; __typename?: string } | null;
        };
      }>(Q.ZONE_SOURCE, { id: sound_zone_id });

      const zone = res.data!.soundZone;

      if (!zone.playFrom) {
        return text(`Zone "${zone.name}" has no music source assigned.`);
      }

      const sourceType = zone.playFrom.__typename || "Source";

      const link = sourceType === "Playlist" ? `\nPreview: ${sybUrl(zone.playFrom.id)}` : "";
      return text(
        `Zone "${zone.name}" is playing from:\n${sourceType}: "${zone.playFrom.name}"\nID: ${zone.playFrom.id}${link}`
      );
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category D: Content Management
  // ══════════════════════════════════════════════════════════════════════════

  // ── create_playlist ───────────────────────────────────────────────────────

  server.tool(
    "create_playlist",
    "Create a custom manual playlist, optionally with tracks. Requires an account ID. Use search_music with type 'track' to find track IDs.",
    {
      account_id: z
        .string()
        .describe("The account ID that will own this playlist"),
      name: z.string().describe("Name for the playlist"),
      description: z.string().optional().describe("Optional description"),
      track_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Optional track IDs to add (get from search_music with type 'track')"
        ),
    },
    async ({ account_id, name, description, track_ids }) => {
      const input: Record<string, unknown> = { ownerId: account_id, name };
      if (description) input.description = description;
      if (track_ids && track_ids.length > 0) input.trackIds = track_ids;

      const res = await graphql<{
        createManualPlaylist: { id: string; name: string };
      }>(Q.CREATE_MANUAL_PLAYLIST, { input });

      const playlist = res.data!.createManualPlaylist;

      return text(
        `Playlist created: "${playlist.name}"\nID: ${playlist.id}${
          track_ids ? `\nTracks: ${track_ids.length}` : ""
        }`
      );
    }
  );

  // ── queue_tracks ──────────────────────────────────────────────────────────

  server.tool(
    "queue_tracks",
    "Queue specific tracks to play next in a sound zone. Use search_music with type 'track' to find track IDs. Requires a sound zone ID.",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to queue tracks in"),
      track_ids: z
        .array(z.string())
        .min(1)
        .describe(
          "Track IDs to queue (get from search_music with type 'track')"
        ),
      play_next: z
        .boolean()
        .default(true)
        .describe("If true, queued tracks play immediately after current track"),
    },
    async ({ sound_zone_id, track_ids, play_next }) => {
      await graphql(Q.QUEUE_TRACKS, {
        input: {
          soundZone: sound_zone_id,
          tracks: track_ids,
          immediate: play_next,
        },
      });

      return text(
        `${track_ids.length} track(s) queued in zone.${
          play_next ? " Will play next." : ""
        }`
      );
    }
  );

  // ── block_track ───────────────────────────────────────────────────────────

  server.tool(
    "block_track",
    "Block a track from playing in a sound zone. The track will be skipped whenever it comes up. Requires a sound zone ID and track ID (get track ID from get_now_playing or search_music).",
    {
      sound_zone_id: z
        .string()
        .describe("The sound zone ID to block the track in"),
      track_id: z.string().describe("The track ID to block"),
    },
    async ({ sound_zone_id, track_id }) => {
      await graphql(Q.BLOCK_TRACK, {
        input: {
          parent: sound_zone_id,
          source: track_id,
          reasons: ["dislike"],
        },
      });

      return text("Track blocked. It will be skipped in this zone.");
    }
  );

  // ── add_to_library ────────────────────────────────────────────────────────

  server.tool(
    "add_to_library",
    "Add a schedule or playlist to an account's music library. This makes it visible in the Soundtrack app. Recommended after create_schedule.",
    {
      account_id: z.string().describe("The account ID"),
      source_id: z
        .string()
        .describe("The schedule or playlist ID to add to the library"),
    },
    async ({ account_id, source_id }) => {
      try {
        await graphql(Q.ADD_TO_MUSIC_LIBRARY, {
          input: { parent: account_id, source: source_id },
        });
        return text("Added to music library.");
      } catch (err) {
        return text(
          `Note: Could not add to music library (${err instanceof Error ? err.message : "unknown error"}). The schedule/playlist still works — it just may not appear in the Soundtrack app.`
        );
      }
    }
  );

  // ── remove_from_library ───────────────────────────────────────────────────

  server.tool(
    "remove_from_library",
    "Remove a schedule or playlist from an account's music library.",
    {
      account_id: z.string().describe("The account ID"),
      source_id: z
        .string()
        .describe("The schedule or playlist ID to remove from the library"),
    },
    async ({ account_id, source_id }) => {
      await graphql(Q.REMOVE_FROM_MUSIC_LIBRARY, {
        input: { parent: account_id, source: source_id },
      });

      return text("Removed from music library.");
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category E: AI Features
  // ══════════════════════════════════════════════════════════════════════════

  // ── generate_playlist ─────────────────────────────────────────────────────

  server.tool(
    "generate_playlist",
    "Generate a playlist from a text description using Soundtrack's AI. Describe the mood, genre, venue type, or occasion and get matching playlists. Example: 'relaxing jazz for a hotel lobby' or 'upbeat Friday night bar music'.",
    {
      prompt: z
        .string()
        .describe(
          "Describe the music you want (mood, genre, venue, occasion)"
        ),
      market: z
        .string()
        .optional()
        .describe("Country code for regional preferences (e.g. 'US', 'TH')"),
    },
    async ({ prompt, market }) => {
      const variables: Record<string, unknown> = { query: prompt };
      if (market) variables.market = market;

      const res = await graphql<{
        getMusicFromPrompt: {
          playlists: Array<{ id: string; name: string }>;
          trackingId?: string;
        };
      }>(Q.GENERATE_PLAYLIST, variables);

      const playlists = res.data!.getMusicFromPrompt?.playlists;

      if (!playlists || playlists.length === 0) {
        return text(
          `No playlists generated for "${prompt}". Try a different description or use search_music instead.`
        );
      }

      const lines = playlists.map(
        (p, i) => `${i + 1}. ${p.name}\n   ID: ${p.id}`
      );

      return text(
        `Generated ${playlists.length} playlist(s) for "${prompt}":\n\n${lines.join("\n\n")}`
      );
    }
  );

  // ══════════════════════════════════════════════════════════════════════════
  // Category F: Admin — Account / Location / Zone / Subscription Lifecycle
  //
  // Scope rules:
  //   - operator role: full access to every account on the server's API token
  //   - client role:   limited to the accounts in scopedIds (URL or env)
  //
  // Cost-impacting tools (subscription_activate, subscription_cancel,
  // account_register) are operator-only — clients can't trigger billing or
  // create new accounts that bypass scope checks.
  // ══════════════════════════════════════════════════════════════════════════

  // ── account_register (operator only) ──────────────────────────────────────

  if (isOperator) {
    server.tool(
      "account_register",
      "Create a new Soundtrack account. Operator-only — requires owner user_id, plan, country, and physical address. Returns the new account ID.",
      {
        business_name: z.string().describe("Customer-facing business name"),
        business_type: z
          .string()
          .default("hotel")
          .describe("hotel | restaurant | retail | gym | spa (lowercase)"),
        country: z
          .string()
          .describe("ISO-2 country code (e.g. ES, TH, IN, US)"),
        plan: z
          .enum(["ESSENTIAL", "UNLIMITED", "STARTER", "ROYALTY_FREE", "SOUNDTRACK"])
          .describe("Subscription plan tier"),
        billing_cycle: z
          .enum(["MONTHLY", "QUARTERLY", "YEARLY", "NOT_SET"])
          .default("YEARLY"),
        owner_user_id: z
          .string()
          .describe(
            "User ID that will own the account. PublicAPIClient tokens cannot own accounts directly."
          ),
        address_line_1: z.string(),
        address_line_2: z.string().optional(),
        city: z.string(),
        postal_code: z.string(),
      },
      async (args) => {
        const physicalAddress: Record<string, string> = {
          addressLine1: args.address_line_1,
          city: args.city,
          postalCode: args.postal_code,
          country: args.country,
        };
        if (args.address_line_2) physicalAddress.addressLine2 = args.address_line_2;

        const input = {
          businessName: args.business_name,
          businessType: args.business_type,
          country: args.country,
          plan: args.plan,
          billingCycle: args.billing_cycle,
          userId: args.owner_user_id,
          acceptLegalTerms: true,
          physicalAddress,
        };

        const res = await graphql<{
          accountRegister: {
            account: { id: string; businessName: string; plan: string; country: string };
          };
        }>(Q.ACCOUNT_REGISTER, { input });

        const a = res.data!.accountRegister.account;
        return text(
          `Account created: ${a.businessName}\n  ID: ${a.id}\n  Plan: ${a.plan}\n  Country: ${a.country}`
        );
      }
    );
  }

  // ── account_add_user ──────────────────────────────────────────────────────

  server.tool(
    "account_add_user",
    "Add a user (by email) as an admin/contact on an account. Common after account_register.",
    {
      account_id: z.string().describe("The account ID"),
      email: z.string().describe("User email"),
      role: z
        .enum(["ADMIN", "OWNER", "USER", "FINANCE", "CONTACT"])
        .default("ADMIN"),
      contact: z
        .boolean()
        .default(false)
        .describe("If true, also marks user as a primary contact"),
    },
    async ({ account_id, email, role: userRole, contact }) => {
      await assertAccountScope(scopedIds, account_id);
      await graphql(Q.ACCOUNT_ADD_USER, {
        input: { accountId: account_id, email, role: userRole, contact },
      });
      return text(`Added ${email} (${userRole}) to ${account_id}.`);
    }
  );

  // ── location_create ───────────────────────────────────────────────────────

  server.tool(
    "location_create",
    "Create a location under an account. Optionally seeds a first sound zone via sound_zone_name. physical_address requires postalCode — without it, SYB returns a generic Validation failed.",
    {
      account_id: z.string(),
      name: z.string().describe("Location display name"),
      sound_zone_name: z
        .string()
        .optional()
        .describe("If set, also creates a first sound zone with this name"),
      address_line_1: z.string(),
      address_line_2: z.string().optional(),
      city: z.string(),
      postal_code: z.string(),
      country: z.string().describe("ISO-2"),
    },
    async (args) => {
      await assertAccountScope(scopedIds, args.account_id);
      const physicalAddress: Record<string, string> = {
        addressLine1: args.address_line_1,
        city: args.city,
        postalCode: args.postal_code,
        country: args.country,
      };
      if (args.address_line_2) physicalAddress.addressLine2 = args.address_line_2;

      const input: Record<string, unknown> = {
        account: args.account_id,
        name: args.name,
        physicalAddress,
      };
      if (args.sound_zone_name) input.soundZoneName = args.sound_zone_name;

      const res = await graphql<{
        locationCreate: {
          location: {
            id: string;
            name: string;
            soundZones: { edges: Array<{ node: { id: string; name: string } }> };
          };
        };
      }>(Q.LOCATION_CREATE, { input });

      const loc = res.data!.locationCreate.location;
      const zones = extractNodes(loc.soundZones);
      const zonesLine = zones.length
        ? `\n  Zones created: ${zones.map((z) => `${z.name} (${z.id})`).join(", ")}`
        : "";
      return text(`Location created: ${loc.name}\n  ID: ${loc.id}${zonesLine}`);
    }
  );

  // ── location_update ───────────────────────────────────────────────────────

  server.tool(
    "location_update",
    "Rename a location. To change address, set additional fields.",
    {
      location_id: z.string(),
      name: z.string().optional(),
    },
    async ({ location_id, name }) => {
      await assertLocationScope(scopedIds, location_id);
      const input: Record<string, unknown> = { id: location_id };
      if (name) input.name = name;
      const res = await graphql<{
        locationUpdate: { location: { id: string; name: string } };
      }>(Q.LOCATION_UPDATE, { input });
      const l = res.data!.locationUpdate.location;
      return text(`Location updated: ${l.name} (${l.id})`);
    }
  );

  // ── location_delete ───────────────────────────────────────────────────────

  server.tool(
    "location_delete",
    "Delete a location. Will fail if it still has active sound zones — delete or move zones first.",
    {
      location_id: z.string(),
    },
    async ({ location_id }) => {
      await assertLocationScope(scopedIds, location_id);
      const res = await graphql<{
        locationDelete: { location: { id: string; name: string } };
      }>(Q.LOCATION_DELETE, { input: { id: location_id } });
      const l = res.data!.locationDelete.location;
      return text(`Location deleted: ${l.name} (${l.id})`);
    }
  );

  // ── sound_zone_create ─────────────────────────────────────────────────────

  server.tool(
    "sound_zone_create",
    "Create a new sound zone under a location. Zone is inert (no subscription) until subscription_activate runs — operator action.",
    {
      location_id: z.string(),
      name: z.string(),
    },
    async ({ location_id, name }) => {
      await assertLocationScope(scopedIds, location_id);
      const res = await graphql<{
        soundZoneCreate: { soundZone: { id: string; name: string } };
      }>(Q.SOUND_ZONE_CREATE, { input: { location: location_id, name } });
      const z = res.data!.soundZoneCreate.soundZone;
      return text(`Sound zone created: ${z.name} (${z.id})`);
    }
  );

  // ── sound_zone_update_name ────────────────────────────────────────────────

  server.tool(
    "sound_zone_update_name",
    "Rename a sound zone. Useful when SYB names need to mirror an external source-of-truth (e.g. a customer's zone naming).",
    {
      sound_zone_id: z.string(),
      name: z.string(),
    },
    async ({ sound_zone_id, name }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZoneUpdate: { soundZone: { id: string; name: string } };
      }>(Q.SOUND_ZONE_UPDATE, { input: { id: sound_zone_id, name } });
      const z = res.data!.soundZoneUpdate.soundZone;
      return text(`Renamed to: ${z.name} (${z.id})`);
    }
  );

  // ── sound_zone_delete ─────────────────────────────────────────────────────

  server.tool(
    "sound_zone_delete",
    "Delete a sound zone. Safe when the zone has no active subscription. If sub is active, cancel it first or it will continue to bill till month end.",
    {
      sound_zone_id: z.string(),
    },
    async ({ sound_zone_id }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZoneDelete: { soundZone: { id: string; name: string } };
      }>(Q.SOUND_ZONE_DELETE, { input: { id: sound_zone_id } });
      const z = res.data!.soundZoneDelete.soundZone;
      return text(`Sound zone deleted: ${z.name} (${z.id})`);
    }
  );

  // ── sound_zone_initiate_pairing ───────────────────────────────────────────

  server.tool(
    "sound_zone_initiate_pairing",
    "Generate a pairing code for an unpaired sound zone. Customer enters this code on the Soundtrack player. Already-paired zones return an empty code — unpair first if a fresh code is needed.",
    {
      sound_zone_id: z.string(),
    },
    async ({ sound_zone_id }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZoneInitiatePairing: { device: { pairingCode: string } };
      }>(Q.SOUND_ZONE_INITIATE_PAIRING, {
        input: { soundZone: sound_zone_id },
      });
      const code = res.data!.soundZoneInitiatePairing.device?.pairingCode || "";
      if (!code) {
        return text(
          "No pairing code returned — zone may already be paired. Run sound_zone_unpair first to free the device, then re-initiate."
        );
      }
      return text(`Pairing code: ${code}`);
    }
  );

  // ── sound_zone_unpair ─────────────────────────────────────────────────────

  server.tool(
    "sound_zone_unpair",
    "Unpair a sound zone from its current device. The customer's existing device stops playing until they re-pair. Use this only when switching devices or when a customer explicitly asks for a fresh pairing code.",
    {
      sound_zone_id: z.string(),
    },
    async ({ sound_zone_id }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZoneUnpair: { soundZone: { id: string; name: string; isPaired: boolean } };
      }>(Q.SOUND_ZONE_UNPAIR, { input: { soundZone: sound_zone_id } });
      const z = res.data!.soundZoneUnpair.soundZone;
      return text(
        `Unpaired: ${z.name} (${z.id})  isPaired=${z.isPaired}`
      );
    }
  );

  // ── subscription_activate (operator only — triggers billing) ──────────────

  if (isOperator) {
    server.tool(
      "subscription_activate",
      "Activate the subscription on a sound zone. OPERATOR-ONLY because this triggers SYB billing for at least one month and cannot be undone within the billing period. Verify via account_billing_status afterward — soundZone.subscription field can return STALE values, use account.billing.subscription.activeStreamingSubscriptions count instead.",
      {
        sound_zone_id: z.string(),
      },
      async ({ sound_zone_id }) => {
        const res = await graphql<{
          subscriptionActivate: {
            soundZone: {
              id: string;
              name: string;
              account: { id: string; businessName: string; plan: string };
            };
          };
        }>(Q.SUBSCRIPTION_ACTIVATE, { input: { soundZoneId: sound_zone_id } });
        const z = res.data!.subscriptionActivate.soundZone;
        return text(
          `Subscription activate fired on: ${z.name} (${z.id})\n  Account: ${z.account.businessName} (${z.account.plan})\n\nVerify with account_billing_status — zone-level subscription field can be stale immediately after activation.`
        );
      }
    );
  }

  // ── subscription_cancel ───────────────────────────────────────────────────

  server.tool(
    "subscription_cancel",
    "Cancel the subscription on a sound zone. The zone continues to play until end of the current billing period, then goes silent. Reactivation re-bills.",
    {
      sound_zone_id: z.string(),
    },
    async ({ sound_zone_id }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        subscriptionCancel: { soundZone: { id: string; name: string } };
      }>(Q.SUBSCRIPTION_CANCEL, { input: { soundZoneId: sound_zone_id } });
      const z = res.data!.subscriptionCancel.soundZone;
      return text(`Subscription cancelled: ${z.name} (${z.id})`);
    }
  );

  // ── account_billing_status ────────────────────────────────────────────────

  server.tool(
    "account_billing_status",
    "Read account-level subscription state — the authoritative source for whether activations took effect. activeStreamingSubscriptions count should equal the number of active zones on the account.",
    {
      account_id: z.string(),
    },
    async ({ account_id }) => {
      await assertAccountScope(scopedIds, account_id);
      const res = await graphql<{
        account: {
          id: string;
          businessName: string;
          plan: string;
          country: string;
          soundZoneStatuses: Array<{ status: string; total: number }>;
          billing: {
            subscription: {
              activeFrom: string;
              activeTo: string;
              billingCycle: string;
              activeStreamingSubscriptions: number;
              checkoutState: string;
            };
          };
        };
      }>(Q.ACCOUNT_BILLING_STATUS, { id: account_id });
      const a = res.data!.account;
      const sub = a.billing.subscription;
      const statusLines = a.soundZoneStatuses
        .map((s) => `${s.status}=${s.total}`)
        .join(" | ");
      return text(
        [
          `${a.businessName} (${a.plan}, ${a.country})`,
          `  active from: ${sub.activeFrom}`,
          `  active to:   ${sub.activeTo}`,
          `  billing cycle: ${sub.billingCycle}`,
          `  active streaming subs: ${sub.activeStreamingSubscriptions}`,
          `  checkout state: ${sub.checkoutState}`,
          `  zones by status: ${statusLines}`,
        ].join("\n")
      );
    }
  );

  // ── sound_zone_full_state ─────────────────────────────────────────────────

  server.tool(
    "sound_zone_full_state",
    "Full state for a single zone: pairing, online, subscription, current source. Use this BEFORE any 'please revert music' work to check whether the zone is actually playing the schedule the customer thinks it is.",
    {
      sound_zone_id: z.string(),
    },
    async ({ sound_zone_id }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZone: {
          id: string;
          name: string;
          isPaired: boolean;
          online: boolean;
          subscription?: { state: string; isActive: boolean; activeUntil: string };
          playFrom?: { __typename: string; id?: string; name?: string };
        };
      }>(Q.SOUND_ZONE_FULL_STATE, { id: sound_zone_id });
      const z = res.data!.soundZone;
      const sub = z.subscription;
      const src = z.playFrom;
      return text(
        [
          `${z.name} (${z.id})`,
          `  paired: ${z.isPaired}`,
          `  online: ${z.online}`,
          `  subscription: ${sub ? `${sub.state} active=${sub.isActive} until ${sub.activeUntil}` : "n/a"}`,
          `  playFrom: ${src ? `${src.__typename} '${src.name}' (${src.id})` : "none"}`,
        ].join("\n")
      );
    }
  );

  // ── sound_zone_playback_history ───────────────────────────────────────────

  server.tool(
    "sound_zone_playback_history",
    "Last N tracks played in a zone with timestamps and source. Use this to distinguish a music-design issue (wrong tracks) from a device issue (no playback at all).",
    {
      sound_zone_id: z.string(),
      first: z.number().int().positive().max(50).default(20),
    },
    async ({ sound_zone_id, first }) => {
      await assertZoneScope(scopedIds, sound_zone_id);
      const res = await graphql<{
        soundZone: {
          id: string;
          name: string;
          playbackHistory: {
            edges: Array<{
              node: {
                startedAt: string;
                track: { name: string; artists: Array<{ name: string }> };
                playFrom?: { __typename: string; id?: string; name?: string };
              };
            }>;
          };
        };
      }>(Q.SOUND_ZONE_PLAYBACK_HISTORY, { id: sound_zone_id, first });
      const edges = res.data!.soundZone.playbackHistory.edges;
      if (edges.length === 0) {
        return text(
          `No playback history for ${res.data!.soundZone.name}. Zone may have never played, or device has been offline since SYB started tracking.`
        );
      }
      const lines = edges.map((e) => {
        const n = e.node;
        const artists = n.track.artists.map((a) => a.name).join(", ");
        const src = n.playFrom?.name ?? "?";
        return `${n.startedAt.slice(0, 19)} | ${n.track.name} — ${artists} | from: ${src}`;
      });
      return text(
        `Last ${edges.length} tracks for ${res.data!.soundZone.name}:\n\n${lines.join("\n")}`
      );
    }
  );
}
