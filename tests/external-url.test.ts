import { describe, expect, it } from "vitest";
import { parseExternalUrl } from "../src/shared/external-url";

describe("external URLs", () => {
  it.each(["http://example.com/path", "https://example.com/path", "mailto:person@example.com"])(
    "allows %s",
    (url) => {
      expect(parseExternalUrl(url)?.toString()).toBe(url);
    },
  );

  it.each([
    "javascript:alert(1)",
    "data:text/html,hello",
    "file:///tmp/message.html",
    "app://fluxmail/index.html",
    "/relative/path",
    "not a URL",
  ])("rejects %s", (url) => {
    expect(parseExternalUrl(url)).toBeUndefined();
  });
});
