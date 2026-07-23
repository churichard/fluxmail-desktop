import { rmSync } from "node:fs";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DesktopPreferences } from "../src/main/preferences";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("desktop preferences", () => {
  it("persists desktop settings in a private file", async () => {
    const directory = await temporaryDirectory();
    const preferences = new DesktopPreferences(directory);
    expect(await preferences.load()).toBe("system");
    expect(preferences.dockBadge()).toBe(true);
    expect(preferences.openNextAfterArchive()).toBe(true);
    expect(preferences.blockRemoteImages()).toBe(true);
    expect(preferences.imageRelay()).toBe(true);
    expect(preferences.undoSendDelaySeconds()).toBe(10);
    expect(await preferences.setAppearance("dark")).toBe("dark");
    expect(await preferences.setDockBadge(false)).toBe(false);
    expect(await preferences.setOpenNextAfterArchive(false)).toBe(false);
    expect(await preferences.setBlockRemoteImages(false)).toBe(false);
    expect(await preferences.setImageRelay(false)).toBe(false);
    expect(await preferences.setUndoSendDelaySeconds(30)).toBe(30);

    const filePath = path.join(directory, "desktop-preferences.json");
    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({
      version: 6,
      appearance: "dark",
      dockBadge: false,
      openNextAfterArchive: false,
      blockRemoteImages: false,
      imageRelay: false,
      undoSendDelaySeconds: 30,
    });
    expect((await stat(filePath)).mode & 0o777).toBe(0o600);
    const restored = new DesktopPreferences(directory);
    expect(await restored.load()).toBe("dark");
    expect(restored.dockBadge()).toBe(false);
    expect(restored.openNextAfterArchive()).toBe(false);
    expect(restored.blockRemoteImages()).toBe(false);
    expect(restored.imageRelay()).toBe(false);
    expect(restored.undoSendDelaySeconds()).toBe(30);
  });

  it("enables new defaults when migrating version one and two preferences", async () => {
    for (const stored of [
      { version: 1, appearance: "light" },
      { version: 2, appearance: "dark", dockBadge: false },
    ]) {
      const directory = await temporaryDirectory();
      await writeFile(
        path.join(directory, "desktop-preferences.json"),
        JSON.stringify(stored),
        "utf8",
      );
      const preferences = new DesktopPreferences(directory);
      expect(await preferences.load()).toBe(stored.appearance);
      expect(preferences.openNextAfterArchive()).toBe(true);
      expect(preferences.blockRemoteImages()).toBe(true);
      expect(preferences.imageRelay()).toBe(true);
      expect(preferences.undoSendDelaySeconds()).toBe(10);
    }
  });

  it("preserves image blocking and enables the relay when migrating version three", async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      path.join(directory, "desktop-preferences.json"),
      JSON.stringify({
        version: 3,
        appearance: "dark",
        dockBadge: false,
        blockRemoteImages: false,
      }),
      "utf8",
    );
    const preferences = new DesktopPreferences(directory);
    expect(await preferences.load()).toBe("dark");
    expect(preferences.dockBadge()).toBe(false);
    expect(preferences.openNextAfterArchive()).toBe(true);
    expect(preferences.blockRemoteImages()).toBe(false);
    expect(preferences.imageRelay()).toBe(true);
    expect(preferences.undoSendDelaySeconds()).toBe(10);
  });

  it("enables archive advancement when migrating version four preferences", async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      path.join(directory, "desktop-preferences.json"),
      JSON.stringify({
        version: 4,
        appearance: "dark",
        dockBadge: false,
        blockRemoteImages: false,
        imageRelay: false,
      }),
      "utf8",
    );
    const preferences = new DesktopPreferences(directory);
    expect(await preferences.load()).toBe("dark");
    expect(preferences.openNextAfterArchive()).toBe(true);
    expect(preferences.imageRelay()).toBe(false);
  });

  it("migrates either version five preference shape without losing its setting", async () => {
    for (const stored of [
      {
        version: 5,
        appearance: "dark",
        dockBadge: false,
        openNextAfterArchive: false,
        blockRemoteImages: false,
        imageRelay: false,
      },
      {
        version: 5,
        appearance: "dark",
        dockBadge: false,
        blockRemoteImages: false,
        imageRelay: false,
        undoSendDelaySeconds: 20,
      },
    ] as const) {
      const directory = await temporaryDirectory();
      await writeFile(
        path.join(directory, "desktop-preferences.json"),
        JSON.stringify(stored),
        "utf8",
      );
      const preferences = new DesktopPreferences(directory);
      await preferences.load();
      expect(preferences.openNextAfterArchive()).toBe(
        "openNextAfterArchive" in stored ? stored.openNextAfterArchive : true,
      );
      expect(preferences.undoSendDelaySeconds()).toBe(
        "undoSendDelaySeconds" in stored ? stored.undoSendDelaySeconds : 10,
      );
    }
  });

  it("serializes concurrent setting changes without losing values", async () => {
    const directory = await temporaryDirectory();
    const preferences = new DesktopPreferences(directory);
    await preferences.load();

    await Promise.all([
      preferences.setAppearance("dark"),
      preferences.setDockBadge(false),
      preferences.setOpenNextAfterArchive(false),
      preferences.setBlockRemoteImages(false),
      preferences.setImageRelay(false),
      preferences.setUndoSendDelaySeconds(20),
    ]);

    expect(preferences.appearance()).toBe("dark");
    expect(preferences.dockBadge()).toBe(false);
    expect(preferences.openNextAfterArchive()).toBe(false);
    expect(preferences.blockRemoteImages()).toBe(false);
    expect(preferences.imageRelay()).toBe(false);
    expect(preferences.undoSendDelaySeconds()).toBe(20);
    expect(
      JSON.parse(await readFile(path.join(directory, "desktop-preferences.json"), "utf8")),
    ).toEqual({
      version: 6,
      appearance: "dark",
      dockBadge: false,
      openNextAfterArchive: false,
      blockRemoteImages: false,
      imageRelay: false,
      undoSendDelaySeconds: 20,
    });
  });

  it("falls back to privacy-safe defaults when the preference file is invalid", async () => {
    const directory = await temporaryDirectory();
    await writeFile(path.join(directory, "desktop-preferences.json"), "not json", "utf8");
    const preferences = new DesktopPreferences(directory);
    expect(await preferences.load()).toBe("system");
    expect(preferences.dockBadge()).toBe(true);
    expect(preferences.openNextAfterArchive()).toBe(true);
    expect(preferences.blockRemoteImages()).toBe(true);
    expect(preferences.imageRelay()).toBe(true);
    expect(preferences.undoSendDelaySeconds()).toBe(10);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "fluxmail-preferences-"));
  directories.push(directory);
  return directory;
}
