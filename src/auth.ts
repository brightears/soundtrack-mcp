/**
 * Minimal OAuth 2.1 provider for Claude.ai / ChatGPT MCP Connectors.
 *
 * Since the Soundtrack API token is a shared server-side credential,
 * we don't need per-user auth. This provider auto-approves all
 * authorization requests and issues in-memory tokens.
 *
 * Tokens are lost on server restart — clients simply re-auth.
 */

import { randomUUID } from "crypto";
import type { Response } from "express";
import type {
  OAuthServerProvider,
  AuthorizationParams,
} from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

// ── In-memory stores ────────────────────────────────────────────────────────

const clients = new Map<string, OAuthClientInformationFull>();
const codes = new Map<
  string,
  { client: OAuthClientInformationFull; params: AuthorizationParams }
>();
const tokens = new Map<
  string,
  { clientId: string; scopes: string[]; expiresAt: number }
>();
const refreshTokens = new Map<
  string,
  { clientId: string; scopes: string[] }
>();

const TOKEN_TTL_MS = 3600 * 1000; // 1 hour

// ── OAuth Server Provider ───────────────────────────────────────────────────

export const oauthProvider: OAuthServerProvider = {
  clientsStore: {
    getClient(clientId: string) {
      return clients.get(clientId);
    },

    // The SDK's register handler generates client_id before calling this
    registerClient(clientInfo: OAuthClientInformationFull) {
      clients.set(clientInfo.client_id, clientInfo);
      console.log(`OAuth: registered client ${clientInfo.client_id}`);
      return clientInfo;
    },
  },

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response
  ) {
    // Auto-approve: generate code and redirect immediately
    const code = randomUUID();
    codes.set(code, { client, params });

    const url = new URL(params.redirectUri);
    url.searchParams.set("code", code);
    if (params.state) {
      url.searchParams.set("state", params.state);
    }

    console.log(`OAuth: authorized client ${client.client_id}`);
    res.redirect(url.toString());
  },

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<string> {
    const stored = codes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code");
    }
    return stored.params.codeChallenge;
  },

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string
  ): Promise<OAuthTokens> {
    const stored = codes.get(authorizationCode);
    if (!stored) {
      throw new Error("Invalid authorization code");
    }
    if (stored.client.client_id !== client.client_id) {
      throw new Error("Client mismatch");
    }

    codes.delete(authorizationCode);

    const accessToken = randomUUID();
    const refreshToken = randomUUID();

    tokens.set(accessToken, {
      clientId: client.client_id,
      scopes: stored.params.scopes || [],
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });

    refreshTokens.set(refreshToken, {
      clientId: client.client_id,
      scopes: stored.params.scopes || [],
    });

    console.log(`OAuth: issued tokens for client ${client.client_id}`);
    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: (stored.params.scopes || []).join(" "),
    };
  },

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string
  ): Promise<OAuthTokens> {
    const stored = refreshTokens.get(refreshToken);
    if (!stored || stored.clientId !== client.client_id) {
      throw new Error("Invalid refresh token");
    }

    const newAccessToken = randomUUID();
    const newRefreshToken = randomUUID();

    tokens.set(newAccessToken, {
      clientId: client.client_id,
      scopes: stored.scopes,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });

    refreshTokens.delete(refreshToken);
    refreshTokens.set(newRefreshToken, {
      clientId: client.client_id,
      scopes: stored.scopes,
    });

    console.log(`OAuth: refreshed tokens for client ${client.client_id}`);
    return {
      access_token: newAccessToken,
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: newRefreshToken,
      scope: stored.scopes.join(" "),
    };
  },

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = tokens.get(token);
    if (!stored || stored.expiresAt < Date.now()) {
      if (stored) tokens.delete(token);
      throw new Error("Invalid or expired access token");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: Math.floor(stored.expiresAt / 1000),
    };
  },

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string }
  ) {
    tokens.delete(request.token);
    refreshTokens.delete(request.token);
  },
};
