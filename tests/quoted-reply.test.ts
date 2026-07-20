import type { Message } from "@fluxmail/core";
import { describe, expect, it } from "vitest";
import { buildQuotedReplyBody, referencedInlineContentIds } from "../src/main/quoted-reply";
import { quotedReplyCitation } from "../src/shared/quoted-reply";

const original: Message = {
  id: "original",
  threadId: "thread-1",
  accountId: "account-1",
  from: { name: "Jane <Smith>", email: "jane@example.com" },
  to: [{ email: "me@example.com" }],
  subject: "Hello",
  date: "2025-12-10T23:13:00Z",
  snippet: "Original message",
  body: {
    text: "First line\r\n\r\nSecond line  ",
    html: '<table style="color:red"><tr><td>Rich &amp; quoted</td></tr></table><div><br></div>',
  },
  flags: { read: true, starred: false, draft: false },
};

describe("quoted reply serialization", () => {
  it("builds a plain-text citation and quoted body", () => {
    const result = buildQuotedReplyBody({ text: "My reply" }, original);

    expect(result.text).toMatch(
      /^My reply\n\nOn .+ Jane <Smith> <jane@example\.com> wrote:\n> First line\n>\n> Second line$/,
    );
  });

  it("preserves rich HTML inside Gmail-compatible quote markup", () => {
    const result = buildQuotedReplyBody({ html: "<p>My reply</p>" }, original);

    expect(result.html).toContain("<p>My reply</p>");
    expect(result.html).toContain('<div class="gmail_quote gmail_quote_container">');
    expect(result.html).toMatch(
      /<div dir="ltr" class="gmail_attr">On .+ Jane &lt;Smith&gt; &lt;jane@example\.com&gt; wrote:<br><\/div><blockquote class="gmail_quote"/,
    );
    expect(result.html).toContain(
      '<table style="color:red"><tr><td>Rich &amp; quoted</td></tr></table>',
    );
    expect(result.html).toContain("<div></div>");
    expect(result.html).not.toContain("<div><br></div>");
  });

  it("escapes plain text when the original has no HTML body", () => {
    const result = buildQuotedReplyBody(
      { html: "<p>Reply</p>" },
      {
        ...original,
        from: { email: "jane@example.com" },
        body: { text: "Use <strong>literally</strong> & safely" },
      },
    );

    expect(result.html).toContain("jane@example.com wrote:");
    expect(result.html).toContain("Use &lt;strong&gt;literally&lt;/strong&gt; &amp; safely");
    expect(result.html).not.toContain("Use <strong>");
  });

  it("builds the complete text alternative from an HTML-only message", () => {
    const result = buildQuotedReplyBody(
      { text: "Reply", html: "<p>Reply</p>" },
      {
        ...original,
        snippet: "Short preview",
        body: {
          html: "<p>Full &amp; complete first paragraph.</p><p>Second paragraph.</p>",
        },
      },
    );

    expect(result.text).toContain("> Full & complete first paragraph.\n> Second paragraph.");
    expect(result.text).not.toContain("Short preview");
  });

  it("finds referenced inline content IDs regardless of encoding or case", () => {
    expect(
      referencedInlineContentIds(
        '<img src="cid:Logo%40Example.COM"><div style="background:url(cid:footer@example.com)">',
      ),
    ).toEqual(new Set(["logo@example.com", "footer@example.com"]));
  });

  it("falls back to the snippet and keeps malformed dates readable", () => {
    const message = {
      ...original,
      from: undefined,
      date: "not-a-date",
      body: undefined,
      snippet: "Short preview",
    };

    expect(quotedReplyCitation(message)).toBe("On not-a-date unknown sender wrote:");
    expect(buildQuotedReplyBody({ text: "Reply" }, message).text).toContain(
      "On not-a-date unknown sender wrote:\n> Short preview",
    );
  });
});
