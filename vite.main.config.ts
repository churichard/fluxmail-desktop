import { defineConfig, loadEnv } from "vite";

export function loadDesktopOAuthConfig(mode: string, root = process.cwd()) {
  const environment = loadEnv(mode, root, "");
  return {
    clientId: environment.FLUXMAIL_DESKTOP_GOOGLE_CLIENT_ID ?? "",
    clientSecret: environment.FLUXMAIL_DESKTOP_GOOGLE_CLIENT_SECRET ?? "",
  };
}

export default defineConfig(({ mode }) => {
  const oauth = loadDesktopOAuthConfig(mode);
  return {
    plugins: [
      {
        name: "fluxmail-pinned-version",
        enforce: "pre",
        transform(_source, id) {
          if (id.endsWith("/fluxmail-mcp/packages/server/dist/version.js")) {
            return `export const VERSION = '0.3.0';`;
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
