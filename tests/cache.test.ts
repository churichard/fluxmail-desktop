import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Message, Thread } from "@fluxmail/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MailCache } from "../src/main/cache";
import type { AccountInfo } from "../src/shared/contracts";

const directories: string[] = [];
const primary: AccountInfo = {
  id: "account-a",
  email: "alex@example.com",
  provider: "gmail",
  status: "active",
};
const secondary: AccountInfo = {
  id: "account-b",
  email: "sam@example.com",
  provider: "gmail",
  status: "active",
};

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("MailCache", () => {
  it("merges accounts by date, deduplicates threads, and paginates", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "m1", threadId: "thread-a", date: "2026-07-15T10:00:00Z" }),
    ]);
    cache.putMessages(primary, [
      message({
        id: "m2",
        threadId: "thread-a",
        date: "2026-07-15T12:00:00Z",
        subject: "Updated",
      }),
    ]);
    cache.putMessages(secondary, [
      message({ id: "m3", threadId: "thread-b", date: "2026-07-15T11:00:00Z" }),
    ]);

    const first = cache.listThreads({ view: "inbox", offset: 0, limit: 1 });
    const second = cache.listThreads({ view: "inbox", offset: 1, limit: 1 });
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      id: "thread-a",
      subject: "Updated",
      messageCount: 2,
    });
    expect(second[0]).toMatchObject({ id: "thread-b", accountId: "account-b" });
    cache.close();
  });

  it("counts unread inbox threads and drafts", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "unread-one", threadId: "unread-thread" }),
      message({
        id: "unread-two",
        threadId: "unread-thread",
        date: "2026-07-15T10:00:00Z",
      }),
      message({
        id: "read",
        threadId: "read-thread",
        flags: { read: true, starred: false, draft: false },
      }),
      message({
        id: "draft",
        threadId: "draft-thread",
        folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
        flags: { read: true, starred: false, draft: true },
      }),
    ]);

    expect(cache.unreadCount()).toBe(1);
    expect(cache.draftCount()).toBe(1);
    expect(cache.unreadCount([secondary.id])).toBe(0);
    expect(cache.draftCount([secondary.id])).toBe(0);
    cache.close();
  });

  it("enumerates and removes all cached state for a disconnected account", () => {
    const cache = createCache();
    cache.putMessages(primary, [message({ id: "primary", threadId: "primary-thread" })]);
    cache.putMessages(secondary, [message({ id: "secondary", threadId: "secondary-thread" })]);

    expect(cache.accountIds().sort()).toEqual([primary.id, secondary.id]);
    cache.deleteAccount(primary.id);
    expect(cache.accountIds()).toEqual([secondary.id]);
    expect(cache.unreadCount()).toBe(1);
    cache.close();
  });

  it("replaces the cached message when a draft keeps its ID across updates", () => {
    const cache = createCache();
    const draft = {
      draftId: "draft-1",
      folder: { id: "DRAFT", name: "Drafts", role: "drafts" as const },
      flags: { read: true, starred: false, draft: true },
    };
    cache.putMessages(primary, [message({ ...draft, id: "old-message", threadId: "old-thread" })]);
    cache.putMessages(primary, [message({ ...draft, id: "new-message", threadId: "new-thread" })]);

    expect(cache.draftCount()).toBe(1);
    expect(cache.messageIds(primary.id, "old-thread")).toEqual([]);
    expect(cache.messageIds(primary.id, "new-thread")).toEqual(["new-message"]);
    cache.close();
  });

  it("excludes cached spam and trash from All Mail", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "inbox", threadId: "thread-inbox" }),
      message({
        id: "spam",
        threadId: "thread-spam",
        folder: { id: "SPAM", name: "Spam", role: "spam" },
      }),
      message({
        id: "trash",
        threadId: "thread-trash",
        folder: { id: "TRASH", name: "Trash", role: "trash" },
      }),
    ]);

    expect(
      cache.listThreads({ view: "all", offset: 0, limit: 20 }).map((thread) => thread.id),
    ).toEqual(["thread-inbox"]);
    expect(cache.listThreads({ view: "spam", offset: 0, limit: 20 })).toHaveLength(1);
    expect(cache.listThreads({ view: "trash", offset: 0, limit: 20 })).toHaveLength(1);

    cache.close();
  });

  it("keeps a mixed conversation in All Mail when it has a regular message", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({
        id: "mixed-spam",
        threadId: "thread-mixed",
        folder: { id: "SPAM", name: "Spam", role: "spam" },
      }),
      message({
        id: "mixed-inbox",
        threadId: "thread-mixed",
        date: "2026-07-15T10:00:00Z",
      }),
    ]);

    expect(
      cache.listThreads({ view: "all", offset: 0, limit: 20 }).map((thread) => thread.id),
    ).toEqual(["thread-mixed"]);

    cache.close();
  });

  it("searches cached summaries without storing opened bodies in plaintext", () => {
    const { cache, directory } = createCacheWithDirectory();
    const opened: Thread = {
      id: "thread-secret",
      subject: "Quarterly planning",
      messages: [
        message({
          id: "opened",
          threadId: "thread-secret",
          subject: "Quarterly planning",
          body: { html: "<p>private-body-marker</p>" },
        }),
      ],
    };
    cache.putThread(primary, opened);

    expect(
      cache.listThreads({
        view: "search",
        query: "quarterly",
        offset: 0,
        limit: 20,
      }),
    ).toHaveLength(1);
    expect(cache.getThread(primary.id, opened.id)?.messages[0]?.body?.html).toContain(
      "private-body-marker",
    );
    const databaseBytes = ["mail-cache.db", "mail-cache.db-wal"]
      .flatMap((file) => {
        try {
          return [readFileSync(path.join(directory, file))];
        } catch {
          return [];
        }
      })
      .map((buffer) => buffer.toString("utf8"))
      .join("");
    expect(databaseBytes).not.toContain("private-body-marker");
    cache.close();
  });

  it("returns opened messages without caching their bodies when encryption is unavailable", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "fluxmail-cache-"));
    directories.push(directory);
    const cache = new MailCache(directory, {
      encrypt: () => undefined,
      decrypt: () => {
        throw new Error("Encryption is unavailable");
      },
    });
    const opened: Thread = {
      id: "thread-without-keychain",
      subject: "Available without caching",
      messages: [
        message({
          id: "opened-without-keychain",
          threadId: "thread-without-keychain",
          body: { html: "<p>view this without storing it</p>" },
        }),
      ],
    };

    const result = cache.putThread(primary, opened);

    expect(result.messages[0]?.body?.html).toContain("view this without storing it");
    expect(cache.hasThreadBody(primary.id, opened.id)).toBe(false);
    expect(cache.getThread(primary.id, opened.id)).toBeUndefined();
    expect(cache.listThreads({ view: "inbox", offset: 0, limit: 20 })).toHaveLength(1);
    const databaseBytes = ["mail-cache.db", "mail-cache.db-wal"]
      .flatMap((file) => {
        try {
          return [readFileSync(path.join(directory, file))];
        } catch {
          return [];
        }
      })
      .map((buffer) => buffer.toString("utf8"))
      .join("");
    expect(databaseBytes).not.toContain("view this without storing it");
    cache.close();
  });

  it("keeps provider search results that do not match summary text", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({
        id: "attachment",
        threadId: "attachment-thread",
        subject: "Quarterly report",
      }),
    ]);
    cache.recordResultPage(primary.id, "search::has:attachment", ["attachment-thread"], true);

    expect(
      cache.listThreads({
        view: "search",
        query: "has:attachment",
        resultSetKey: "search::has:attachment",
        offset: 0,
        limit: 20,
      }),
    ).toHaveLength(1);
    expect(
      cache.countThreads({
        view: "search",
        query: "has:attachment",
        resultSetKey: "search::has:attachment",
      }),
    ).toBe(1);
    cache.close();
  });

  it("evaluates structured searches locally until provider results are initialized", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({
        id: "matching",
        threadId: "matching-thread",
        from: { name: "Amy", email: "amy@example.com" },
        to: [{ email: "finance@example.com" }],
        subject: "Quarterly plan",
        labels: ["Work"],
        attachments: [
          {
            id: "attachment",
            filename: "forecast.pdf",
            mimeType: "application/pdf",
            sizeBytes: 128,
          },
        ],
      }),
      message({
        id: "excluded",
        threadId: "excluded-thread",
        from: { name: "Amy", email: "amy@example.com" },
        subject: "Quarterly plan",
        labels: ["Spam"],
      }),
      message({
        id: "split-sender",
        threadId: "split-thread",
        from: { name: "Amy", email: "amy@example.com" },
      }),
      message({
        id: "split-attachment",
        threadId: "split-thread",
        from: { name: "Bob", email: "bob@example.com" },
        attachments: [
          {
            id: "split-file",
            filename: "forecast.pdf",
            mimeType: "application/pdf",
            sizeBytes: 64,
          },
        ],
      }),
    ]);
    const input = {
      view: "search" as const,
      query:
        "(from:amy@example.com OR to:finance@example.com) has:attachment -label:spam filename:forecast.pdf",
      resultSetKey: "search::structured",
      offset: 0,
      limit: 20,
    };

    expect(cache.listThreads(input).map((thread) => thread.id)).toEqual(["matching-thread"]);
    expect(cache.countThreads(input)).toBe(1);

    cache.setPageToken(primary.id, input.resultSetKey, undefined);
    expect(cache.listThreads(input)).toEqual([]);
    expect(cache.countThreads(input)).toBe(0);
    cache.close();
  });

  it("treats missing optional fields as nonmatches before negating local filters", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "draft", threadId: "draft-thread", from: undefined, snippet: undefined }),
    ]);
    const input = {
      view: "search" as const,
      query: "-from:amy",
      resultSetKey: "search::-from:amy",
      offset: 0,
      limit: 20,
    };

    expect(cache.listThreads(input).map((thread) => thread.id)).toEqual(["draft-thread"]);
    expect(cache.countThreads(input)).toBe(1);
    cache.close();
  });

  it("treats in:all as the cached all-mail scope", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "inbox", threadId: "inbox-thread" }),
      message({
        id: "spam",
        threadId: "spam-thread",
        folder: { id: "SPAM", name: "Spam", role: "spam" },
      }),
      message({
        id: "trash",
        threadId: "trash-thread",
        folder: { id: "TRASH", name: "Trash", role: "trash" },
      }),
    ]);
    const input = {
      view: "search" as const,
      query: "in:all",
      resultSetKey: "search::in:all",
      offset: 0,
      limit: 20,
    };

    expect(cache.listThreads(input).map((thread) => thread.id)).toEqual(["inbox-thread"]);
    expect(cache.countThreads(input)).toBe(1);
    cache.close();
  });

  it("matches cached account filters by display name and provider", () => {
    const cache = createCache();
    const personal = { ...primary, displayName: "Personal" };
    cache.putMessages(personal, [message({ id: "personal", threadId: "personal-thread" })]);
    const baseInput = {
      view: "search" as const,
      resultSetKey: "search::account-alias",
      accounts: [personal],
      offset: 0,
      limit: 20,
    };

    expect(
      cache.listThreads({ ...baseInput, query: "account:personal" }).map((thread) => thread.id),
    ).toEqual(["personal-thread"]);
    expect(cache.countThreads({ ...baseInput, query: "account:gmail" })).toBe(1);
    cache.close();
  });

  it("matches labels exactly", () => {
    const cache = createCache();
    cache.putMessages(primary, [
      message({ id: "work", threadId: "work-thread", labels: ["Work"] }),
      message({
        id: "archive",
        threadId: "archive-thread",
        labels: ["Work Archive"],
      }),
      message({
        id: "wildcard",
        threadId: "wildcard-thread",
        labels: ["Work_2026"],
      }),
    ]);

    expect(
      cache
        .listThreads({ view: "label", label: "Work", offset: 0, limit: 20 })
        .map((item) => item.id),
    ).toEqual(["work-thread"]);
    cache.close();
  });

  it("replaces folders removed by the provider", () => {
    const cache = createCache();
    cache.putFolders(primary.id, [
      { id: "INBOX", name: "Inbox", role: "inbox" },
      { id: "OLD", name: "Old label" },
    ]);
    cache.putFolders(primary.id, [{ id: "INBOX", name: "Inbox", role: "inbox" }]);

    expect(cache.listFolders()).toEqual([
      expect.objectContaining({ accountId: primary.id, id: "INBOX" }),
    ]);
    cache.close();
  });

  it("invalidates a hydrated thread when new message metadata arrives", () => {
    const cache = createCache();
    const first = message({
      id: "first",
      threadId: "thread-a",
      body: { text: "old body" },
    });
    cache.putThread(primary, {
      id: "thread-a",
      subject: first.subject,
      messages: [first],
    });
    expect(cache.getThread(primary.id, "thread-a")?.messages).toHaveLength(1);

    cache.putMessages(primary, [
      message({
        id: "second",
        threadId: "thread-a",
        date: "2026-07-15T12:00:00Z",
        body: { text: "new body" },
      }),
    ]);

    expect(cache.getThread(primary.id, "thread-a")).toBeUndefined();
    expect(cache.listThreads({ view: "inbox", offset: 0, limit: 20 })[0]?.messageCount).toBe(2);
    cache.close();
  });

  it("removes a deleted draft from summaries and hydrated bodies", () => {
    const cache = createCache();
    const draft = message({
      id: "draft-message",
      threadId: "draft-thread",
      draftId: "draft-1",
      folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
      flags: { read: true, starred: false, draft: true },
      body: { text: "draft body" },
    });
    cache.putThread(primary, {
      id: draft.threadId,
      subject: draft.subject,
      messages: [draft],
    });

    cache.deleteDraft(primary, "draft-1");

    expect(cache.listThreads({ view: "drafts", offset: 0, limit: 20 })).toEqual([]);
    expect(cache.getThread(primary.id, draft.threadId)).toBeUndefined();
    cache.close();
  });

  it("reconciles cached folder membership against a fresh provider page", () => {
    const cache = createCache();
    const current = message({
      id: "current",
      threadId: "current-thread",
      date: "2026-07-15T12:00:00Z",
    });
    const boundary = message({
      id: "boundary",
      threadId: "boundary-thread",
      date: "2026-07-15T10:00:00Z",
    });
    cache.putMessages(primary, [
      current,
      boundary,
      message({
        id: "stale",
        threadId: "stale-thread",
        date: "2026-07-15T11:00:00Z",
      }),
      message({
        id: "older",
        threadId: "older-thread",
        date: "2026-07-15T09:00:00Z",
      }),
    ]);

    expect(cache.reconcileFolderPage(primary, "inbox", [current, boundary], false)).toBe(1);
    expect(
      cache.listThreads({ view: "inbox", offset: 0, limit: 20 }).map((thread) => thread.id),
    ).toEqual(["current-thread", "boundary-thread", "older-thread"]);

    expect(cache.reconcileFolderPage(primary, "inbox", [current, boundary], true)).toBe(1);
    expect(
      cache.listThreads({ view: "inbox", offset: 0, limit: 20 }).map((thread) => thread.id),
    ).toEqual(["current-thread", "boundary-thread"]);
    cache.close();
  });

  it("rolls back an optimistic change and keeps message IDs available for permanent delete", () => {
    const cache = createCache();
    cache.putMessages(primary, [message({ id: "m1", threadId: "thread-a" })]);
    const snapshot = cache.snapshotThread(primary.id, "thread-a")!;

    cache.applyAction(primary.id, "thread-a", { type: "delete" });
    expect(cache.listThreads({ view: "all", offset: 0, limit: 20 })).toHaveLength(0);
    expect(cache.messageIds(primary.id, "thread-a")).toEqual(["m1"]);
    cache.restoreThread(snapshot);
    expect(cache.listThreads({ view: "all", offset: 0, limit: 20 })).toHaveLength(1);
    cache.close();
  });

  it("allows only the latest mutation owner to change or restore a thread", () => {
    const cache = createCache();
    cache.putMessages(primary, [message({ id: "m1", threadId: "thread-a" })]);
    const original = cache.snapshotThread(primary.id, "thread-a")!;
    const target = { accountId: primary.id, threadId: "thread-a" };

    cache.claimMutation("older", [target]);
    expect(cache.applyActionIfOwned(primary.id, "thread-a", { type: "markRead" }, "older")).toBe(
      true,
    );
    cache.claimMutation("newer", [target]);

    expect(cache.restoreThreadIfOwned(original, "older")).toBe(false);
    expect(cache.applyActionIfOwned(primary.id, "thread-a", { type: "star" }, "older")).toBe(false);
    expect(cache.applyActionIfOwned(primary.id, "thread-a", { type: "star" }, "newer")).toBe(true);
    cache.releaseMutation("older", [target]);

    expect(cache.ownsMutation(primary.id, "thread-a", "newer")).toBe(true);
    expect(cache.snapshotThread(primary.id, "thread-a")).toMatchObject({
      unread: 0,
      starred: 1,
    });
    cache.close();
  });

  it("removes cached messages missing from an authoritative thread response", () => {
    const cache = createCache();
    const first = message({ id: "m1", threadId: "thread-a" });
    const second = message({ id: "m2", threadId: "thread-a" });
    cache.putThread(primary, {
      id: "thread-a",
      subject: "Thread",
      messages: [first, second],
    });

    cache.putThread(primary, {
      id: "thread-a",
      subject: "Thread",
      messages: [second],
    });

    expect(cache.messageIds(primary.id, "thread-a")).toEqual(["m2"]);
    expect(cache.snapshotThread(primary.id, "thread-a")?.message_count).toBe(1);
    cache.close();
  });

  it("notifies only after the initial inbox watermark", () => {
    const cache = createCache();
    const first = message({ id: "initial", threadId: "thread-a" });
    const next = message({
      id: "new",
      threadId: "thread-b",
      date: "2026-07-15T12:00:00Z",
    });

    expect(cache.recordInboxPage(primary.id, [first]).newMessages).toEqual([]);
    expect(
      cache.recordInboxPage(primary.id, [first, next]).newMessages.map((item) => item.id),
    ).toEqual(["new"]);
    expect(cache.recordInboxPage(primary.id, [first, next]).newMessages).toEqual([]);
    cache.close();
  });

  it("initializes notifications even when the first inbox page is empty", () => {
    const cache = createCache();
    const first = message({ id: "first", threadId: "thread-a" });

    expect(cache.recordInboxPage(primary.id, [])).toMatchObject({
      initialized: false,
      newMessages: [],
    });
    expect(cache.recordInboxPage(primary.id, [first]).newMessages).toEqual([first]);
    cache.close();
  });

  it("does not forget messages that remain on the Inbox page after 30 days", () => {
    vi.useFakeTimers();
    const cache = createCache();
    const first = message({ id: "first", threadId: "thread-a" });
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      cache.recordInboxPage(primary.id, [first]);
      vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));

      expect(cache.recordInboxPage(primary.id, [first]).newMessages).toEqual([]);
      expect(cache.recordInboxPage(primary.id, [first]).newMessages).toEqual([]);
    } finally {
      cache.close();
      vi.useRealTimers();
    }
  });
});

function createCache(): MailCache {
  return createCacheWithDirectory().cache;
}

function createCacheWithDirectory(): { cache: MailCache; directory: string } {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxmail-cache-"));
  directories.push(directory);
  const cache = new MailCache(directory, {
    encrypt: (value) => Buffer.from(`cipher:${Buffer.from(value).toString("base64")}`),
    decrypt: (value) => Buffer.from(value.toString().slice(7), "base64").toString("utf8"),
  });
  cache.putFolders(primary.id, [{ id: "INBOX", name: "Inbox", role: "inbox", unreadCount: 3 }]);
  return { cache, directory };
}

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "message",
    threadId: "thread",
    accountId: primary.id,
    folder: { id: "INBOX", name: "Inbox", role: "inbox" },
    from: { name: "Taylor", email: "taylor@example.net" },
    to: [{ email: primary.email }],
    subject: "Project update",
    date: "2026-07-15T09:00:00Z",
    snippet: "The latest project notes",
    flags: { read: false, starred: false, draft: false },
    ...overrides,
  };
}
