# Soundtrack MCP Server

## Project Overview
MCP server that connects Soundtrack Your Brand's GraphQL API to Claude Desktop. Enables natural language control of music playback across 100+ business locations managed by bmasia.

## Status: Live in Claude Desktop

## Architecture
- **Type**: MCP Server (stdio transport, local)
- **Language**: TypeScript
- **API**: Soundtrack Your Brand GraphQL API at `https://api.soundtrackyourbrand.com/v2`
- **Auth**: Basic Authentication with base64-encoded API token
- **SDK**: `@modelcontextprotocol/sdk` v1.26 + Zod v4
- **Config**: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Key Files
- `src/index.ts` - MCP server entry point + all 9 tool registrations
- `src/client.ts` - GraphQL client with Basic auth (no dotenv — env vars passed via config)
- `src/queries.ts` - All GraphQL query/mutation strings
- `.env` - API credentials for local dev/testing (NEVER commit)
- `.env.example` - Safe template
- `docs/soundtrack-api-reference.md` - Full API reference

## Tools
1. `list_accounts` - Browse all managed accounts
2. `list_locations` - Get locations for an account
3. `list_sound_zones` - Get zones + paired status for an account
4. `get_now_playing` - Current track in a sound zone
5. `set_volume` - Adjust volume for a zone
6. `skip_track` - Skip to next track
7. `play` - Resume playback
8. `pause` - Pause playback
9. `get_account_overview` - Full tree of all accounts/locations/zones

## Commands
- `npm run build` - Compile TypeScript
- `npm run dev` - Watch mode
- `npm run start` - Run the server
- `npm run inspect` - Run MCP inspector for testing

## Code Style
- TypeScript strict mode
- ES modules (import/export)
- Async/await for all API calls
- Error handling: wrap GraphQL calls, return user-friendly messages
- No emoji in code unless user requests it

## Common Gotchas
- **dotenv v17 breaks MCP stdio** — it prints to stdout, corrupting JSON-RPC. Pass env vars via claude_desktop_config.json `env` field instead.
- Soundtrack API uses Relay-style pagination (edges/nodes/pageInfo)
- Sound zone IDs are required for most operations (not location names)
- Volume range may vary by hardware (typically 0-16)
- `me` query shape differs for PublicAPIClient vs User auth types
- API tokens get revoked if exposed publicly
- Visitors cannot control playback (licensing restriction)
