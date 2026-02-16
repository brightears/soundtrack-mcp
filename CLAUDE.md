# Soundtrack MCP Server

## Project Overview
MCP server connecting Soundtrack Your Brand's GraphQL API to Claude and ChatGPT. Natural language control of music playback across 900+ business locations managed by bmasia.

## Status: Live on Claude Desktop + Claude.ai + ChatGPT + Render

## Deployments
- **Claude Desktop**: stdio transport via `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude.ai**: HTTP transport at `https://soundtrack-mcp.onrender.com/mcp`
- **ChatGPT**: REST API at `https://soundtrack-mcp.onrender.com/api/*`, OpenAPI spec at `/openapi.json`
- **GitHub**: https://github.com/brightears/soundtrack-mcp (public, auto-deploys to Render)
- **Render**: srv-d69dvu8gjchc73chumg0 (free plan, oregon)

## Architecture
- **Language**: TypeScript (strict mode, ES modules)
- **SDK**: `@modelcontextprotocol/sdk` v1.26 + Zod v4 + Express
- **Transports**: stdio (`src/index.ts`) + HTTP (`src/http.ts`)
- **API**: Soundtrack Your Brand GraphQL at `https://api.soundtrackyourbrand.com/v2`
- **Auth**: Basic Authentication with base64-encoded API token

## Key Files
- `src/tools.ts` - All 10 tool registrations (shared between transports)
- `src/client.ts` - GraphQL client, auth, scoped account IDs helper
- `src/queries.ts` - All GraphQL query/mutation strings
- `src/index.ts` - stdio entry point (Claude Desktop)
- `src/http.ts` - HTTP entry point (Render / Claude.ai / ChatGPT), serves MCP + REST + OpenAPI
- `src/api.ts` - REST API router for ChatGPT Actions (Express)
- `.env` - API credentials for local dev (NEVER commit)

## Tools (10)
1. `list_accounts` - Browse all accounts (paginated, supports 900+)
2. `search_account` - Search accounts by name across all pages
3. `list_locations` - Get locations for an account
4. `list_sound_zones` - Get zones + paired status
5. `get_now_playing` - Current track in a zone
6. `set_volume` - Adjust volume (0-16 typical)
7. `skip_track` - Skip to next track
8. `play` - Resume playback
9. `pause` - Pause playback
10. `get_account_overview` - Full tree of accounts/locations/zones

## Customer Scoping
Two methods:
- **URL path** (hosted/multi-client): `/c/ACCOUNT_ID_1,ACCOUNT_ID_2/mcp` or `/c/.../api/*`
- **Env var** (self-hosted): `SOUNDTRACK_ACCOUNT_IDS=id1,id2`

URL path takes priority. Scoping affects account discovery tools (list_accounts, search_account, get_account_overview).

## Commands
- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm run start` - Run stdio server
- `npm run start:http` - Run HTTP server
- `npm run inspect` - MCP inspector

## Common Gotchas
- **dotenv v17 breaks MCP stdio** — prints to stdout. Use env vars from config instead.
- Soundtrack API uses Relay pagination (edges/nodes/pageInfo) — always paginate with `after` cursor
- `me` query uses `...on PublicAPIClient` fragment for API token auth
- API tokens get revoked if exposed publicly
- Render free tier: ~50s cold start after inactivity
