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

// ── Register All Tools ─────────────────────────────────────────────────────

export function registerTools(server: McpServer) {
  const scopedIds = getScopedAccountIds();
  const isScoped = scopedIds !== null;

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
    "Set the volume for a sound zone. Volume is typically 0-16 depending on hardware. Requires a sound zone ID.",
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
}
