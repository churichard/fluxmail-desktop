import { describe, expect, it } from "vitest";
import type { DesktopAnalytics } from "../src/main/analytics";
import {
  buildDemoMessages,
  DEMO_ACCOUNT_EMAIL,
  DEMO_ACCOUNT_ID,
  DEMO_THREAD_SPECS,
} from "../src/main/demo-fixtures";
import { FakeFluxmailRuntime } from "../src/main/fake-runtime";

const anchor = new Date(2026, 6, 20, 12, 0, 0);

describe("desktop demo fixtures", () => {
  it("builds the complete realistic inbox with stable identifiers", () => {
    const messages = buildDemoMessages(anchor);
    const threadIds = new Set(messages.map((message) => message.threadId));
    const messageIds = new Set(messages.map((message) => message.id));

    expect(DEMO_THREAD_SPECS).toHaveLength(89);
    expect(threadIds.size).toBe(89);
    expect(messageIds.size).toBe(messages.length);
    expect(messages.length).toBeGreaterThan(89);
    expect(buildDemoMessages(anchor)).toEqual(messages);
  });

  it("uses reserved example domains for every address", () => {
    const messages = buildDemoMessages(anchor);
    const addresses = messages.flatMap((message) => [
      ...(message.from ? [message.from] : []),
      ...message.to,
      ...(message.cc ?? []),
      ...(message.bcc ?? []),
      ...(message.replyTo ?? []),
    ]);

    expect(DEMO_ACCOUNT_EMAIL).toMatch(/@(?:[a-z0-9-]+\.)*example\.com$/);
    expect(messages.every((message) => message.accountId === DEMO_ACCOUNT_ID)).toBe(true);
    expect(addresses.length).toBeGreaterThan(messages.length);
    expect(
      addresses.every((candidate) => /@(?:[a-z0-9-]+\.)*example\.com$/i.test(candidate.email)),
    ).toBe(true);
  });

  it("covers realistic mailbox states and message content", () => {
    const messages = buildDemoMessages(anchor);
    const threadIds = (prefix: string) =>
      new Set(
        messages
          .filter((message) => message.threadId.includes(prefix))
          .map((message) => message.threadId),
      ).size;

    expect(threadIds("sales")).toBe(15);
    expect(threadIds("hiring")).toBe(14);
    expect(threadIds("internal")).toBe(15);
    expect(threadIds("investor")).toBe(8);
    expect(threadIds("support")).toBe(10);
    expect(threadIds("news")).toBe(20);
    expect(threadIds("personal")).toBe(7);

    expect(messages.some((message) => !message.flags.read)).toBe(true);
    expect(messages.some((message) => message.flags.starred)).toBe(true);
    expect(messages.some((message) => message.folder?.role === "all")).toBe(true);
    expect(messages.some((message) => message.folder?.role === "sent")).toBe(true);
    expect(messages.some((message) => message.attachments?.length)).toBe(true);
    expect(messages.every((message) => message.body?.html && message.body.text)).toBe(true);
  });

  it("adds portable reply headers to multi-message conversations", () => {
    const messages = buildDemoMessages(anchor).filter(
      (message) => message.threadId === "demo-thread-sales-001",
    );

    expect(messages).toHaveLength(3);
    expect(messages[0]?.headers).toEqual({
      "Message-ID": "<demo-thread-sales-001-m1@acme.example.com>",
    });
    expect(messages[2]?.headers).toMatchObject({
      "In-Reply-To": "<demo-thread-sales-001-m2@acme.example.com>",
      References:
        "<demo-thread-sales-001-m1@acme.example.com> <demo-thread-sales-001-m2@acme.example.com>",
    });
  });

  it("shows one row per conversation in the fake runtime", async () => {
    const runtime = new FakeFluxmailRuntime({
      analytics: {} as DesktopAnalytics,
      onCacheChanged() {},
      onLicenseChanged() {},
    });

    const page = await runtime.listThreads({ view: "all" });
    const salesThread = page.items.find((thread) => thread.id === "demo-thread-sales-001");
    const hiring = await runtime.listThreads({ view: "label", label: "Hiring/Eng" });

    expect(page.totalCount).toBe(89);
    expect(salesThread).toMatchObject({
      subject: "ACME × Northwind: pricing for the 2026 rollout",
      messageCount: 3,
      unread: true,
      starred: true,
    });
    expect(hiring.totalCount).toBeGreaterThan(0);
    expect(hiring.items.every((thread) => thread.labels.includes("Hiring/Eng"))).toBe(true);
    expect(runtime.unreadCount()).toBeGreaterThan(1);
  });

  it("keeps sent messages in Sent when archiving a mixed conversation", async () => {
    const runtime = new FakeFluxmailRuntime({
      analytics: {} as DesktopAnalytics,
      onCacheChanged() {},
      onLicenseChanged() {},
    });
    const target = {
      accountId: DEMO_ACCOUNT_ID,
      threadId: "demo-thread-sales-001",
    };

    expect((await runtime.listThreads({ view: "inbox" })).items).toContainEqual(
      expect.objectContaining({ id: target.threadId }),
    );
    expect((await runtime.listThreads({ view: "sent" })).items).toContainEqual(
      expect.objectContaining({ id: target.threadId }),
    );

    await runtime.modify([target], { type: "archive" });

    expect((await runtime.listThreads({ view: "inbox" })).items).not.toContainEqual(
      expect.objectContaining({ id: target.threadId }),
    );
    expect((await runtime.listThreads({ view: "sent" })).items).toContainEqual(
      expect.objectContaining({ id: target.threadId }),
    );
  });
});
