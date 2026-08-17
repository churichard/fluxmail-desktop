import { describe, expect, it } from "vitest";
import {
  hasUnsendableReplyRecipient,
  replyRecipients,
  replyTargets,
} from "../src/shared/reply-recipients";
import type { MailMessage } from "../src/shared/contracts";

describe("reply recipients", () => {
  it("prefers Reply-To over From", () => {
    expect(replyTargets(message())).toEqual([{ email: "sender@example.com" }]);
    expect(replyTargets(message({ replyTo: [{ email: "support@example.com" }] }))).toEqual([
      { email: "support@example.com" },
    ]);
  });

  it("drops the replying account and duplicates from reply-all recipients", () => {
    const recipients = replyRecipients(
      "me@example.com",
      message({
        to: [{ email: "me@example.com" }, { email: "Sender@example.com" }],
        cc: [{ email: "teammate@example.com" }, { email: "me@example.com" }],
      }),
      true,
    );

    expect(recipients.to).toEqual([{ email: "sender@example.com" }]);
    expect(recipients.cc).toEqual([{ email: "teammate@example.com" }]);
  });

  it("falls back to the original recipients when replying to yourself", () => {
    expect(
      replyRecipients(
        "me@example.com",
        message({ from: { email: "me@example.com" }, to: [{ email: "friend@example.com" }] }),
        false,
      ),
    ).toEqual({ to: [{ email: "friend@example.com" }], cc: [] });
  });

  it("reports header addresses that no provider will accept", () => {
    const truncated = message({
      replyTo: [{ name: "Richard Chu", email: "someone@gmail.c..." }],
    });

    expect(hasUnsendableReplyRecipient("me@example.com", truncated, false)).toBe(true);
    expect(hasUnsendableReplyRecipient("me@example.com", message(), false)).toBe(false);
  });

  it("reports unsendable addresses that only a reply-all would pick up", () => {
    const truncatedCc = message({ cc: [{ email: "teammate@example.c..." }] });

    expect(hasUnsendableReplyRecipient("me@example.com", truncatedCc, false)).toBe(false);
    expect(hasUnsendableReplyRecipient("me@example.com", truncatedCc, true)).toBe(true);
  });
});

function message(overrides: Partial<MailMessage> = {}): MailMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    accountId: "account-1",
    from: { email: "sender@example.com" },
    to: [{ email: "me@example.com" }],
    subject: "Receipt",
    date: "2026-07-16T12:00:00Z",
    flags: { read: true, starred: false, draft: false },
    ...overrides,
  };
}
