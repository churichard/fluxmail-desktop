import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { OAuth2Client, type Credentials } from "google-auth-library";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "openid",
  "email",
  "profile",
];
const OAUTH_LOOPBACK_HOST = "127.0.0.1";

export interface GoogleIdentity {
  email: string;
  displayName?: string;
  tokens: Credentials;
}

export async function runGoogleOAuth(input: {
  clientId: string;
  clientSecret: string;
  port: number;
  openExternal(url: string): Promise<void>;
}): Promise<GoogleIdentity> {
  const redirectUri = googleOAuthRedirectUri(input.port);
  const client = new OAuth2Client({
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri,
  });
  const state = randomBytes(24).toString("hex");
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: GMAIL_SCOPES,
    state,
  });

  return new Promise<GoogleIdentity>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      server.closeAllConnections();
      callback();
    };
    const server = createServer(async (request, response) => {
      try {
        const url = new URL(request.url ?? "/", redirectUri);
        if (url.pathname !== "/oauth/callback") {
          response.writeHead(404).end("Not found");
          return;
        }
        if (!isOAuthStateValid(state, url.searchParams.get("state"))) {
          response
            .writeHead(400)
            .end("The sign-in request did not match. Return to Fluxmail and try again.");
          return;
        }
        const oauthError = url.searchParams.get("error");
        if (oauthError) throw new Error(`Google sign-in failed: ${oauthError}`);
        const code = url.searchParams.get("code");
        if (!code) throw new Error("Google did not return an authorization code.");
        const { tokens } = await client.getToken(code);
        if (!tokens.refresh_token) {
          throw new Error(
            "Google did not return a refresh token. Remove Fluxmail from Google account access and try again.",
          );
        }
        if (!tokens.id_token) throw new Error("Google did not return an identity token.");
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: input.clientId,
        });
        const payload = ticket.getPayload();
        if (!payload?.email || !payload.email_verified)
          throw new Error("Google did not return a verified email address.");
        const identity: GoogleIdentity = {
          email: payload.email,
          ...(payload.name ? { displayName: payload.name } : {}),
          tokens,
        };
        response
          .writeHead(200, { "content-type": "text/html; charset=utf-8" })
          .end(successPage(identity.email));
        response.once("close", () => settle(() => resolve(identity)));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Fluxmail could not connect this account.";
        response
          .writeHead(400, { "content-type": "text/html; charset=utf-8" })
          .end(errorPage(message));
        response.once("close", () => settle(() => reject(error)));
      }
    });
    const timeout = setTimeout(
      () =>
        settle(() =>
          reject(new Error("Google sign-in timed out. Try connecting the account again.")),
        ),
      10 * 60_000,
    );
    server.once("error", (error: NodeJS.ErrnoException) => {
      const resolved =
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${input.port} is already in use. Close the app using that port and try again.`,
            )
          : error;
      settle(() => reject(resolved));
    });
    server.listen(input.port, OAUTH_LOOPBACK_HOST, () => {
      void input.openExternal(authUrl).catch((error) => settle(() => reject(error)));
    });
  });
}

export function googleOAuthRedirectUri(port: number): string {
  return `http://${OAUTH_LOOPBACK_HOST}:${port}/oauth/callback`;
}

export function isOAuthStateValid(expected: string, actual: string | null): boolean {
  return expected.length >= 32 && actual === expected;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character]!;
  });
}

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:520px;margin:80px auto;padding:24px;color:#202124"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></body></html>`;
}

function successPage(email: string): string {
  return page(`${email} is connected`, "You can close this tab and return to Fluxmail.");
}

function errorPage(message: string): string {
  return page("Fluxmail could not connect the account", message);
}
