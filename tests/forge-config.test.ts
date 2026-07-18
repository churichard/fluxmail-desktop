import path from "node:path";
import { describe, expect, it } from "vitest";
import forgeConfig, { shouldIgnorePackagedPath } from "../forge.config";

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
});
