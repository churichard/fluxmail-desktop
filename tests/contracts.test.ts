import { describe, expect, it } from "vitest";
import {
  appearancePreferenceSchema,
  composeInputSchema,
  featureEventSchema,
  mailForwardInputSchema,
  messageSchema,
  sendInputSchema,
  threadListInputSchema,
} from "../src/shared/contracts";
import { googleOAuthRedirectUri, isOAuthStateValid } from "../src/main/oauth";
import { toEmailQuery } from "../src/main/mail-mapping";
import { isAllowedFrameUrl } from "../src/main/ipc-security";

describe("desktop contracts", () => {
  it("allows bodyless drafts but requires text before sending", () => {
    const subjectOnly = {
      accountId: "account-1",
      to: [],
      subject: "Remember this",
      text: "",
      html: "<p></p>",
    };
    expect(composeInputSchema.parse(subjectOnly)).toEqual(subjectOnly);
    expect(() => sendInputSchema.parse(subjectOnly)).toThrow();
  });

  it("preserves all editable fields when validating a forward", () => {
    const input = {
      target: { accountId: "account-1", threadId: "thread-1" },
      messageId: "message-1",
      to: [{ email: "friend@example.com" }],
      bcc: [{ email: "archive@example.com" }],
      subject: "Custom subject",
      text: "Formatted note",
      html: "<p><strong>Formatted note</strong></p>",
      attachments: [
        {
          token: "attachment-token",
          filename: "notes.pdf",
          mimeType: "application/pdf",
          sizeBytes: 128,
        },
      ],
      includeAttachments: true,
    };
    expect(mailForwardInputSchema.parse(input)).toEqual(input);
  });

  it("allows a forward with only a Cc or Bcc recipient", () => {
    const base = {
      target: { accountId: "account-1", threadId: "thread-1" },
      messageId: "message-1",
      to: [],
      subject: "Private update",
    };

    expect(
      mailForwardInputSchema.parse({
        ...base,
        bcc: [{ email: "archive@example.com" }],
      }),
    ).toMatchObject({ to: [], bcc: [{ email: "archive@example.com" }] });
    expect(
      mailForwardInputSchema.parse({
        ...base,
        cc: [{ email: "team@example.com" }],
      }),
    ).toMatchObject({ to: [], cc: [{ email: "team@example.com" }] });
    expect(() => mailForwardInputSchema.parse(base)).toThrow();
  });

  it("maps mailbox views to provider-neutral Fluxmail queries", () => {
    expect(toEmailQuery(threadListInputSchema.parse({ view: "inbox" }))).toEqual({
      folder: "inbox",
    });
    expect(toEmailQuery(threadListInputSchema.parse({ view: "starred" }))).toEqual({
      starredOnly: true,
    });
    expect(
      toEmailQuery(threadListInputSchema.parse({ view: "search", query: "from:team" })),
    ).toEqual({ text: "from:team" });
    expect(toEmailQuery(threadListInputSchema.parse({ view: "label", label: "Projects" }))).toEqual(
      { folder: "Projects" },
    );
  });

  it("accepts cache-first mailbox refresh requests", () => {
    expect(threadListInputSchema.parse({ view: "sent", backgroundRefresh: true })).toMatchObject({
      view: "sent",
      backgroundRefresh: true,
    });
  });

  it("accepts only allowlisted renderer analytics fields", () => {
    const parsed = featureEventSchema.parse({
      feature: "search",
      action: "submitted",
      source: "toolbar",
      query: "private search",
      email: "person@example.com",
    });
    expect(parsed).toEqual({
      feature: "search",
      action: "submitted",
      source: "toolbar",
    });
    expect(() =>
      featureEventSchema.parse({
        feature: "unknown",
        action: "submitted",
        source: "toolbar",
      }),
    ).toThrow();
  });

  it("requires an exact, high-entropy OAuth state", () => {
    const state = "a".repeat(48);
    expect(isOAuthStateValid(state, state)).toBe(true);
    expect(isOAuthStateValid(state, `${state}0`)).toBe(false);
    expect(isOAuthStateValid("short", "short")).toBe(false);
    expect(isOAuthStateValid(state, null)).toBe(false);
  });

  it("uses a literal loopback address for the OAuth redirect", () => {
    expect(googleOAuthRedirectUri(8976)).toBe("http://127.0.0.1:8976/oauth/callback");
  });

  it("accepts only the app origin or the exact development origin", () => {
    expect(isAllowedFrameUrl("app://fluxmail/index.html")).toBe(true);
    expect(isAllowedFrameUrl("app://other/index.html")).toBe(false);
    expect(isAllowedFrameUrl("https://attacker.example")).toBe(false);
    expect(isAllowedFrameUrl("http://localhost:5173/thread", "http://localhost:5173")).toBe(true);
    expect(isAllowedFrameUrl("http://localhost:51730/thread", "http://localhost:5173")).toBe(false);
  });

  it("accepts only supported appearance preferences", () => {
    expect(appearancePreferenceSchema.parse("system")).toBe("system");
    expect(appearancePreferenceSchema.parse("light")).toBe("light");
    expect(appearancePreferenceSchema.parse("dark")).toBe("dark");
    expect(() => appearancePreferenceSchema.parse("midnight")).toThrow();
  });

  it("preserves Reply-To addresses in renderer messages", () => {
    expect(
      messageSchema.parse({
        id: "message-1",
        threadId: "thread-1",
        accountId: "account-1",
        from: { email: "sender@example.com" },
        replyTo: [{ name: "Support", email: "support@example.com" }],
        to: [{ email: "me@example.com" }],
        subject: "Hello",
        date: "2026-07-16T12:00:00Z",
        flags: { read: true, starred: false, draft: false },
      }).replyTo,
    ).toEqual([{ name: "Support", email: "support@example.com" }]);
  });
});
