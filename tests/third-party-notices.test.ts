import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const notices = readFileSync(path.join(process.cwd(), "THIRD_PARTY_NOTICES.md"), "utf8");

function noticeFor(packageName: string): string {
  const heading = `## ${packageName} `;
  const headingIndex = notices.indexOf(`\n${heading}`);
  if (headingIndex < 0) throw new Error(`Could not find the notice for ${packageName}.`);
  const start = headingIndex + 1;
  const end = notices.indexOf("\n## ", start + heading.length);
  return notices.slice(start, end < 0 ? undefined : end).trim();
}

describe("third-party software notices", () => {
  it("uses the parent Argon2 notice for both release architectures", () => {
    expect(noticeFor("@node-rs/argon2")).toContain("License: MIT");
    expect(notices).not.toMatch(/^## @node-rs\/argon2-darwin-(?:arm64|x64) /m);
  });

  it("normalizes legacy object-valued license metadata", () => {
    expect(noticeFor("config-chain")).toContain("License: MIT");
    expect(notices).not.toContain("[object Object]");
  });

  it("omits the body when a package has no standalone license file", () => {
    expect(noticeFor("@posthog/core")).toMatch(
      /^## @posthog\/core [^\n]+\n\nLicense: MIT\nProject: [^\n]+\n?$/,
    );
    expect(notices).not.toContain(
      "This package does not include a standalone license file. Its package metadata provides the license identifier shown above.",
    );
  });
});
