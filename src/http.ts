#!/usr/bin/env node

import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { registerTools } from "./tools.js";
import { oauthProvider } from "./auth.js";
import { randomUUID } from "crypto";
import apiRouter from "./api.js";

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

const app = express();
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

// Bearer token middleware for MCP routes
const bearerAuth = requireBearerAuth({ verifier: oauthProvider });

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
        "Control music playback across business locations via Soundtrack Your Brand. Search accounts, check what's playing, adjust volume, skip tracks, and manage playback.",
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
    },
  };
}

// ── Health Check ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "soundtrack-mcp", version: "1.0.0" });
});

// ── Client-Scoped Routes (/c/:accountIds/*) ───────────────────────────────

// Middleware: extract account IDs from path and set on res.locals
function scopeMiddleware(req: Request, res: Response, next: NextFunction) {
  const raw = req.params.accountIds as string;
  if (raw) {
    res.locals.scopedAccountIds = parseAccountIds(raw);
  }
  next();
}

// Scoped REST API
app.use("/c/:accountIds/api", scopeMiddleware, apiRouter);

// Scoped OpenAPI spec
app.get("/c/:accountIds/openapi.json", (req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  const baseUrl = `${host}/c/${req.params.accountIds as string}`;
  res.json(buildOpenApiSpec(baseUrl));
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
async function handleMcpPost(req: Request, res: Response, accountIds?: string[]) {
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

    registerTools(server, accountIds);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);

    if (transport.sessionId) {
      transports.set(transport.sessionId, transport);
    }

    await transport.handleRequest(req, res, req.body);
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

// Scoped MCP routes (with OAuth)
app.post("/c/:accountIds/mcp", bearerAuth, (req, res) => {
  const accountIds = parseAccountIds(req.params.accountIds as string);
  handleMcpPost(req, res, accountIds);
});
app.get("/c/:accountIds/mcp", bearerAuth, handleMcpSession);
app.delete("/c/:accountIds/mcp", bearerAuth, handleMcpSession);

// Unscoped MCP routes (with OAuth)
app.post("/mcp", bearerAuth, (req, res) => handleMcpPost(req, res));
app.get("/mcp", bearerAuth, handleMcpSession);
app.delete("/mcp", bearerAuth, handleMcpSession);

// ── Start ──────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Soundtrack MCP HTTP server running on port ${PORT}`);
});
