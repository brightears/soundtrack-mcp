# Soundtrack MCP Server

Control music playback across your business locations with AI. This MCP server connects [Soundtrack Your Brand](https://www.soundtrackyourbrand.com/) to Claude, ChatGPT, and any MCP-compatible AI assistant.

> **Built by [bmasia](https://github.com/brightears)** — a Soundtrack Your Brand reseller managing 900+ locations across Asia Pacific.

## What Can It Do?

Talk to your AI assistant in natural language:

- *"What's playing at the Hilton Pattaya lobby right now?"*
- *"Turn the volume down to 5 in the restaurant zone"*
- *"Skip this track in the bar"*
- *"Pause music in all zones at the Bangkok office"*
- *"Show me all sound zones for Centara Grand"*

## Quick Start

### Are you a bmasia client?

If your account is managed by bmasia, you can use our hosted server immediately — no setup required.

**For Claude Desktop:**

Edit your Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add this to the `mcpServers` section:

```json
{
  "mcpServers": {
    "soundtrack": {
      "type": "url",
      "url": "https://soundtrack-mcp.onrender.com/mcp"
    }
  }
}
```

Restart Claude Desktop. You'll see "soundtrack" in your connectors. Start chatting!

**For Claude.ai (web):**

1. Go to [claude.ai](https://claude.ai) Settings > Integrations
2. Add integration > Custom MCP server
3. Enter the URL: `https://soundtrack-mcp.onrender.com/mcp`
4. Save and start a new chat

**For ChatGPT:**

1. Go to [ChatGPT](https://chat.openai.com) > Explore GPTs > Create a GPT
2. Go to the **Configure** tab > **Actions** > **Create new action**
3. Click **Import from URL** and paste: `https://soundtrack-mcp.onrender.com/openapi.json`
4. Set Authentication to **None**
5. Save and test with *"Search for Hilton"*

> **Note:** The hosted server on Render's free tier may take ~50 seconds to wake up on the first request after inactivity. Subsequent requests are fast.

---

### Not a bmasia client? Run your own server

If you have your own Soundtrack Your Brand API credentials, you can run the server yourself.

#### 1. Get API credentials

Apply for API access at [soundtrackyourbrand.com/our-api/apply](https://www.soundtrackyourbrand.com/our-api/apply). You'll receive a Client ID and Client Secret.

Create a base64-encoded token:

```bash
echo -n "YOUR_CLIENT_ID:YOUR_CLIENT_SECRET" | base64
```

#### 2. Clone and install

```bash
git clone https://github.com/brightears/soundtrack-mcp.git
cd soundtrack-mcp
npm install
```

#### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your base64-encoded token:

```
SOUNDTRACK_API_TOKEN=your_base64_encoded_token_here
```

#### 4. Build

```bash
npm run build
```

#### 5. Connect to Claude Desktop

Edit your Claude Desktop config:

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

#### 6. (Optional) Run as HTTP server

To use with Claude.ai, ChatGPT, or any remote client:

```bash
npm run start:http
```

This starts the server on port 3000 (or `PORT` env var) with:

| Endpoint | Protocol | Use with |
|----------|----------|----------|
| `/mcp` | MCP over HTTP | Claude.ai, MCP clients |
| `/api/*` | REST | ChatGPT Actions |
| `/openapi.json` | OpenAPI 3.1 spec | ChatGPT GPT configuration |
| `/health` | JSON | Health checks |

Deploy to Render, Railway, Fly.io, or any Node.js host. Set `SOUNDTRACK_API_TOKEN` as an environment variable on your hosting platform.

#### 7. (Optional) Scope to specific accounts

If you manage multiple accounts and want to limit access (e.g., for a customer deployment), set:

```bash
SOUNDTRACK_ACCOUNT_IDS=QWNjb3VudCwsMXN4N242NTZyeTgv,QWNjb3VudCwsMWtsMmhrdGVsOGcv
```

This comma-separated list of account IDs restricts all tools to only those accounts.

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

## REST API Endpoints

For ChatGPT and other REST clients:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/accounts` | List all accounts |
| GET | `/api/accounts/search?name=hilton` | Search by name |
| GET | `/api/accounts/:id/locations` | List locations |
| GET | `/api/accounts/:id/zones` | List sound zones |
| GET | `/api/zones/:id/now-playing` | Current track |
| POST | `/api/zones/:id/volume` | Set volume `{"volume": 8}` |
| POST | `/api/zones/:id/skip` | Skip track |
| POST | `/api/zones/:id/play` | Resume playback |
| POST | `/api/zones/:id/pause` | Pause playback |

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
