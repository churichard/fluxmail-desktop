import path from "node:path";
import { describe, expect, it } from "vitest";
import forgeConfig, {
  createMacPackagingConfig,
  dmgMakerConfig,
  shouldIgnorePackagedPath,
} from "../forge.config";

describe("Forge package filtering", () => {
  const appRoot = path.join(path.sep, "workspace", "fluxmail-desktop");

  it.each([
    "/.vite/build/main.js",
    "/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    "/node_modules/@node-rs/argon2/index.js",
    "/node_modules/@node-rs/argon2-darwin-arm64/argon2.darwin-arm64.node",
    "/node_modules/@node-rs/argon2-darwin-x64/argon2.darwin-x64.node",
  ])("keeps root-relative packaged path %s", (file) => {
    expect(shouldIgnorePackagedPath(file, appRoot)).toBe(false);
  });

  it.each([
    path.join(appRoot, ".vite", "build", "main.js"),
    path.join(appRoot, "node_modules", "better-sqlite3", "build", "Release", "better_sqlite3.node"),
    path.join(appRoot, "node_modules", "@node-rs", "argon2", "index.js"),
    path.join(
      appRoot,
      "node_modules",
      "@node-rs",
      "argon2-darwin-arm64",
      "argon2.darwin-arm64.node",
    ),
  ])("keeps absolute packaged path %s", (file) => {
    expect(shouldIgnorePackagedPath(file, appRoot)).toBe(false);
  });

  it("keeps allowlisted parent directories and ignores unrelated files", () => {
    expect(shouldIgnorePackagedPath(path.join(appRoot, "node_modules"), appRoot)).toBe(false);
    expect(shouldIgnorePackagedPath(path.join(appRoot, "src", "main.ts"), appRoot)).toBe(true);
  });

  it("uses the Electron binary prepared by postinstall instead of rebuilding workspace copies", () => {
    expect(forgeConfig.rebuildConfig?.ignoreModules).toContain("better-sqlite3");
  });

  it("copies both license files into the app bundle", () => {
    expect(forgeConfig.packagerConfig?.extraResource).toEqual([
      "LICENSE",
      "node_modules/fluxmail/LICENSE.md",
    ]);
  });

  it("uses an ad hoc signature when no signing identity is configured", () => {
    const packaging = createMacPackagingConfig({});
    const osxSign = packaging.osxSign;
    expect(osxSign).toMatchObject({
      identity: "-",
      identityValidation: false,
    });
    expect(typeof osxSign === "object" && osxSign.optionsForFile?.("Fluxmail.app")).toEqual({
      hardenedRuntime: false,
      timestamp: "none",
    });
    expect(packaging.osxNotarize).toBeUndefined();
  });

  it("uses a persistent identity without notarizing self-signed builds", () => {
    const packaging = createMacPackagingConfig({
      APPLE_SIGNING_IDENTITY: "Fluxmail Self-Signed Code Signing",
      APPLE_SIGNING_KEYCHAIN: "/tmp/fluxmail-signing.keychain-db",
    });
    const osxSign = packaging.osxSign;
    expect(osxSign).toMatchObject({
      identity: "Fluxmail Self-Signed Code Signing",
      keychain: "/tmp/fluxmail-signing.keychain-db",
      continueOnError: false,
      identityValidation: false,
    });
    expect(typeof osxSign === "object" && osxSign.optionsForFile?.("Fluxmail.app")).toEqual({
      hardenedRuntime: false,
      timestamp: "none",
    });
    expect(packaging.osxNotarize).toBeUndefined();
  });

  it("uses hardened runtime and notarization with complete Apple API credentials", () => {
    const packaging = createMacPackagingConfig({
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Fluxmail",
      APPLE_API_KEY: "/tmp/AuthKey.p8",
      APPLE_API_KEY_ID: "KEYID",
      APPLE_API_ISSUER: "ISSUER",
    });
    const osxSign = packaging.osxSign;
    expect(typeof osxSign === "object" && osxSign.optionsForFile?.("Fluxmail.app")).toMatchObject({
      hardenedRuntime: true,
    });
    expect(packaging.osxNotarize).toEqual({
      appleApiKey: "/tmp/AuthKey.p8",
      appleApiKeyId: "KEYID",
      appleApiIssuer: "ISSUER",
    });
  });

  it("rejects partial notarization configuration", () => {
    expect(() =>
      createMacPackagingConfig({
        APPLE_SIGNING_IDENTITY: "Developer ID Application: Fluxmail",
        APPLE_API_KEY: "/tmp/AuthKey.p8",
      }),
    ).toThrow("Set all three Apple notarization variables or remove all of them.");
  });

  it("uses Fluxmail artwork and a centered DMG layout", () => {
    expect(dmgMakerConfig).toMatchObject({
      icon: "build/icon.icns",
      background: "build/dmg-background.png",
      iconSize: 96,
      additionalDMGOptions: {
        window: { size: { width: 658, height: 498 } },
      },
    });

    const contents = dmgMakerConfig.contents;
    expect(
      typeof contents === "function" && contents({ appPath: "/tmp/Fluxmail.app" } as never),
    ).toEqual([
      { x: 462, y: 233, type: "link", path: "/Applications" },
      { x: 196, y: 233, type: "file", path: "/tmp/Fluxmail.app" },
    ]);
  });
});
