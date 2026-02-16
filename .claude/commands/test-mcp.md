Test the Soundtrack MCP server:

1. Build the project: `npm run build`
2. Run the MCP inspector: `npx @modelcontextprotocol/inspector node dist/index.js`
3. In the inspector UI, test each tool:
   - `list_accounts` - verify API authentication works
   - `list_locations` - verify account access
   - `list_sound_zones` - verify zone discovery
   - `get_now_playing` - verify playback status
4. Report any errors with the full error message
