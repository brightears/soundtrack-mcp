#!/usr/bin/env node

import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { registerTools, type Role } from "./tools.js";
import { oauthProvider } from "./auth.js";
import { randomUUID } from "crypto";
import apiRouter from "./api.js";

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
// Operator token — when set, /mcp and /operator/mcp require X-Operator-Token
// matching this value to expose admin tools (subscription_activate, account_register).
// When unset (self-hosted), /mcp behaves as before (effectively operator).
const OPERATOR_TOKEN = process.env.OPERATOR_TOKEN || "";

function isOperatorRequest(req: Request): boolean {
  if (!OPERATOR_TOKEN) return true; // self-hosted, no client mode configured
  const provided = req.headers["x-operator-token"] as string | undefined;
  return !!provided && provided === OPERATOR_TOKEN;
}

// Scope aliases — JSON env var mapping short names to comma-separated account IDs.
// Lets customers connect via /c/tui/mcp instead of a 7KB URL with 262 raw IDs.
// Format: SCOPE_ALIASES='{"tui":"id1,id2,id3","other":"id4,id5"}'
const SCOPE_ALIASES: Record<string, string[]> = (() => {
  const raw = process.env.SCOPE_ALIASES || "";
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(parsed)) {
      out[k.toLowerCase()] = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return out;
  } catch (e) {
    console.error("SCOPE_ALIASES parse error:", e);
    return {};
  }
})();

function resolveScopeSegment(segment: string): string[] {
  // If the segment matches an alias key, expand. Otherwise treat as raw CSV of IDs.
  const key = segment.toLowerCase();
  if (SCOPE_ALIASES[key]) {
    return SCOPE_ALIASES[key];
  }
  return segment
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const app = express();
app.set("trust proxy", 1);
app.use(express.json());

// ── OAuth 2.1 (for Claude.ai / ChatGPT Connectors) ─────────────────────────

app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: new URL(BASE_URL),
    scopesSupported: ["mcp:tools"],
    resourceName: "Soundtrack MCP",
  })
);

// Optional bearer auth: verify token if present, allow through if not.
// Workaround for Claude.ai bug where Bearer token is dropped after OAuth.
// Real security is the server-side Soundtrack API token, not OAuth tokens.
const optionalBearerAuth = (req: Request, res: Response, next: NextFunction) => {
  if (req.headers.authorization) {
    return requireBearerAuth({ verifier: oauthProvider })(req, res, next);
  }
  next();
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseAccountIds(raw: string): string[] {
  return raw.split(",").map((id) => id.trim()).filter(Boolean);
}

function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Soundtrack Your Brand",
      description:
        "Full music management for business locations via Soundtrack. Browse accounts, control playback, search music, create schedules, assign playlists to zones, and generate AI playlists.",
      version: "1.0.0",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/accounts": {
        get: {
          operationId: "listAccounts",
          summary: "List all accounts",
          description: "Returns all Soundtrack Your Brand accounts you have access to.",
          responses: {
            "200": {
              description: "List of accounts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      count: { type: "integer" },
                      accounts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/accounts/search": {
        get: {
          operationId: "searchAccount",
          summary: "Search for an account by name",
          description:
            "Search across all accounts by business name. Use this to find a specific hotel, restaurant, or venue.",
          parameters: [
            {
              name: "name",
              in: "query",
              required: true,
              description: "Business name to search for (partial match, case-insensitive)",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Matching accounts",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      count: { type: "integer" },
                      query: { type: "string" },
                      accounts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/accounts/{accountId}/locations": {
        get: {
          operationId: "listLocations",
          summary: "List locations for an account",
          parameters: [
            {
              name: "accountId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Locations for the account",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      account: { type: "string" },
                      count: { type: "integer" },
                      locations: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            name: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/accounts/{accountId}/zones": {
        get: {
          operationId: "listSoundZones",
          summary: "List sound zones for an account",
          description: "Returns all sound zones organized by location, with pairing status.",
          parameters: [
            {
              name: "accountId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Sound zones by location",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/zones/{zoneId}/now-playing": {
        get: {
          operationId: "getNowPlaying",
          summary: "Get currently playing track",
          description: "Returns the track currently playing in a sound zone.",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Current track info",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      playing: { type: "boolean" },
                      track: { type: "string" },
                      artists: { type: "array", items: { type: "string" } },
                      album: { type: "string", nullable: true },
                      albumArt: { type: "string", nullable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/zones/{zoneId}/volume": {
        post: {
          operationId: "setVolume",
          summary: "Set volume for a sound zone",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["volume"],
                  properties: {
                    volume: {
                      type: "integer",
                      minimum: 0,
                      description: "Volume level (typically 0-16)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Volume set",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: { volume: { type: "integer" } },
                  },
                },
              },
            },
          },
        },
      },
      "/api/zones/{zoneId}/skip": {
        post: {
          operationId: "skipTrack",
          summary: "Skip to next track",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Track skipped",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/zones/{zoneId}/play": {
        post: {
          operationId: "playMusic",
          summary: "Resume playback",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Playback resumed",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/zones/{zoneId}/pause": {
        post: {
          operationId: "pauseMusic",
          summary: "Pause playback",
          parameters: [
            {
              name: "zoneId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Playback paused",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/accounts/{accountId}/playlists": {
        get: {
          operationId: "listPlaylists",
          summary: "List playlists in an account's music library",
          parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Playlists", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          operationId: "createPlaylist",
          summary: "Create a manual playlist",
          parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, description: { type: "string" }, track_ids: { type: "array", items: { type: "string" } } } } } } },
          responses: { "200": { description: "Created playlist", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/accounts/{accountId}/schedules": {
        get: {
          operationId: "listSchedules",
          summary: "List schedules in an account's music library",
          parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Schedules", content: { "application/json": { schema: { type: "object" } } } } },
        },
        post: {
          operationId: "createSchedule",
          summary: "Create a music schedule with time slots",
          parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "slots"], properties: { name: { type: "string" }, description: { type: "string" }, slots: { type: "array", items: { type: "object", properties: { playlist_id: { type: "string" }, days: { type: "string" }, start_time: { type: "string" }, duration_hours: { type: "number" } } } } } } } } },
          responses: { "200": { description: "Created schedule", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/schedules/{scheduleId}": {
        get: {
          operationId: "getScheduleDetails",
          summary: "Get schedule details including time slots",
          parameters: [{ name: "scheduleId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Schedule details", content: { "application/json": { schema: { type: "object" } } } } },
        },
        put: {
          operationId: "updateSchedule",
          summary: "Update an existing schedule",
          parameters: [{ name: "scheduleId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, slots: { type: "array", items: { type: "object" } } } } } } },
          responses: { "200": { description: "Updated schedule", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/search": {
        get: {
          operationId: "searchMusic",
          summary: "Search the Soundtrack music catalog",
          parameters: [
            { name: "query", in: "query", required: true, schema: { type: "string" }, description: "Search query" },
            { name: "type", in: "query", schema: { type: "string", enum: ["playlist", "track", "artist", "album"] }, description: "Content type to search for" },
            { name: "limit", in: "query", schema: { type: "integer" }, description: "Number of results" },
          ],
          responses: { "200": { description: "Search results", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/categories": {
        get: {
          operationId: "browseCategories",
          summary: "Browse music categories",
          responses: { "200": { description: "Music categories", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/categories/{categoryId}/playlists": {
        get: {
          operationId: "browseCategoryPlaylists",
          summary: "List playlists in a category",
          parameters: [{ name: "categoryId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Category playlists", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/playlists/{playlistId}/tracks": {
        get: {
          operationId: "getPlaylistTracks",
          summary: "Get tracks inside a playlist",
          parameters: [
            { name: "playlistId", in: "path", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", schema: { type: "integer" }, description: "Number of tracks" },
          ],
          responses: { "200": { description: "Playlist tracks", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/zones/assign-source": {
        post: {
          operationId: "assignSource",
          summary: "Assign a schedule or playlist to sound zones",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["sound_zone_ids", "source_id"], properties: { sound_zone_ids: { type: "array", items: { type: "string" } }, source_id: { type: "string" } } } } } },
          responses: { "200": { description: "Source assigned", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/zones/{zoneId}/source": {
        get: {
          operationId: "getZoneSource",
          summary: "Get the music source assigned to a zone",
          parameters: [{ name: "zoneId", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Zone source", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/zones/{zoneId}/queue": {
        post: {
          operationId: "queueTracks",
          summary: "Queue tracks in a sound zone",
          parameters: [{ name: "zoneId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["track_ids"], properties: { track_ids: { type: "array", items: { type: "string" } }, play_next: { type: "boolean" } } } } } },
          responses: { "200": { description: "Tracks queued", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/zones/{zoneId}/block": {
        post: {
          operationId: "blockTrack",
          summary: "Block a track from playing in a zone",
          parameters: [{ name: "zoneId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["track_id"], properties: { track_id: { type: "string" } } } } } },
          responses: { "200": { description: "Track blocked", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/accounts/{accountId}/library": {
        post: {
          operationId: "addToLibrary",
          summary: "Add a schedule or playlist to the music library",
          parameters: [{ name: "accountId", in: "path", required: true, schema: { type: "string" } }],
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["source_id"], properties: { source_id: { type: "string" } } } } } },
          responses: { "200": { description: "Added to library", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/accounts/{accountId}/library/{sourceId}": {
        delete: {
          operationId: "removeFromLibrary",
          summary: "Remove from music library",
          parameters: [
            { name: "accountId", in: "path", required: true, schema: { type: "string" } },
            { name: "sourceId", in: "path", required: true, schema: { type: "string" } },
          ],
          responses: { "200": { description: "Removed", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
      "/api/generate-playlist": {
        post: {
          operationId: "generatePlaylist",
          summary: "Generate a playlist from a text description using AI",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["prompt"], properties: { prompt: { type: "string", description: "Describe the music you want" }, market: { type: "string", description: "Country code (e.g. US, TH)" } } } } } },
          responses: { "200": { description: "Generated playlists", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
  };
}

// ── Health Check ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "soundtrack-mcp", version: "1.0.0" });
});

// ── Client-Scoped Routes (/c/:accountIds/*) ───────────────────────────────

// Middleware: alias-aware account ID resolution for the REST API
function aliasScopeMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.params.accountIds as string;
  if (raw) {
    res.locals.scopedAccountIds = resolveScopeSegment(raw);
  }
  next();
}

// Scoped REST API (alias-aware)
app.use("/c/:accountIds/api", aliasScopeMiddleware, apiRouter);

// Scoped OpenAPI spec (alias-aware)
app.get("/c/:accountIds/openapi.json", (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const baseUrl = `${host}/c/${req.params.accountIds as string}`;
  res.json(buildOpenApiSpec(baseUrl));
});

// List configured scope aliases (helpful for ops debugging — no secrets exposed)
app.get("/scope-aliases", (_req, res) => {
  res.json({
    aliases: Object.fromEntries(
      Object.entries(SCOPE_ALIASES).map(([k, v]) => [k, v.length])
    ),
  });
});

// ── Unscoped REST API (for internal / self-hosted use) ────────────────────

app.use("/api", apiRouter);

// ── Unscoped OpenAPI Spec ─────────────────────────────────────────────────

app.get("/openapi.json", (_req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  res.json(buildOpenApiSpec(host));
});

// ── MCP Endpoint ───────────────────────────────────────────────────────────

// Store transports by session ID for stateful connections
const transports = new Map<string, StreamableHTTPServerTransport>();

// Shared MCP handler — creates or reuses sessions
async function handleMcpPost(
  req: Request,
  res: Response,
  accountIds?: string[],
  role: Role = "client"
) {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session
    const server = new McpServer({
      name: "soundtrack-mcp",
      version: "1.0.0",
    });

    registerTools(server, accountIds, role);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // Session ID is set during handleRequest (initialize), so store after
    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }
  } catch (error) {
    console.error("MCP error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
}

// Shared GET/DELETE handler
async function handleMcpSession(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    if (req.method === "DELETE") transports.delete(sessionId);
    return;
  }
  res.status(400).json({ error: "No valid session. Send a POST first." });
}

// Scoped MCP routes (with OAuth) — client role, scoped to URL accountIds.
// The path segment can be either:
//   - A comma-separated list of raw account IDs:  /c/id1,id2,id3/mcp
//   - A scope alias defined in SCOPE_ALIASES:     /c/tui/mcp
app.post("/c/:accountIds/mcp", optionalBearerAuth, (req, res) => {
  const accountIds = resolveScopeSegment(req.params.accountIds as string);
  handleMcpPost(req, res, accountIds, "client");
});
app.get("/c/:accountIds/mcp", optionalBearerAuth, handleMcpSession);
app.delete("/c/:accountIds/mcp", optionalBearerAuth, handleMcpSession);

// Unscoped MCP routes — when OPERATOR_TOKEN is set, the X-Operator-Token
// header gates operator-only tools (subscription_activate, account_register).
// Without the header (or token), connection downgrades to client mode but
// without scoped accountIds — i.e. it can't see anything until the SDK is
// rebuilt with /c/<ids>/mcp. Self-hosted users (no OPERATOR_TOKEN) get
// operator role by default.
app.post("/mcp", optionalBearerAuth, (req, res) => {
  const role: Role = isOperatorRequest(req) ? "operator" : "client";
  handleMcpPost(req, res, undefined, role);
});
app.get("/mcp", optionalBearerAuth, handleMcpSession);
app.delete("/mcp", optionalBearerAuth, handleMcpSession);

// Explicit operator endpoint — same as /mcp but ALWAYS requires the token
// when OPERATOR_TOKEN is set. Use this URL in BMAsia internal MCP configs.
app.post("/operator/mcp", optionalBearerAuth, (req, res) => {
  if (OPERATOR_TOKEN && !isOperatorRequest(req)) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Operator token required" },
      id: null,
    });
  }
  handleMcpPost(req, res, undefined, "operator");
});
app.get("/operator/mcp", optionalBearerAuth, (req, res) => {
  if (OPERATOR_TOKEN && !isOperatorRequest(req)) {
    return res.status(401).json({ error: "Operator token required" });
  }
  handleMcpSession(req, res);
});
app.delete("/operator/mcp", optionalBearerAuth, (req, res) => {
  if (OPERATOR_TOKEN && !isOperatorRequest(req)) {
    return res.status(401).json({ error: "Operator token required" });
  }
  handleMcpSession(req, res);
});

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Soundtrack MCP HTTP server running on port ${PORT}`);
});
