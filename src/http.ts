#!/usr/bin/env node

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { randomUUID } from "crypto";
import apiRouter from "./api.js";

const app = express();
app.use(express.json());

// ── Health Check ───────────────────────────────────────────────────────────

app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: "soundtrack-mcp", version: "1.0.0" });
});

// ── REST API (for ChatGPT Actions) ────────────────────────────────────────

app.use("/api", apiRouter);

// ── OpenAPI Spec (for ChatGPT GPT configuration) ──────────────────────────

app.get("/openapi.json", (_req, res) => {
  const host = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  res.json({
    openapi: "3.1.0",
    info: {
      title: "Soundtrack Your Brand",
      description:
        "Control music playback across business locations via Soundtrack Your Brand. Search accounts, check what's playing, adjust volume, skip tracks, and manage playback.",
      version: "1.0.0",
    },
    servers: [{ url: host }],
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
  });
});

// ── MCP Endpoint ───────────────────────────────────────────────────────────

// Store transports by session ID for stateful connections
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", async (req, res) => {
  try {
    // Check for existing session
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && transports.has(sessionId)) {
      // Reuse existing transport for this session
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — create server + transport
    const server = new McpServer({
      name: "soundtrack-mcp",
      version: "1.0.0",
    });

    registerTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    // Store transport for session reuse
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) transports.delete(sid);
    };

    await server.connect(transport);

    // Store after connect so sessionId is set
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
});

// Handle GET for SSE streams (required by spec)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    return;
  }
  res.status(400).json({ error: "No valid session. Send a POST to /mcp first." });
});

// Handle DELETE for session cleanup
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && transports.has(sessionId)) {
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
    return;
  }
  res.status(400).json({ error: "No valid session." });
});

// ── Start ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Soundtrack MCP HTTP server running on port ${PORT}`);
});
