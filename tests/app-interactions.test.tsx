/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";
import type {
  BootstrapState,
  FluxmailDesktopApi,
  MailThread,
  ThreadSummary,
} from "../src/shared/contracts";

vi.mock("../src/renderer/components/Sidebar", () => ({
  Sidebar: ({
    onSettings,
    onViewChange,
  }: {
    onSettings(): void;
    onViewChange(view: "starred"): void;
  }) => (
    <aside>
      Sidebar
      <button onClick={() => onViewChange("starred")}>Starred</button>
      <button onClick={onSettings}>Settings</button>
    </aside>
  ),
}));

vi.mock("../src/renderer/components/ThreadListPane", () => ({
  ThreadListPane: ({
    threads,
    onSelect,
  }: {
    threads: ThreadSummary[];
    onSelect(thread: ThreadSummary): void;
  }) => (
    <section>
      <span>{threads.length} conversations</span>
      {threads.map((thread) => (
        <button key={thread.id} onClick={() => onSelect(thread)}>
          {thread.subject}
        </button>
      ))}
    </section>
  ),
}));

vi.mock("../src/renderer/components/ReadingPane", () => ({
  ReadingPane: ({
    thread,
    onModify,
    onQuickReplyDirtyChange,
  }: {
    thread?: ThreadSummary;
    onModify(action: { type: "unstar" }): Promise<void>;
    onQuickReplyDirtyChange(dirty: boolean): void;
  }) => (
    <section>
      {thread ? `Reading ${thread.subject}` : "No conversation"}
      {thread ? (
        <>
          <button onClick={() => onQuickReplyDirtyChange(true)}>Start quick reply</button>
          <button onClick={() => void onModify({ type: "unstar" })}>Unstar conversation</button>
        </>
      ) : null}
    </section>
  ),
}));

vi.mock("../src/renderer/components/ComposeDialog", async () => {
  const React = await import("react");
  return {
    ComposeDialog: React.forwardRef(({ seed }: { seed: { subject?: string } }, ref) => {
      React.useImperativeHandle(ref, () => ({ close: async () => true }));
      return (
        <section role="dialog" aria-label="Compose">
          {seed.subject}
          <button>Compose action</button>
        </section>
      );
    }),
  };
});

vi.mock("../src/renderer/components/SettingsDialog", () => ({
  SettingsDialog: () => (
    <section role="dialog" aria-label="Settings">
      <button>Settings action</button>
    </section>
  ),
}));

vi.mock("../src/renderer/components/Onboarding", () => ({
  Onboarding: () => null,
}));

vi.mock("../src/renderer/components/FluxmailLogoMark", () => ({
  FluxmailLogoMark: () => <span>Fluxmail</span>,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App thread navigation", () => {
  it("ignores a draft that finishes loading after another thread is selected", async () => {
    const draft = thread("draft-thread", "Draft in progress", true);
    const regular = thread("regular-thread", "Current conversation", false);
    let resolveDraft: ((thread: MailThread) => void) | undefined;
    const getThread = vi.fn(({ threadId }: { threadId: string }) => {
      if (threadId === draft.id)
        return new Promise<MailThread>((resolve) => {
          resolveDraft = resolve;
        });
      return Promise.resolve(mailThread(regular));
    });
    installApi([draft, regular], getThread);
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: draft.subject });

    fireEvent.click(screen.getByRole("button", { name: draft.subject }));
    fireEvent.click(screen.getByRole("button", { name: regular.subject }));
    await screen.findByText(`Reading ${regular.subject}`);
    await act(async () => {
      resolveDraft?.(draftThread(draft));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(`Reading ${regular.subject}`)).toBeTruthy();
  });

  it("keeps an unsent quick reply when thread navigation is canceled", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
    );
    installMatchMedia();
    const confirmDiscard = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<App />);
    await screen.findByRole("button", { name: first.subject });

    fireEvent.click(screen.getByRole("button", { name: first.subject }));
    fireEvent.click(screen.getByRole("button", { name: "Start quick reply" }));
    fireEvent.click(screen.getByRole("button", { name: second.subject }));

    expect(confirmDiscard).toHaveBeenCalledWith("Discard this unsent reply?");
    expect(screen.getByText(`Reading ${first.subject}`)).toBeTruthy();

    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: second.subject }));
    expect(screen.getByText(`Reading ${second.subject}`)).toBeTruthy();
  });

  it("keeps an unsent quick reply when a mutation removes the thread from the list", async () => {
    const current = { ...thread("thread-1", "Starred conversation", false), starred: true };
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
      { threadsAfterModify: [] },
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: "Starred" }));
    await screen.findByRole("button", { name: current.subject });
    fireEvent.click(screen.getByRole("button", { name: current.subject }));
    fireEvent.click(screen.getByRole("button", { name: "Start quick reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Unstar conversation" }));

    await screen.findByText("0 conversations");
    expect(window.fluxmail.mail.modify).toHaveBeenCalledOnce();
    expect(screen.getByText(`Reading ${current.subject}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start quick reply" })).toBeTruthy();
  });

  it("does not run mailbox shortcuts from compose controls", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    const conversation = screen.getByRole("button", { name: current.subject });
    fireEvent.click(conversation);
    fireEvent.keyDown(conversation, { key: "r" });
    const composeAction = await screen.findByRole("button", { name: "Compose action" });
    fireEvent.keyDown(composeAction, { key: "#" });

    expect(window.fluxmail.mail.modify).not.toHaveBeenCalled();
  });

  it("runs mailbox shortcuts forwarded from the email iframe", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: current.subject }));
    fireEvent.keyDown(window, { key: "e" });

    await waitFor(() =>
      expect(window.fluxmail.mail.modify).toHaveBeenCalledWith({
        targets: [{ accountId: current.accountId, threadId: current.id }],
        action: { type: "archive" },
      }),
    );
  });

  it("does not run mailbox shortcuts from Settings controls", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: current.subject }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    const settingsAction = await screen.findByRole("button", { name: "Settings action" });
    fireEvent.keyDown(settingsAction, { key: "#" });

    expect(window.fluxmail.mail.modify).not.toHaveBeenCalled();
  });
});

function installMatchMedia(): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function installApi(
  threads: ThreadSummary[],
  getThread: (target: { accountId: string; threadId: string }) => Promise<MailThread>,
  options: { threadsAfterModify?: ThreadSummary[] } = {},
): void {
  const state: BootstrapState = {
    accounts: [
      {
        id: "account-1",
        email: "me@example.com",
        provider: "gmail",
        status: "active",
      },
    ],
    folders: [],
    unreadCount: 0,
    draftCount: 1,
    countsByAccount: {
      "account-1": { unreadCount: 0, draftCount: 1 },
    },
    sync: { status: "idle" },
    telemetry: { enabled: false, lockedByEnvironment: false },
    preferences: { appearance: "light", dockBadge: true },
    license: { plan: "personal", maxMembers: 1, maxAccounts: 3 },
  };
  let visibleThreads = threads;
  Object.defineProperty(window, "fluxmail", {
    configurable: true,
    value: {
      bootstrap: vi.fn(async () => state),
      mail: {
        listThreads: vi.fn(async () => ({
          items: visibleThreads,
          totalCount: visibleThreads.length,
          syncing: false,
        })),
        search: vi.fn(async () => ({
          items: visibleThreads,
          totalCount: visibleThreads.length,
          syncing: false,
        })),
        getThread,
        modify: vi.fn(async () => {
          if (options.threadsAfterModify) visibleThreads = options.threadsAfterModify;
        }),
      },
      attachments: {
        prepare: vi.fn(async () => []),
        release: vi.fn(async () => undefined),
      },
      sync: { refresh: vi.fn(async () => undefined) },
      analytics: { trackFeature: vi.fn(async () => undefined) },
      system: {
        confirmWindowClose: vi.fn(async () => undefined),
        cancelWindowClose: vi.fn(async () => undefined),
      },
      onEvent: vi.fn(() => () => undefined),
    } as unknown as FluxmailDesktopApi,
  });
}

function thread(id: string, subject: string, draft: boolean): ThreadSummary {
  return {
    id,
    accountId: "account-1",
    accountEmail: "me@example.com",
    subject,
    senderName: "Sender",
    senderEmail: "sender@example.com",
    snippet: subject,
    date: "2026-07-16T12:00:00Z",
    unread: false,
    starred: false,
    draft,
    hasAttachments: false,
    messageCount: 1,
    labels: [],
    folderRoles: draft ? ["drafts"] : ["inbox"],
  };
}

function mailThread(summary: ThreadSummary): MailThread {
  return {
    id: summary.id,
    accountId: summary.accountId,
    accountEmail: summary.accountEmail,
    subject: summary.subject,
    messages: [
      {
        id: `${summary.id}-message`,
        threadId: summary.id,
        accountId: summary.accountId,
        from: { email: "sender@example.com" },
        to: [{ email: "me@example.com" }],
        subject: summary.subject,
        date: summary.date,
        flags: { read: true, starred: false, draft: false },
      },
    ],
  };
}

function draftThread(summary: ThreadSummary): MailThread {
  const detail = mailThread(summary);
  detail.messages[0] = {
    ...detail.messages[0]!,
    draftId: "draft-1",
    flags: { read: true, starred: false, draft: true },
  };
  return detail;
}
