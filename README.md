# Soundtrack MCP Server

Control music playback across your business locations with AI. This MCP server connects [Soundtrack](https://www.soundtrack.io/) to Claude, ChatGPT, and any MCP-compatible AI assistant.

> **Built by [bmasia](https://bmasiamusic.com)** — a Soundtrack reseller.

## What Can It Do?

Talk to your AI assistant in natural language:

- *"What's playing at the lobby right now?"*
- *"Turn the volume down to 5 in the restaurant zone"*
- *"Skip this track in the bar"*
- *"Pause music in all zones"*
- *"Show me all my sound zones"*

---

## Quick Start for bmasia Clients

If your account is managed by bmasia, you can connect in minutes using our hosted server. No setup, no API keys, no hosting required.

Ask your bmasia representative — they'll send you the **server URL** and your **account ID**. Replace `YOUR_SERVER` and `YOUR_ACCOUNT_ID` in the examples below.

### Claude Desktop

Edit your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "soundtrack": {
      "type": "url",
      "url": "https://YOUR_SERVER/c/YOUR_ACCOUNT_ID/mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see "soundtrack" in your connectors.

### Claude.ai (web & mobile)

1. Go to [claude.ai](https://claude.ai) > **Settings** > **Connectors**
2. Click **Add custom connector**
3. Enter the URL: `https://YOUR_SERVER/c/YOUR_ACCOUNT_ID/mcp`
4. Click **Add** — OAuth will complete automatically
5. Start a new chat and try: *"What's playing right now?"*

### ChatGPT

1. Go to [chatgpt.com](https://chatgpt.com) > **Settings** > **Apps**
2. Enable **Developer mode** (requires ChatGPT Plus)
3. Click **Add connector** and enter the URL:
   ```
   https://YOUR_SERVER/c/YOUR_ACCOUNT_ID/mcp
   ```
4. OAuth will complete automatically
5. Start a new chat and try: *"Show me my sound zones"*

### Multiple accounts

If you manage several accounts, separate them with commas:

```
https://YOUR_SERVER/c/ACCOUNT_ID_1,ACCOUNT_ID_2/mcp
```

### Account isolation

Each scoped URL only has access to the specified account(s). Hotel A cannot see Hotel B's data — they each get their own URL with their own account ID.

---

## Self-Hosting (for non-bmasia users)

If you're **not** a bmasia client, you'll need your own Soundtrack API credentials and your own server. The hosted bmasia server uses bmasia's API key, which only works for bmasia-managed accounts.

### 1. Get API credentials

Apply for API access at [soundtrack.io/our-api/apply](https://www.soundtrack.io/our-api/apply). You'll receive a Client ID and Client Secret.

Create a base64-encoded token:

```bash
echo -n "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" | base64
```

### 2. Clone and install

```bash
git clone https://github.com/brightears/soundtrack-mcp.git
cd soundtrack-mcp
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your base64-encoded token:

```
SOUNDTRACK_API_TOKEN=your_base64_encoded_token_here
```

### 4. Build

```bash
npm run build
```

### 5. Connect to Claude Desktop (local)

Edit your config:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "soundtrack": {
      "command": "node",
      "args": ["/full/path/to/soundtrack-mcp/dist/index.js"],
      "env": {
        "SOUNDTRACK_API_TOKEN": "your_base64_encoded_token_here"
      }
    }
  }
}
```

Restart Claude Desktop.

### 6. Deploy as HTTP server (for web/mobile access)

To use with Claude.ai, ChatGPT, or any remote MCP client, deploy the HTTP server:

```bash
npm run start:http
```

Starts on port 3000 (or `PORT` env var). The server includes built-in OAuth 2.1 support required by Claude.ai and ChatGPT.

| Endpoint | Use with |
|----------|----------|
| `/mcp` | Claude.ai, ChatGPT, MCP clients |
| `/api/*` | REST API |
| `/openapi.json` | OpenAPI spec |
| `/c/{accountIds}/mcp` | Scoped MCP (per-client) |
| `/c/{accountIds}/api/*` | Scoped REST (per-client) |
| `/health` | Health checks |

Deploy to Render, Railway, Fly.io, or any Node.js host. Set `SOUNDTRACK_API_TOKEN` as an environment variable.

Once deployed, add it as a connector in Claude.ai or ChatGPT using your server's URL (e.g. `https://your-server.com/mcp`).

### 7. (Optional) Scope to specific accounts

Two ways to limit which accounts are visible:

**Via URL path** (for multi-client setups):
```
https://your-server.com/c/ACCOUNT_ID_1,ACCOUNT_ID_2/mcp
```

**Via environment variable** (for single-client setups):
```bash
SOUNDTRACK_ACCOUNT_IDS=ACCOUNT_ID_1,ACCOUNT_ID_2
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_accounts` | List all accounts |
| `search_account` | Search accounts by business name |
| `list_locations` | List locations for an account |
| `list_sound_zones` | List sound zones with pairing status |
| `get_now_playing` | Current track in a sound zone |
| `set_volume` | Set volume (typically 0-16) |
| `skip_track` | Skip to next track |
| `play` | Resume playback |
| `pause` | Pause playback |
| `get_account_overview` | Full account/location/zone tree |

## Architecture

```
src/
  client.ts    GraphQL client + auth
  queries.ts   GraphQL queries & mutations
  tools.ts     MCP tool definitions (shared)
  auth.ts      OAuth 2.1 provider (auto-approving)
  index.ts     stdio entry point (Claude Desktop)
  http.ts      HTTP entry point (Claude.ai / ChatGPT / remote)
  api.ts       REST API router
```

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) v1.26
- [Soundtrack GraphQL API](https://www.soundtrack.io/our-api)
- TypeScript, Express, Zod

## Development

```bash
npm run dev      # Watch mode (auto-recompile)
npm run build    # One-time compile
npm run inspect  # MCP Inspector (test tools interactively)
```

## License

MIT
