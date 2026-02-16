# MCP Server Development Rules

## Tool Design
- Each MCP tool should do ONE thing well
- Tool descriptions must be clear enough for the AI to choose the right tool
- Return structured, readable text (not raw JSON) from tools
- Include available options in tool descriptions (e.g., list valid location names)
- Handle errors gracefully - return helpful messages, not stack traces

## GraphQL Best Practices
- Use parameterized queries (variables), never string interpolation
- Request only the fields needed (avoid over-fetching)
- Handle Relay pagination (edges/nodes) in utility functions
- Check for `errors` array in GraphQL responses before accessing `data`

## Authentication
- Never hardcode API credentials in source code
- Load credentials from environment variables
- Use .env files for local development (gitignored)
- The Basic auth token is base64-encoded and goes in the Authorization header

## Error Handling
- Wrap all API calls in try/catch
- Return user-friendly error messages from tools
- Log detailed errors for debugging
- Handle rate limiting (check x-ratelimiting-tokens-available header)

## Testing
- Test each tool independently using MCP inspector
- Verify authentication works before testing tools
- Test with real zone IDs from the account
