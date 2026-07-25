import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openLegalNotices } from "../src/main/legal-notices";

describe("software licenses", () => {
  it("opens the notice bundled with a packaged app", async () => {
    const openPath = vi.fn(async () => "");

    await openLegalNotices({
      isPackaged: true,
      resourcesPath: "/Applications/Fluxmail.app/Contents/Resources",
      repositoryRoot: "/workspace/fluxmail-desktop",
      openPath,
    });

    expect(openPath).toHaveBeenCalledWith(
      path.join("/Applications/Fluxmail.app/Contents/Resources", "DISTRIBUTION_NOTICES.md"),
    );
  });

  it("opens the repository notice during development", async () => {
    const openPath = vi.fn(async () => "");

    await openLegalNotices({
      isPackaged: false,
      resourcesPath: "/Applications/Fluxmail.app/Contents/Resources",
      repositoryRoot: "/workspace/fluxmail-desktop",
      openPath,
    });

    expect(openPath).toHaveBeenCalledWith(
      path.join("/workspace/fluxmail-desktop", "DISTRIBUTION_NOTICES.md"),
    );
  });

  it("reports errors from the system file opener", async () => {
    await expect(
      openLegalNotices({
        isPackaged: true,
        resourcesPath: "/Applications/Fluxmail.app/Contents/Resources",
        repositoryRoot: "/workspace/fluxmail-desktop",
        openPath: async () => "No application can open this file.",
      }),
    ).rejects.toThrow(
      "Fluxmail could not open the software licenses. No application can open this file.",
    );
  });
});
