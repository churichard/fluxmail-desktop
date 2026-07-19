import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const releaseWorkflow = readFileSync(
  path.join(process.cwd(), ".github/workflows/release.yml"),
  "utf8",
);

describe("Release workflow", () => {
  it("does not mutate macOS trust settings for self-signed builds", () => {
    expect(releaseWorkflow).not.toContain("security add-trusted-cert");
  });
});
