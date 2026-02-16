// Env vars are passed via claude_desktop_config.json or set manually.
// Do NOT use dotenv here — it prints to stdout which breaks the MCP stdio protocol.

const API_URL =
  process.env.SOUNDTRACK_API_URL || "https://api.soundtrackyourbrand.com/v2";
const API_TOKEN = process.env.SOUNDTRACK_API_TOKEN || "";

if (!API_TOKEN) {
  console.error(
    "SOUNDTRACK_API_TOKEN not set. Add it to .env or set the environment variable."
  );
}

// Optional: scope to specific account IDs (comma-separated)
// When set, list_accounts returns only these accounts instead of paginating all.
// Example: SOUNDTRACK_ACCOUNT_IDS=QWNjb3VudCwsMWNqMTM3Ymp3MXMv,QWNjb3VudCwsMW1sbTJ0ZW52OWMv
const ACCOUNT_IDS_RAW = process.env.SOUNDTRACK_ACCOUNT_IDS || "";

export function getScopedAccountIds(): string[] | null {
  if (!ACCOUNT_IDS_RAW.trim()) return null;
  return ACCOUNT_IDS_RAW.split(",").map((id) => id.trim()).filter(Boolean);
}

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; path?: string[] }>;
}

export async function graphql<T = unknown>(
  query: string,
  variables?: Record<string, unknown>
): Promise<GraphQLResponse<T>> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Soundtrack API error (${response.status}): ${text}`);
  }

  const json = (await response.json()) as GraphQLResponse<T>;

  if (json.errors?.length) {
    const messages = json.errors.map((e) => e.message).join("; ");
    throw new Error(`GraphQL error: ${messages}`);
  }

  return json;
}

// Helper to extract nodes from Relay-style edges
export function extractNodes<T>(connection: {
  edges: Array<{ node: T }>;
}): T[] {
  return connection.edges.map((edge) => edge.node);
}
