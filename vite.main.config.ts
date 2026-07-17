import { defineConfig, loadEnv } from "vite";
import { readFileSync } from "node:fs";
import path from "node:path";

export function loadDesktopOAuthConfig(mode: string, root = process.cwd()) {
  const environment = loadEnv(mode, root, "");
  return {
    clientId: environment.FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID ?? "",
    clientSecret: environment.FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET ?? "",
  };
}

export function loadFluxmailEngineVersion(root = process.cwd()): string {
  const manifestPath = path.join(root, "vendor/fluxmail-mcp/packages/server/package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw new Error(`Fluxmail engine package at ${manifestPath} has no version.`);
  }
  return manifest.version;
}

export default defineConfig(({ mode }) => {
  const oauth = loadDesktopOAuthConfig(mode);
  const engineVersion = loadFluxmailEngineVersion();
  return {
    plugins: [
      {
        name: "fluxmail-pinned-version",
        enforce: "pre",
        transform(_source, id) {
          if (id.endsWith("/fluxmail-mcp/packages/server/dist/version.js")) {
            return `export const VERSION = ${JSON.stringify(engineVersion)};`;
          }
        },
      },
    ],
    define: {
      __FLUXMAIL_GOOGLE_CLIENT_ID__: JSON.stringify(oauth.clientId),
      __FLUXMAIL_GOOGLE_CLIENT_SECRET__: JSON.stringify(oauth.clientSecret),
    },
    build: {
      assetsInlineLimit: 0,
      rollupOptions: {
        external: ["better-sqlite3"],
      },
    },
  };
});
