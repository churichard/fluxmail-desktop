import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import type { ForgeConfig } from "@electron-forge/shared-types";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const shouldSign = Boolean(
  process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER,
);
const packagedPaths = [
  "/.vite",
  "/node_modules/better-sqlite3/LICENSE",
  "/node_modules/better-sqlite3/package.json",
  "/node_modules/better-sqlite3/lib",
  "/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
  "/node_modules/bindings",
  "/node_modules/file-uri-to-path",
];
const runFile = promisify(execFile);

const config: ForgeConfig = {
  packagerConfig: {
    asar: { unpack: "**/*.node" },
    executableName: "Fluxmail",
    name: "Fluxmail",
    appBundleId: "ai.fluxmail.desktop",
    appCategoryType: "public.app-category.productivity",
    icon: "build/icon.icns",
    extendInfo: {
      LSMinimumSystemVersion: "13.0",
      NSAppTransportSecurity: { NSAllowsArbitraryLoads: false },
    },
    extraResource: ["vendor/fluxmail-mcp/LICENSE.md"],
    prune: false,
    ignore(file) {
      if (!file) return false;
      return !packagedPaths.some(
        (allowed) =>
          file === allowed || file.startsWith(`${allowed}/`) || allowed.startsWith(`${file}/`),
      );
    },
    osxSign: shouldSign
      ? {
          identity: process.env.APPLE_SIGNING_IDENTITY,
          optionsForFile: () => ({
            entitlements: path.join(process.cwd(), "build/entitlements.mac.plist"),
            hardenedRuntime: true,
          }),
        }
      : undefined,
    osxNotarize: shouldSign
      ? {
          appleApiKey: process.env.APPLE_API_KEY!,
          appleApiKeyId: process.env.APPLE_API_KEY_ID!,
          appleApiIssuer: process.env.APPLE_API_ISSUER!,
        }
      : undefined,
  },
  rebuildConfig: { force: true },
  hooks: {
    async generateAssets() {
      await runFile("bash", ["scripts/generate-icon.sh"], { cwd: process.cwd() });
    },
  },
  makers: [new MakerZIP({}, ["darwin"]), new MakerDMG({ format: "ULFO" }, ["darwin"])],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
