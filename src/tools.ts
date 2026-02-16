import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { graphql, extractNodes } from "./client.js";
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

// ── Helpers ────────────────────────────────────────────────────────────────

function text(content: string) {
  return { content: [{ type: "text" as const, text: content }] };
}

// ── Register All Tools ─────────────────────────────────────────────────────

export function registerTools(server: McpServer) {
  server.tool(
    "list_accounts",
    "List all Soundtrack Your Brand accounts you have access to. Returns account IDs and business names. Use this first to discover available accounts.",
    {},
    async () => {
      const res = await graphql<{
        me: { accounts: { edges: Array<{ node: Account }> } };
      }>(Q.ME_ACCOUNTS);

      const accounts = extractNodes(res.data!.me.accounts);

      if (accounts.length === 0) {
        return text("No accounts found.");
      }

      const lines = accounts.map(
        (a, i) => `${i + 1}. ${a.businessName.trim()}\n   ID: ${a.id}`
      );

      return text(`Found ${accounts.length} accounts:\n\n${lines.join("\n\n")}`);
    }
  );

  server.tool(
    "list_locations",
    "List all locations for a specific account. Requires an account ID (get it from list_accounts first).",
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
      const album = track.album?.name ? ` from album "${track.album.name}"` : "";

      return text(`Now playing: "${track.name}" by ${artists}${album}`);
    }
  );

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
        return text(`Track skipped. Now playing: "${track.name}" by ${artists}`);
      }
      return text("Track skipped.");
    }
  );

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

  server.tool(
    "get_account_overview",
    "Get a full overview of ALL accounts, locations, and sound zones in one call. Useful for getting a complete picture of what you manage. Warning: may be slow if you manage many accounts.",
    {},
    async () => {
      const res = await graphql<{
        me: { accounts: { edges: Array<{ node: Account }> } };
      }>(Q.FULL_OVERVIEW);

      const accounts = extractNodes(res.data!.me.accounts);
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
