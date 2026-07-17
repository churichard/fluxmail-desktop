import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Message } from "@fluxmail/core";
import type { StoreCompatibility } from "fluxmail";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesktopAnalytics } from "../src/main/analytics";
import { MailCache } from "../src/main/cache";
import {
  FluxmailRuntime,
  prepareFluxmailConfiguration,
  shouldUseBundledGoogleConfig,
} from "../src/main/fluxmail-runtime";
import type { AccountInfo } from "../src/shared/contracts";

const account = {
  id: "account-1",
  email: "me@example.com",
  provider: "gmail" as const,
  status: "active" as const,
};
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("FluxmailRuntime thread loading", () => {
  it("paginates with provider tokens when messages collapse into fewer threads", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      inboxMessage({
        id: `message-${index}`,
        threadId: "thread-one",
        date: `2026-07-16T12:${String(index % 60).padStart(2, "0")}:00Z`,
      }),
    );
    const historical = inboxMessage({
      id: "historical",
      threadId: "thread-two",
      date: "2026-07-15T12:00:00Z",
    });
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({ items: firstPage, nextPageToken: "page-2" })
      .mockResolvedValueOnce({ items: [historical] });
    const onCacheChanged = vi.fn();
    const onNewMessages = vi.fn();
    const runtime = createRuntimeWithCache({
      cache: createCache(),
      service: { listMessages },
      onCacheChanged,
      onNewMessages,
    });

    const first = await runtime.listThreads({ view: "inbox", pageSize: 100 });
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toBe("1");
    expect(listMessages).toHaveBeenCalledOnce();

    const cached = await runtime.listThreads({ view: "inbox", pageSize: 100 });
    expect(cached.items).toHaveLength(1);
    expect(listMessages).toHaveBeenCalledOnce();

    const second = await runtime.listThreads({
      view: "inbox",
      cursor: first.nextCursor,
      pageSize: 100,
    });
    expect(second.items.map((item) => item.id)).toEqual(["thread-two"]);
    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(listMessages.mock.calls[1]?.[2]).toMatchObject({
      pageToken: "page-2",
    });
    expect(onNewMessages).not.toHaveBeenCalled();
    expect(onCacheChanged).toHaveBeenCalledTimes(2);
  });

  it("keeps provider search results that do not match cached summary text", async () => {
    const listMessages = vi.fn(async () => ({
      items: [
        inboxMessage({
          id: "attachment",
          threadId: "attachment-thread",
          subject: "Quarterly report",
          snippet: "The report is ready.",
        }),
      ],
    }));
    const runtime = createRuntimeWithCache({
      cache: createCache(),
      service: { listMessages },
      onCacheChanged: vi.fn(),
    });
    const input = {
      view: "search" as const,
      query: "has:attachment",
      pageSize: 100,
    };

    const providerResult = await runtime.listThreads(input, true);
    expect(providerResult.items.map((item) => item.id)).toEqual(["attachment-thread"]);
    const cachedResult = await runtime.listThreads(input);
    expect(cachedResult.items.map((item) => item.id)).toEqual(["attachment-thread"]);
    expect(listMessages).toHaveBeenCalledOnce();
  });

  it("keeps cached threads when a forced refresh fails", async () => {
    const sent = inboxMessage({
      id: "sent-message",
      threadId: "sent-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
    });
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({ items: [sent] })
      .mockRejectedValueOnce(new Error("Provider unavailable"));
    const runtime = createRuntimeWithCache({
      cache: createCache(),
      service: { listMessages },
      onCacheChanged: vi.fn(),
    });

    await runtime.listThreads({ view: "sent", pageSize: 100 });
    const fallback = await runtime.listThreads({
      view: "sent",
      pageSize: 100,
      refresh: true,
    });

    expect(fallback.items.map((item) => item.id)).toEqual(["sent-thread"]);
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it("does not reuse stale later pages after a non-inbox view refresh", async () => {
    const oldFirst = inboxMessage({
      id: "old-first-message",
      threadId: "old-first-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
      date: "2026-07-16T14:00:00Z",
    });
    const oldSecond = inboxMessage({
      id: "old-second-message",
      threadId: "old-second-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
      date: "2026-07-16T13:00:00Z",
    });
    const newFirst = inboxMessage({
      id: "new-first-message",
      threadId: "new-first-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
      date: "2026-07-16T16:00:00Z",
    });
    const newSecond = inboxMessage({
      id: "new-second-message",
      threadId: "new-second-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
      date: "2026-07-16T15:00:00Z",
    });
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({ items: [oldFirst], nextPageToken: "old-page-2" })
      .mockResolvedValueOnce({ items: [oldSecond] })
      .mockResolvedValueOnce({ items: [newFirst], nextPageToken: "new-page-2" })
      .mockResolvedValueOnce({ items: [newSecond] });
    const runtime = createRuntimeWithCache({
      cache: createCache(),
      service: { listMessages },
      onCacheChanged: vi.fn(),
    });

    const firstPage = await runtime.listThreads({ view: "sent", pageSize: 1 });
    expect(firstPage.items.map((item) => item.id)).toEqual(["old-first-thread"]);
    expect(
      (
        await runtime.listThreads({
          view: "sent",
          cursor: firstPage.nextCursor,
          pageSize: 1,
        })
      ).items.map((item) => item.id),
    ).toEqual(["old-second-thread"]);

    const refreshed = await runtime.listThreads({
      view: "sent",
      pageSize: 1,
      refresh: true,
    });
    expect(refreshed.items.map((item) => item.id)).toEqual(["new-first-thread"]);
    expect(
      (
        await runtime.listThreads({
          view: "sent",
          cursor: refreshed.nextCursor,
          pageSize: 1,
        })
      ).items.map((item) => item.id),
    ).toEqual(["new-second-thread"]);
    expect(listMessages).toHaveBeenCalledTimes(4);
    expect(listMessages.mock.calls[3]?.[2]).toMatchObject({
      pageToken: "new-page-2",
    });
  });

  it("keeps refreshing healthy accounts when another account fails", async () => {
    const healthyAccount: AccountInfo = {
      id: "account-2",
      email: "healthy@example.com",
      provider: "gmail",
      status: "active",
    };
    const listFolders = vi.fn(async (accountId: string) => {
      if (accountId === account.id) throw new Error("Reconnect this account");
      return [{ id: "INBOX", name: "Inbox", role: "inbox" as const }];
    });
    const listMessages = vi.fn(async (accountId: string) => {
      if (accountId === account.id) throw new Error("Reconnect this account");
      return {
        items: [
          inboxMessage({
            id: "healthy-message",
            threadId: "healthy-thread",
            accountId: healthyAccount.id,
          }),
        ],
      };
    });
    const cache = createCache();
    const runtime = createRuntimeWithCache({
      cache,
      accounts: [account, healthyAccount],
      service: { listFolders, listMessages },
      onCacheChanged: vi.fn(),
    });

    await expect(runtime.refresh("poll")).resolves.toBe(1);
    expect(
      cache.listThreads({
        view: "inbox",
        accountIds: [healthyAccount.id],
        offset: 0,
        limit: 10,
      }),
    ).toHaveLength(1);
    expect(listFolders).toHaveBeenCalledTimes(2);
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it("does not spin when only the account with a next page fails", async () => {
    const exhaustedAccount: AccountInfo = {
      id: "account-2",
      email: "exhausted@example.com",
      provider: "gmail",
      status: "active",
    };
    const cache = createCache();
    cache.setPageToken(account.id, "inbox::", "next-page");
    cache.setPageToken(exhaustedAccount.id, "inbox::");
    const listMessages = vi.fn(async () => {
      throw new Error("Provider unavailable");
    });
    const runtime = createRuntimeWithCache({
      cache,
      accounts: [account, exhaustedAccount],
      service: { listMessages },
      onCacheChanged: vi.fn(),
    });

    await expect(runtime.listThreads({ view: "inbox" })).rejects.toThrow("Provider unavailable");
    expect(listMessages).toHaveBeenCalledOnce();
  });

  it("refreshes the active mailbox as well as Inbox", async () => {
    const listMessages = vi.fn(async (_accountId: string, _query: { folder?: string }) => ({
      items: [],
    }));
    const runtime = createRuntimeWithCache({
      cache: createCache(),
      service: {
        listFolders: vi.fn(async () => [{ id: "INBOX", name: "Inbox", role: "inbox" as const }]),
        listMessages,
      },
      onCacheChanged: vi.fn(),
    });

    await runtime.refresh("manual", { view: "sent", pageSize: 100 });

    expect(listMessages.mock.calls.map((call) => call[1])).toEqual([
      { folder: "inbox" },
      { folder: "drafts" },
      { folder: "sent" },
    ]);
  });

  it("loads every Drafts page during startup so the count is complete", async () => {
    const cache = createCache();
    cache.putMessages(account, [
      inboxMessage({
        id: "deleted-draft",
        threadId: "deleted-draft-thread",
        folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
        flags: { read: true, starred: false, draft: true },
      }),
    ]);
    const listMessages = vi.fn(
      async (_accountId: string, query: { folder?: string }, page?: { pageToken?: string }) => {
        if (query.folder === "inbox") return { items: [] };
        if (!page?.pageToken)
          return {
            items: [
              inboxMessage({
                id: "draft-1",
                threadId: "draft-thread-1",
                folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
                flags: { read: true, starred: false, draft: true },
              }),
            ],
            nextPageToken: "draft-page-2",
          };
        return {
          items: [
            inboxMessage({
              id: "draft-2",
              threadId: "draft-thread-2",
              folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
              flags: { read: true, starred: false, draft: true },
            }),
          ],
        };
      },
    );
    const runtime = createRuntimeWithCache({
      cache,
      service: {
        listFolders: vi.fn(async () => [{ id: "INBOX", name: "Inbox", role: "inbox" as const }]),
        listMessages,
      },
      onCacheChanged: vi.fn(),
    });

    await runtime.refresh("startup");

    expect(cache.draftCount()).toBe(2);
    expect(listMessages).toHaveBeenCalledTimes(3);
  });

  it("uses provider folder totals for unread counts", () => {
    const cache = createCache();
    cache.putMessages(account, [inboxMessage()]);
    cache.putFolders(account.id, [{ id: "INBOX", name: "Inbox", role: "inbox", unreadCount: 237 }]);
    const runtime = createRuntimeWithCache({
      cache,
      service: {},
      onCacheChanged: vi.fn(),
    });

    expect(runtime.unreadCount()).toBe(237);
  });
});

describe("FluxmailRuntime conversation mutations", () => {
  it("does not let an older sync page overwrite a completed mutation", async () => {
    const cache = createCache();
    const unread = inboxMessage({ id: "message-1", threadId: "thread-1" });
    cache.putMessages(account, [unread]);
    let resolvePage: ((page: { items: Message[] }) => void) | undefined;
    const listMessages = vi.fn(
      () =>
        new Promise<{ items: Message[] }>((resolve) => {
          resolvePage = resolve;
        }),
    );
    let modified = false;
    const getThread = vi.fn(async () => ({
      id: "thread-1",
      subject: "Hello",
      messages: [
        inboxMessage({
          id: "message-1",
          threadId: "thread-1",
          flags: { read: modified, starred: false, draft: false },
        }),
      ],
    }));
    const runtime = createRuntimeWithCache({
      cache,
      service: {
        listFolders: vi.fn(async () => [{ id: "INBOX", name: "Inbox", role: "inbox" as const }]),
        listMessages,
        getThread,
        modify: vi.fn(async () => {
          modified = true;
        }),
      },
      onCacheChanged: vi.fn(),
    });

    const refresh = runtime.refresh("poll");
    await vi.waitFor(() => expect(listMessages).toHaveBeenCalledOnce());
    await runtime.modify([{ accountId: account.id, threadId: "thread-1" }], {
      type: "markRead",
    });
    resolvePage?.({ items: [unread] });
    await refresh;

    expect(cache.snapshotThread(account.id, "thread-1")?.unread).toBe(0);
  });

  it("does not let an older folder response overwrite mutation counts", async () => {
    const cache = createCache();
    const unread = inboxMessage({ id: "message-1", threadId: "thread-1" });
    cache.putMessages(account, [unread]);
    cache.putFolders(account.id, [{ id: "INBOX", name: "Inbox", role: "inbox", unreadCount: 1 }]);
    let resolveFolders:
      | ((folders: Array<{ id: string; name: string; role: "inbox"; unreadCount: number }>) => void)
      | undefined;
    const listFolders = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Array<{ id: string; name: string; role: "inbox"; unreadCount: number }>>(
            (resolve) => {
              resolveFolders = resolve;
            },
          ),
      )
      .mockResolvedValueOnce([
        { id: "INBOX", name: "Inbox", role: "inbox" as const, unreadCount: 0 },
      ]);
    let modified = false;
    const getThread = vi.fn(async () => ({
      id: "thread-1",
      subject: "Hello",
      messages: [
        inboxMessage({
          id: "message-1",
          threadId: "thread-1",
          flags: { read: modified, starred: false, draft: false },
        }),
      ],
    }));
    const runtime = createRuntimeWithCache({
      cache,
      service: {
        listFolders,
        listMessages: vi.fn(async () => ({
          items: [
            inboxMessage({
              id: "message-1",
              threadId: "thread-1",
              flags: { read: true, starred: false, draft: false },
            }),
          ],
        })),
        getThread,
        modify: vi.fn(async () => {
          modified = true;
        }),
      },
      onCacheChanged: vi.fn(),
    });

    const refresh = runtime.refresh("poll");
    await vi.waitFor(() => expect(listFolders).toHaveBeenCalledOnce());
    await runtime.modify([{ accountId: account.id, threadId: "thread-1" }], {
      type: "markRead",
    });
    resolveFolders?.([{ id: "INBOX", name: "Inbox", role: "inbox", unreadCount: 1 }]);
    await refresh;

    expect(cache.listFolders()[0]?.unreadCount).toBe(0);
  });

  it("hydrates every target before modifying the complete conversation", async () => {
    const cache = createCache();
    const first = inboxMessage({ id: "first", threadId: "thread-1" });
    const second = inboxMessage({
      id: "second",
      threadId: "thread-1",
      date: "2026-07-16T13:00:00Z",
    });
    cache.putMessages(account, [first]);
    const getThread = vi.fn(async () => ({
      id: "thread-1",
      subject: "Hello",
      messages: [first, second],
    }));
    const modify = vi.fn(async () => undefined);
    const runtime = createRuntimeWithCache({
      cache,
      service: { getThread, modify },
      onCacheChanged: vi.fn(),
    });

    await runtime.modify([{ accountId: account.id, threadId: "thread-1" }], {
      type: "markRead",
    });

    expect(modify).toHaveBeenCalledWith(account.id, ["first", "second"], "markRead");
    expect(getThread).toHaveBeenCalledTimes(2);
  });

  it("keeps successful account mutations when another account fails", async () => {
    const secondary: AccountInfo = {
      id: "account-2",
      email: "secondary@example.com",
      provider: "gmail",
      status: "active",
    };
    const cache = createCache();
    cache.putMessages(account, [inboxMessage({ id: "a", threadId: "thread-a" })]);
    cache.putMessages(secondary, [
      inboxMessage({
        id: "b",
        threadId: "thread-b",
        accountId: secondary.id,
      }),
    ]);
    const modifiedAccounts = new Set<string>();
    const getThread = vi.fn(async (accountId: string, threadId: string) => ({
      id: threadId,
      subject: "Hello",
      messages: [
        inboxMessage({
          id: accountId === account.id ? "a" : "b",
          accountId,
          threadId,
          flags: {
            read: modifiedAccounts.has(accountId),
            starred: false,
            draft: false,
          },
        }),
      ],
    }));
    const modify = vi.fn(async (accountId: string) => {
      if (accountId === secondary.id) throw new Error("Secondary account failed");
      modifiedAccounts.add(accountId);
    });
    const runtime = createRuntimeWithCache({
      cache,
      accounts: [account, secondary],
      service: { getThread, modify },
      onCacheChanged: vi.fn(),
    });

    await expect(
      runtime.modify(
        [
          { accountId: account.id, threadId: "thread-a" },
          { accountId: secondary.id, threadId: "thread-b" },
        ],
        { type: "markRead" },
      ),
    ).rejects.toThrow("Secondary account failed");

    expect(cache.snapshotThread(account.id, "thread-a")?.unread).toBe(0);
    expect(cache.snapshotThread(secondary.id, "thread-b")?.unread).toBe(1);
  });

  it("reconciles the provider state after a partially applied mutation fails", async () => {
    const cache = createCache();
    const first = inboxMessage({ id: "first", threadId: "thread-1" });
    const second = inboxMessage({
      id: "second",
      threadId: "thread-1",
      date: "2026-07-16T13:00:00Z",
    });
    cache.putThread(account, {
      id: "thread-1",
      subject: "Hello",
      messages: [first, second],
    });
    const getThread = vi
      .fn()
      .mockResolvedValueOnce({ id: "thread-1", subject: "Hello", messages: [first, second] })
      .mockResolvedValueOnce({ id: "thread-1", subject: "Hello", messages: [second] });
    const runtime = createRuntimeWithCache({
      cache,
      service: {
        getThread,
        modify: vi.fn(async () => {
          throw new Error("The second provider operation failed");
        }),
      },
      onCacheChanged: vi.fn(),
    });

    await expect(
      runtime.modify([{ accountId: account.id, threadId: "thread-1" }], { type: "delete" }),
    ).rejects.toThrow("The second provider operation failed");

    expect(getThread).toHaveBeenCalledTimes(2);
    expect(cache.messageIds(account.id, "thread-1")).toEqual(["second"]);
    expect(cache.snapshotThread(account.id, "thread-1")?.message_count).toBe(1);
  });
});

describe("FluxmailRuntime draft mutations", () => {
  it("deletes only drafts when discarding a draft conversation", async () => {
    const original = inboxMessage({ id: "original", threadId: "thread-1" });
    const draft = draftMessage({
      id: "draft-message",
      threadId: "thread-1",
      draftId: "draft-1",
    });
    const providerDelete = vi.fn(async () => undefined);
    const cacheDelete = vi.fn();
    const onCacheChanged = vi.fn();
    const runtime = createRuntime({
      service: {
        getThread: vi.fn(async () => ({
          id: "thread-1",
          subject: "Hello",
          messages: [original, draft],
        })),
        deleteDraft: providerDelete,
      },
      cache: { deleteDraft: cacheDelete },
      onCacheChanged,
    });

    await runtime.modify([{ accountId: account.id, threadId: "thread-1" }], {
      type: "discardDraft",
    });

    expect(providerDelete).toHaveBeenCalledWith(account.id, "draft-1");
    expect(cacheDelete).toHaveBeenCalledWith(account, "draft-1");
    expect(onCacheChanged).toHaveBeenCalledOnce();
  });

  it("shows a saved draft in initialized cached views", async () => {
    const cache = createCache();
    cache.setPageToken(account.id, "drafts::");
    cache.setPageToken(account.id, "all::");
    const runtime = createRuntimeWithCache({
      cache,
      service: { createDraft: vi.fn(async () => draftMessage()) },
      onCacheChanged: vi.fn(),
    });

    await runtime.saveDraft({
      accountId: account.id,
      to: [{ email: "friend@example.com" }],
      subject: "Draft subject",
      text: "Draft body",
    });

    expect((await runtime.listThreads({ view: "drafts" })).items.map((item) => item.id)).toEqual([
      "draft-thread",
    ]);
    expect((await runtime.listThreads({ view: "all" })).items.map((item) => item.id)).toEqual([
      "draft-thread",
    ]);
  });

  it("shows a sent message in initialized cached views", async () => {
    const cache = createCache();
    cache.setPageToken(account.id, "sent::");
    cache.setPageToken(account.id, "all::");
    const sent = inboxMessage({
      id: "sent-message",
      threadId: "sent-thread",
      folder: { id: "SENT", name: "Sent", role: "sent" },
      flags: { read: true, starred: false, draft: false },
    });
    const runtime = createRuntimeWithCache({
      cache,
      service: {
        send: vi.fn(async () => ({ id: sent.id, threadId: sent.threadId })),
        getThread: vi.fn(async () => ({
          id: sent.threadId,
          subject: sent.subject,
          messages: [sent],
        })),
      },
      onCacheChanged: vi.fn(),
    });

    await runtime.send({
      accountId: account.id,
      to: [{ email: "friend@example.com" }],
      subject: "Sent subject",
      text: "Sent body",
    });

    expect((await runtime.listThreads({ view: "sent" })).items.map((item) => item.id)).toEqual([
      "sent-thread",
    ]);
    expect((await runtime.listThreads({ view: "all" })).items.map((item) => item.id)).toEqual([
      "sent-thread",
    ]);
  });

  it("updates a saved draft with the current compose payload before sending it", async () => {
    const updateDraft = vi.fn(async () => draftMessage());
    const send = vi.fn(async () => ({
      id: "sent-message",
      threadId: "sent-thread",
    }));
    const putMessages = vi.fn();
    const deleteDraft = vi.fn();
    const onCacheChanged = vi.fn();
    const runtime = createRuntime({
      service: { updateDraft, send },
      cache: { putMessages, deleteDraft },
      onCacheChanged,
    });

    await runtime.send({
      accountId: account.id,
      draftId: "draft-1",
      to: [{ email: "new-recipient@example.com" }],
      subject: "Updated subject",
      text: "Updated body",
    });

    expect(updateDraft).toHaveBeenCalledWith(account.id, "draft-1", {
      to: [{ email: "new-recipient@example.com" }],
      subject: "Updated subject",
      body: { text: "Updated body" },
    });
    expect(send).toHaveBeenCalledWith(account.id, { draftId: "draft-1" });
    expect(updateDraft.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0]!);
    expect(putMessages).toHaveBeenCalledWith(
      account,
      [expect.objectContaining({ draftId: "draft-1" })],
      {
        invalidateBodies: true,
      },
    );
    expect(deleteDraft).toHaveBeenCalledWith(account, "draft-1");
    expect(onCacheChanged).toHaveBeenCalledOnce();
  });

  it("purges the cached draft after the provider deletes it", async () => {
    const providerDelete = vi.fn(async () => undefined);
    const cacheDelete = vi.fn();
    const onCacheChanged = vi.fn();
    const runtime = createRuntime({
      service: { deleteDraft: providerDelete },
      cache: { deleteDraft: cacheDelete },
      onCacheChanged,
    });

    await runtime.deleteDraft(account.id, "draft-1");

    expect(providerDelete).toHaveBeenCalledWith(account.id, "draft-1");
    expect(cacheDelete).toHaveBeenCalledWith(account, "draft-1");
    expect(onCacheChanged).toHaveBeenCalledOnce();
  });

  it("refreshes the cached conversation after a direct reply", async () => {
    const send = vi.fn(async () => ({ id: "reply", threadId: "thread-1" }));
    const getThread = vi.fn(async () => ({
      id: "thread-1",
      subject: "Hello",
      messages: [draftMessage({ id: "reply", threadId: "thread-1" })],
    }));
    const putThread = vi.fn();
    const onCacheChanged = vi.fn();
    const runtime = createRuntime({
      service: { send, getThread },
      cache: { putThread, invalidateThread: vi.fn() },
      onCacheChanged,
    });

    await runtime.send({
      accountId: account.id,
      to: [{ email: "friend@example.com" }],
      subject: "Re: Hello",
      text: "Reply",
      replyToMessageId: "original",
    });

    expect(getThread).toHaveBeenCalledWith(account.id, "thread-1");
    expect(putThread).toHaveBeenCalledWith(account, expect.objectContaining({ id: "thread-1" }));
    expect(onCacheChanged).toHaveBeenCalledOnce();
  });

  it("refreshes the cached conversation after forwarding", async () => {
    const original = inboxMessage({
      id: "original",
      body: { text: "Original body", html: "<p>Original body</p>" },
      attachments: [
        {
          id: "original-attachment",
          filename: "original.pdf",
          mimeType: "application/pdf",
          sizeBytes: 8,
        },
      ],
    });
    const getMessage = vi.fn(async () => original);
    const getAttachment = vi.fn(async () => ({
      meta: { filename: "original.pdf", mimeType: "application/pdf" },
      content: Buffer.from("original"),
    }));
    const send = vi.fn(async () => ({
      id: "forward",
      threadId: "forward-thread",
    }));
    const getThread = vi.fn(async () => ({
      id: "forward-thread",
      subject: "Fwd: Hello",
      messages: [draftMessage({ id: "forward", threadId: "forward-thread" })],
    }));
    const putThread = vi.fn();
    const onCacheChanged = vi.fn();
    const runtime = createRuntime({
      service: { getMessage, getAttachment, send, getThread },
      cache: { putThread, invalidateThread: vi.fn() },
      onCacheChanged,
    });

    await runtime.forward({
      accountId: account.id,
      messageId: "original",
      to: [{ email: "friend@example.com" }],
      bcc: [{ email: "archive@example.com" }],
      subject: "A custom forward subject",
      text: "For your review",
      html: "<p><strong>For your review</strong></p>",
      attachments: [
        {
          token: "added-attachment",
          filename: "attachment.txt",
          mimeType: "text/plain",
          sizeBytes: 7,
        },
      ],
      includeAttachments: true,
    });

    expect(getAttachment).toHaveBeenCalledWith(
      account.id,
      "original",
      "original-attachment",
      25 * 1024 * 1024,
    );
    expect(send).toHaveBeenCalledWith(
      account.id,
      expect.objectContaining({
        to: [{ email: "friend@example.com" }],
        bcc: [{ email: "archive@example.com" }],
        subject: "A custom forward subject",
        body: {
          text: expect.stringMatching(/For your review[\s\S]*Original body/),
          html: expect.stringMatching(/<strong>For your review<\/strong>[\s\S]*Original body/),
        },
        attachments: [
          expect.objectContaining({ filename: "original.pdf" }),
          expect.objectContaining({ filename: "attachment.txt" }),
        ],
      }),
    );
    expect(getThread).toHaveBeenCalledWith(account.id, "forward-thread");
    expect(putThread).toHaveBeenCalledWith(
      account,
      expect.objectContaining({ id: "forward-thread" }),
    );
    expect(onCacheChanged).toHaveBeenCalledOnce();
  });
});

describe("FluxmailRuntime OAuth configuration", () => {
  it("rejects an incompatible store before writing bundled configuration", () => {
    const compatibility: StoreCompatibility = {
      engineVersion: "0.3.0",
      dataDir: "/tmp/fluxmail",
      dbPath: "/tmp/fluxmail/fluxmail.db",
      storeFormat: 2,
      minimumSupportedFormat: 1,
      maximumSupportedFormat: 1,
      compatible: false,
      requiresMigration: false,
    };
    const readStoredConfig = vi.fn(() => ({}));
    const setStoredConfig = vi.fn();
    class TestIncompatibleStoreError extends Error {
      readonly code = "incompatible_store";

      constructor(readonly compatibility: StoreCompatibility) {
        super("Incompatible store");
      }
    }
    const fluxmail = {
      resolveStoreLocation: vi.fn(() => ({
        dataDir: compatibility.dataDir,
        dbPath: compatibility.dbPath,
      })),
      inspectStoreCompatibility: vi.fn(() => compatibility),
      IncompatibleStoreError: TestIncompatibleStoreError,
      readStoredConfig,
      setStoredConfig,
    };

    expect(() =>
      prepareFluxmailConfiguration(
        fluxmail as Parameters<typeof prepareFluxmailConfiguration>[0],
        "bundled-id",
        "bundled-secret",
      ),
    ).toThrow(TestIncompatibleStoreError);
    expect(readStoredConfig).not.toHaveBeenCalled();
    expect(setStoredConfig).not.toHaveBeenCalled();
  });

  it("uses the bundled pair when the existing configuration is incomplete", () => {
    expect(
      shouldUseBundledGoogleConfig("custom-id", undefined, "bundled-id", "bundled-secret"),
    ).toBe(true);
    expect(
      shouldUseBundledGoogleConfig(undefined, "custom-secret", "bundled-id", "bundled-secret"),
    ).toBe(true);
  });

  it("keeps a complete existing pair and requires a complete bundled pair", () => {
    expect(
      shouldUseBundledGoogleConfig("custom-id", "custom-secret", "bundled-id", "bundled-secret"),
    ).toBe(false);
    expect(shouldUseBundledGoogleConfig(undefined, undefined, "bundled-id", "")).toBe(false);
  });
});

function createRuntime(input: {
  service: Record<string, ReturnType<typeof vi.fn>>;
  cache: Record<string, ReturnType<typeof vi.fn>>;
  onCacheChanged(): void;
}): FluxmailRuntime {
  const cache = {
    putThread: vi.fn(),
    invalidateThread: vi.fn(),
    recordResultPage: vi.fn(),
    ...input.cache,
  };
  const runtime = new FluxmailRuntime({
    cache: cache as unknown as MailCache,
    analytics: {
      captureOperation: vi.fn(),
    } as unknown as DesktopAnalytics,
    openExternal: vi.fn(async () => undefined),
    resolveAttachment: vi.fn(async () => ({
      filename: "attachment.txt",
      mimeType: "text/plain",
      content: "Y29udGVudA==",
    })),
    onNewMessages: vi.fn(),
    onCacheChanged: input.onCacheChanged,
  });
  Object.assign(runtime, {
    context: {
      config: { maxAttachmentBytes: 25 * 1024 * 1024 },
      registry: { listAccounts: () => [account] },
      service: input.service,
    },
  });
  return runtime;
}

function createRuntimeWithCache(input: {
  cache: MailCache;
  service: Record<string, ReturnType<typeof vi.fn>>;
  accounts?: AccountInfo[];
  onCacheChanged(): void;
  onNewMessages?(messages: Message[], account: AccountInfo): void;
}): FluxmailRuntime {
  const runtime = new FluxmailRuntime({
    cache: input.cache,
    analytics: {
      captureOperation: vi.fn(),
      captureSync: vi.fn(),
    } as unknown as DesktopAnalytics,
    openExternal: vi.fn(async () => undefined),
    resolveAttachment: vi.fn(async () => ({
      filename: "attachment.txt",
      mimeType: "text/plain",
      content: "Y29udGVudA==",
    })),
    onNewMessages: input.onNewMessages ?? vi.fn(),
    onCacheChanged: input.onCacheChanged,
  });
  Object.assign(runtime, {
    context: {
      config: { maxAttachmentBytes: 25 * 1024 * 1024 },
      registry: { listAccounts: () => input.accounts ?? [account] },
      service: input.service,
    },
  });
  return runtime;
}

function createCache(): MailCache {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxmail-runtime-"));
  directories.push(directory);
  return new MailCache(directory, {
    encrypt: (value) => Buffer.from(value),
    decrypt: (value) => value.toString("utf8"),
  });
}

function inboxMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "message",
    threadId: "thread",
    accountId: account.id,
    folder: { id: "INBOX", name: "Inbox", role: "inbox" },
    from: { email: "sender@example.com" },
    to: [{ email: account.email }],
    subject: "Hello",
    date: "2026-07-16T12:00:00Z",
    snippet: "Hello there",
    flags: { read: false, starred: false, draft: false },
    ...overrides,
  };
}

function draftMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "draft-message",
    threadId: "draft-thread",
    draftId: "draft-1",
    accountId: account.id,
    folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
    from: { email: account.email },
    to: [{ email: "new-recipient@example.com" }],
    subject: "Updated subject",
    date: "2026-07-16T12:00:00Z",
    body: { text: "Updated body" },
    flags: { read: true, starred: false, draft: true },
    ...overrides,
  };
}
