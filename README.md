# Soundtrack MCP Server

Control music playback across your business locations with AI. This MCP server connects [Soundtrack Your Brand](https://www.soundtrackyourbrand.com/) to Claude, ChatGPT, and any MCP-compatible AI assistant.

> **Built by [bmasia](https://bmasiamusic.com)** — a Soundtrack Your Brand reseller.

## What Can It Do?

Talk to your AI assistant in natural language:

- *"What's playing at the lobby right now?"*
- *"Turn the volume down to 5 in the restaurant zone"*
- *"Skip this track in the bar"*
- *"Pause music in all zones"*
- *"Show me all my sound zones"*

## Quick Start for bmasia Clients

If your account is managed by bmasia, you can use our hosted server. You just need your **account ID** — a string that looks like `QWNjb3VudCwsMXN4N242NTZyeTgv`.

**How to find your account ID:**
- Ask your bmasia representative — they'll send you a ready-to-use URL
- Or find it in your Soundtrack Your Brand dashboard URL (the long code after `/accounts/`)

Replace `YOUR_ACCOUNT_ID` below with your actual account ID.

---

### Claude Desktop

Edit your config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "soundtrack": {
      "type": "url",
      "url": "https://soundtrack-mcp.onrender.com/c/YOUR_ACCOUNT_ID/mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see "soundtrack" in your connectors.

### Claude.ai (web)

1. Go to [claude.ai](https://claude.ai) > Settings > Integrations
2. Add integration > Custom MCP server
3. Enter the URL: `https://soundtrack-mcp.onrender.com/c/YOUR_ACCOUNT_ID/mcp`
4. Save and start a new chat

### ChatGPT

1. Go to [ChatGPT](https://chat.openai.com) > Explore GPTs > Create a GPT
2. Go to **Configure** > **Actions** > **Create new action**
3. Click **Import from URL** and paste:
   ```
   https://soundtrack-mcp.onrender.com/c/YOUR_ACCOUNT_ID/openapi.json
   ```
4. Set Authentication to **None**
5. Save and try: *"What's currently playing?"*

> **Note:** The hosted server on Render's free tier may take ~50 seconds to wake up after inactivity. Subsequent requests are fast.

### Multiple accounts

If you manage several accounts, separate them with commas:

```
https://soundtrack-mcp.onrender.com/c/ACCOUNT_ID_1,ACCOUNT_ID_2/mcp
```

---

## Self-Hosting (non-bmasia users)

If you have your own Soundtrack Your Brand API credentials, you can run the server yourself.

### 1. Get API credentials

Apply for API access at [soundtrackyourbrand.com/our-api/apply](https://www.soundtrackyourbrand.com/our-api/apply). You'll receive a Client ID and Client Secret.

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

### 5. Connect to Claude Desktop

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

### 6. (Optional) Run as HTTP server

For Claude.ai, ChatGPT, or any remote client:

```bash
npm run start:http
```

Starts on port 3000 (or `PORT` env var) with:

| Endpoint | Use with |
|----------|----------|
| `/mcp` | Claude.ai, MCP clients |
| `/api/*` | ChatGPT Actions (REST) |
| `/openapi.json` | ChatGPT GPT setup |
| `/c/{accountIds}/mcp` | Scoped MCP (per-client) |
| `/c/{accountIds}/api/*` | Scoped REST (per-client) |
| `/health` | Health checks |

Deploy to Render, Railway, Fly.io, or any Node.js host. Set `SOUNDTRACK_API_TOKEN` as an environment variable.

### 7. (Optional) Scope to specific accounts

Two ways to scope:

**Via URL path** (for hosted/multi-client setups):
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
| `list_accounts` | List all accounts (paginated for 900+) |
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
  index.ts     stdio entry point (Claude Desktop)
  http.ts      HTTP entry point (Claude.ai / ChatGPT / remote)
  api.ts       REST API router (ChatGPT Actions)
```

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk) v1.26
- [Soundtrack Your Brand GraphQL API](https://www.soundtrackyourbrand.com/our-api)
- TypeScript, Express, Zod

## Development

```bash
npm run dev      # Watch mode (auto-recompile)
npm run build    # One-time compile
npm run inspect  # MCP Inspector (test tools interactively)
```

## License

MIT
