# Soundtrack MCP Server

## Project Overview
MCP server connecting Soundtrack Your Brand's GraphQL API to Claude and ChatGPT. Natural language control of music playback across 900+ business locations managed by bmasia.

## Status: Live on Claude Desktop + Claude.ai + Render

## Deployments
- **Claude Desktop**: stdio transport via `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Claude.ai**: MCP Connector with OAuth at `https://soundtrack-mcp.onrender.com/mcp`
- **ChatGPT**: MCP Connector (same URL, needs Developer mode setup)
- **REST API**: `https://soundtrack-mcp.onrender.com/api/*`, OpenAPI spec at `/openapi.json`
- **GitHub**: https://github.com/brightears/soundtrack-mcp (public, auto-deploys to Render)
- **Render**: srv-d69dvu8gjchc73chumg0 (paid plan, oregon)

## Architecture
- **Language**: TypeScript (strict mode, ES modules)
- **SDK**: `@modelcontextprotocol/sdk` v1.26 + Zod v4 + Express
- **Transports**: stdio (`src/index.ts`) + HTTP (`src/http.ts`)
- **API**: Soundtrack Your Brand GraphQL at `https://api.soundtrackyourbrand.com/v2`
- **Auth**: Basic Authentication with base64-encoded API token (Soundtrack API)
- **OAuth**: Auto-approving OAuth 2.1 provider for Claude.ai/ChatGPT Connectors (`src/auth.ts`)

## Key Files
- `src/tools.ts` - All 26 tool registrations (shared between transports)
- `src/client.ts` - GraphQL client, auth, scoped account IDs helper
- `src/queries.ts` - All GraphQL query/mutation strings
- `src/index.ts` - stdio entry point (Claude Desktop)
- `src/http.ts` - HTTP entry point (Render / Claude.ai / ChatGPT), serves MCP + REST + OpenAPI + OAuth
- `src/auth.ts` - OAuth 2.1 provider (auto-approving, in-memory tokens, DCR support)
- `src/api.ts` - REST API router for ChatGPT Actions (Express)
- `.env` - API credentials for local dev (NEVER commit)

## Tools (26)

### Discovery (5)
1. `list_accounts` - Browse all accounts
2. `search_account` - Search accounts by name
3. `list_locations` - Get locations for an account
4. `list_sound_zones` - Get zones + paired status
5. `get_account_overview` - Full tree of accounts/locations/zones

### Playback Control (5)
6. `get_now_playing` - Current track in a zone
7. `set_volume` - Adjust volume (0-16 typical)
8. `skip_track` - Skip to next track
9. `play` - Resume playback
10. `pause` - Pause playback

### Library & Music Discovery (5)
11. `list_playlists` - Playlists in an account's music library
12. `list_schedules` - Schedules in an account's music library
13. `search_music` - Search catalog (playlists, tracks, artists, albums)
14. `browse_categories` - Browse music categories + their playlists
15. `get_playlist_tracks` - See tracks inside a playlist

### Schedule Management (3)
16. `create_schedule` - Create schedule with time slots (daily/weekday/weekend/specific days)
17. `update_schedule` - Update an existing schedule (replaces all slots)
18. `get_schedule_details` - See slots and playlists in a schedule

### Zone Assignment (2)
19. `assign_source` - Assign a schedule/playlist to zones (makes music play)
20. `get_zone_source` - See what schedule/playlist is assigned to a zone

### Content Management (5)
21. `create_playlist` - Create a manual playlist with optional tracks
22. `queue_tracks` - Queue tracks to play next in a zone
23. `block_track` - Block a track from playing in a zone
24. `add_to_library` - Add schedule/playlist to music library
25. `remove_from_library` - Remove from music library

### AI Features (1)
26. `generate_playlist` - AI-generated playlist from text description (non-functional: requires user session, not API token)

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

## Security
- Repo is **public** — audited, no secrets in git history or tracked files
- `.env` is gitignored and was never committed
- All credentials via environment variables only
- Share link: https://github.com/brightears/soundtrack-mcp

## Common Gotchas
- **dotenv v17 breaks MCP stdio** — prints to stdout. Use env vars from config instead.
- **StreamableHTTP session ID** is set during `handleRequest`, not `connect` — store transport AFTER handleRequest
- **Claude.ai drops Bearer token** after OAuth (bug #2157) — bearer auth is optional on MCP routes
- Soundtrack API uses Relay pagination (edges/nodes/pageInfo) — always paginate with `after` cursor
- `me` query uses `...on PublicAPIClient` fragment for API token auth
- API tokens get revoked if exposed publicly
- Express 5 types: `req.params` values are `string | string[]` — cast with `as string`
- **`trust proxy` required on Render** — MCP SDK's rate limiter throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` without it
- **Render deploys kill MCP sessions** — users must start a new chat after each deploy
- **Schedule BYDAY accepts only one day per rrule** — `convertSlots()` expands multi-day into separate slots
- **`setVolume` uses `Volume!` scalar** — not `Int!`
- **No "get volume" query exists** — volume is write-only
- **`BlockTrackInput.reasons` is an enum** — valid: `bad_context`, `dislike`, `explicit`, `other`, `playback`
- **Playlist preview URLs** — `https://app.soundtrack.io/music/{id}` included in search, browse, list, and zone source results
