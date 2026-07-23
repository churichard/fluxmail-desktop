/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/renderer/App";
import type {
  AppEvent,
  BootstrapState,
  FluxmailDesktopApi,
  MailThread,
  ModifyActionInput,
  ThreadSummary,
} from "../src/shared/contracts";

const closeDraft = vi.hoisted(() => vi.fn<() => boolean | Promise<boolean>>(() => true));
const openFind = vi.hoisted(() => vi.fn());

vi.mock("../src/renderer/components/Sidebar", () => ({
  Sidebar: ({
    onSettings,
    onViewChange,
  }: {
    onSettings(): void;
    onViewChange(view: "starred" | "all" | "drafts"): void;
  }) => (
    <aside>
      Sidebar
      <button onClick={() => onViewChange("starred")}>Starred</button>
      <button onClick={() => onViewChange("all")}>All mail</button>
      <button onClick={() => onViewChange("drafts")}>Drafts</button>
      <button onClick={onSettings}>Settings</button>
    </aside>
  ),
}));

vi.mock("../src/renderer/components/ThreadListPane", () => ({
  ThreadListPane: ({
    threads,
    onSelect,
    onToggleSelection,
    onModify,
    searchText,
    onSearchText,
    onSearch,
  }: {
    threads: ThreadSummary[];
    onSelect(thread: ThreadSummary): void;
    onToggleSelection(thread: ThreadSummary): void;
    onModify(action: ModifyActionInput, threads: ThreadSummary[]): Promise<void>;
    searchText: string;
    onSearchText(value: string): void;
    onSearch(): void;
  }) => (
    <section>
      <span>{threads.length} conversations</span>
      <input
        aria-label="Search mail"
        value={searchText}
        onChange={(event) => onSearchText(event.target.value)}
      />
      <button onClick={onSearch}>Run search</button>
      {threads.map((thread) => (
        <div
          key={thread.id}
          data-testid={`thread-${thread.id}`}
          data-unread={String(thread.unread)}
        >
          <button onClick={() => onSelect(thread)}>{thread.subject}</button>
          <button onClick={() => onToggleSelection(thread)}>Select {thread.subject}</button>
          <button onClick={() => void onModify({ type: "archive" }, [thread])}>
            Archive {thread.subject}
          </button>
          <button onClick={() => void onModify({ type: "star" }, [thread])}>
            Star {thread.subject}
          </button>
          <button onClick={() => void onModify({ type: "discardDraft" }, [thread])}>
            Discard {thread.subject}
          </button>
        </div>
      ))}
    </section>
  ),
}));

vi.mock("../src/renderer/components/ReadingPane", async () => {
  const React = await import("react");
  return {
    ReadingPane: React.forwardRef(function MockReadingPane(
      {
        thread,
        onModify,
        onDraftFinished,
        onQuickReplyDirtyChange,
      }: {
        thread?: ThreadSummary;
        onModify(action: { type: "star" | "unstar" }): Promise<void>;
        onDraftFinished?(): void;
        onQuickReplyDirtyChange(dirty: boolean): void;
      },
      ref,
    ) {
      const [composerMode, setComposerMode] = React.useState<string>();
      React.useImperativeHandle(ref, () => ({
        openComposer: setComposerMode,
        openFind,
        closeDraft,
      }));
      return (
        <section>
          {thread ? `Reading ${thread.subject}` : "No conversation"}
          {composerMode ? <span>Inline {composerMode}</span> : null}
          {thread ? (
            <>
              <button onClick={() => onQuickReplyDirtyChange(true)}>Start quick reply</button>
              <button onClick={() => void onModify({ type: thread.starred ? "unstar" : "star" })}>
                {thread.starred ? "Unstar conversation" : "Star conversation"}
              </button>
              <button onClick={onDraftFinished}>Finish draft</button>
            </>
          ) : null}
        </section>
      );
    }),
  };
});

vi.mock("../src/renderer/components/ComposeDialog", async () => {
  const React = await import("react");
  return {
    ComposeDialog: React.forwardRef(
      (
        {
          seed,
        }: {
          seed: { subject?: string; threadId?: string; replyToMessageId?: string };
        },
        ref,
      ) => {
        React.useImperativeHandle(ref, () => ({ close: async () => true }));
        return (
          <section role="dialog" aria-label="Compose">
            {seed.subject}
            <span data-testid="compose-thread-id">{seed.threadId}</span>
            <span data-testid="compose-reply-target">{seed.replyToMessageId}</span>
            <button>Compose action</button>
          </section>
        );
      },
    ),
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

beforeEach(() => {
  closeDraft.mockReset();
  closeDraft.mockReturnValue(true);
  openFind.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("App thread navigation", () => {
  it("reloads bootstrap when the license changes", async () => {
    const events = installApi(
      [],
      vi.fn(async () => mailThread(thread("thread", "Thread", false))),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByText("0 conversations");
    expect(window.fluxmail.bootstrap).toHaveBeenCalledOnce();

    act(() => events.emit({ type: "license-changed" }));

    await waitFor(() => expect(window.fluxmail.bootstrap).toHaveBeenCalledTimes(2));
  });

  it("requests a background refresh when switching away from Inbox", async () => {
    installApi(
      [],
      vi.fn(async () => mailThread(thread("thread", "Thread", false))),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByText("0 conversations");

    fireEvent.click(screen.getByRole("button", { name: "Starred" }));

    await waitFor(() =>
      expect(window.fluxmail.mail.listThreads).toHaveBeenLastCalledWith(
        expect.objectContaining({
          view: "starred",
          backgroundRefresh: true,
          refresh: undefined,
        }),
      ),
    );
  });

  it("opens a draft conversation in the reading pane instead of compose", async () => {
    const draft = thread("draft-thread", "Draft in progress", true);
    installApi(
      [draft],
      vi.fn(async () => draftThread(draft)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: draft.subject });

    fireEvent.click(screen.getByRole("button", { name: draft.subject }));

    expect(await screen.findByText(`Reading ${draft.subject}`)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Compose" })).toBeNull();
  });

  it("clears a completed draft when it disappears from the current view", async () => {
    const draft = thread("draft-thread", "Draft in progress", true);
    const api = installApi(
      [draft],
      vi.fn(async () => draftThread(draft)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: draft.subject });
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    fireEvent.click(await screen.findByRole("button", { name: draft.subject }));
    expect(await screen.findByText(`Reading ${draft.subject}`)).toBeTruthy();
    api.setVisibleThreads([]);

    fireEvent.click(screen.getByRole("button", { name: "Finish draft" }));

    await screen.findByText("No conversation");
    expect(screen.getByText("0 conversations")).toBeTruthy();
  });

  it("keeps the current conversation selected when its inline draft cannot close", async () => {
    const first = thread("draft-thread", "Draft in progress", true);
    const second = thread("regular-thread", "Another conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));
    expect(await screen.findByText(`Reading ${first.subject}`)).toBeTruthy();
    closeDraft.mockResolvedValueOnce(false);

    fireEvent.click(screen.getByRole("button", { name: second.subject }));

    await waitFor(() => expect(closeDraft).toHaveBeenCalled());
    expect(screen.getByText(`Reading ${first.subject}`)).toBeTruthy();
  });

  it("waits for an inline draft before confirming a window close", async () => {
    const current = thread("draft-thread", "Draft in progress", true);
    const events = installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: current.subject }));
    await screen.findByText(`Reading ${current.subject}`);
    const pendingClose = deferred<boolean>();
    closeDraft.mockReturnValueOnce(pendingClose.promise);

    act(() => events.emit({ type: "window-close-requested" }));

    expect(window.fluxmail.system.confirmWindowClose).not.toHaveBeenCalled();
    await act(async () => pendingClose.resolve(true));
    expect(window.fluxmail.system.confirmWindowClose).toHaveBeenCalledOnce();
    expect(window.fluxmail.system.cancelWindowClose).not.toHaveBeenCalled();
  });

  it("opens a conversation when its stale draft flag has no matching draft", async () => {
    const staleDraft = {
      ...thread("thread-1", "Reply conversation", true),
      folderRoles: ["inbox", "drafts"],
    };
    installApi(
      [staleDraft],
      vi.fn(async () => mailThread(staleDraft)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: staleDraft.subject });

    fireEvent.click(screen.getByRole("button", { name: staleDraft.subject }));

    await screen.findByText(`Reading ${staleDraft.subject}`);
    expect(screen.queryByRole("dialog", { name: "Compose" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
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

    expect(confirmDiscard).toHaveBeenCalledWith("Discard this unsent message?");
    expect(screen.getByText(`Reading ${first.subject}`)).toBeTruthy();

    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: second.subject }));
    expect(screen.getByText(`Reading ${second.subject}`)).toBeTruthy();
  });

  it("does not reapply a stale unread state after opening a conversation", async () => {
    const current = { ...thread("thread-1", "Unread conversation", false), unread: true };
    const events = installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    const initialLoads = vi.mocked(window.fluxmail.mail.listThreads).mock.calls.length;
    const staleReload = deferred<{
      items: ThreadSummary[];
      totalCount: number;
      syncing: boolean;
    }>();
    vi.mocked(window.fluxmail.mail.listThreads).mockImplementationOnce(() => staleReload.promise);

    act(() => events.emit({ type: "cache-changed" }));
    await waitFor(() =>
      expect(window.fluxmail.mail.listThreads).toHaveBeenCalledTimes(initialLoads + 1),
    );
    fireEvent.click(screen.getByRole("button", { name: current.subject }));
    expect(screen.getByTestId(`thread-${current.id}`).dataset.unread).toBe("false");

    await act(async () => {
      staleReload.resolve({ items: [current], totalCount: 1, syncing: false });
    });

    expect(screen.getByTestId(`thread-${current.id}`).dataset.unread).toBe("false");
  });

  it("does not restore an archived conversation from a stale mailbox response", async () => {
    const current = thread("thread-1", "Conversation to archive", false);
    const events = installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    const pendingArchive = deferred<{ undoToken?: string }>();
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    const initialLoads = vi.mocked(window.fluxmail.mail.listThreads).mock.calls.length;
    const staleReload = deferred<{
      items: ThreadSummary[];
      totalCount: number;
      syncing: boolean;
    }>();
    vi.mocked(window.fluxmail.mail.listThreads).mockImplementationOnce(() => staleReload.promise);
    vi.mocked(window.fluxmail.mail.modify).mockReturnValue(pendingArchive.promise);

    act(() => events.emit({ type: "cache-changed" }));
    await waitFor(() =>
      expect(window.fluxmail.mail.listThreads).toHaveBeenCalledTimes(initialLoads + 1),
    );
    fireEvent.click(screen.getByRole("button", { name: `Archive ${current.subject}` }));
    await screen.findByText("0 conversations");

    await act(async () => {
      staleReload.resolve({ items: [current], totalCount: 1, syncing: false });
    });

    expect(screen.getByText("0 conversations")).toBeTruthy();
    expect(screen.queryByRole("button", { name: current.subject })).toBeNull();
    await act(async () => {
      pendingArchive.resolve({});
    });
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

  it("does not let a completed mutation reload a mailbox left behind", async () => {
    const inbox = thread("inbox-thread", "Inbox conversation", false);
    const starred = {
      ...thread("starred-thread", "Starred conversation", false),
      starred: true,
    };
    let finishModify!: () => void;
    const pendingModify = new Promise<{ undoToken?: string }>((resolve) => {
      finishModify = () => resolve({});
    });
    installApi(
      [inbox],
      vi.fn(async ({ threadId }) => mailThread(threadId === inbox.id ? inbox : starred)),
    );
    vi.mocked(window.fluxmail.mail.listThreads).mockImplementation(async (input) => {
      const items = input.view === "starred" ? [starred] : [inbox];
      return { items, totalCount: items.length, syncing: false };
    });
    vi.mocked(window.fluxmail.mail.modify).mockReturnValue(pendingModify);
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: inbox.subject });

    fireEvent.click(screen.getByRole("button", { name: inbox.subject }));
    fireEvent.keyDown(window, { key: "e" });
    await screen.findByText("0 conversations");
    fireEvent.click(screen.getByRole("button", { name: "Starred" }));
    await screen.findByRole("button", { name: starred.subject });

    await act(async () => finishModify());

    await waitFor(() => expect(window.fluxmail.mail.modify).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: starred.subject })).toBeTruthy();
    expect(screen.queryByRole("button", { name: inbox.subject })).toBeNull();
  });

  it("keeps a newly opened thread selected when an archive finishes", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = { ...thread("thread-2", "Second conversation", false), unread: true };
    const third = thread("thread-3", "Third conversation", false);
    let finishArchive!: () => void;
    const pendingArchive = new Promise<{ undoToken?: string }>((resolve) => {
      finishArchive = () => resolve({});
    });
    installApi(
      [first, second, third],
      vi.fn(async ({ threadId }) =>
        mailThread([first, second, third].find((item) => item.id === threadId)!),
      ),
    );
    vi.mocked(window.fluxmail.mail.modify).mockReturnValue(pendingArchive);
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: first.subject });

    fireEvent.click(screen.getByRole("button", { name: first.subject }));
    fireEvent.keyDown(window, { key: "e" });
    await waitFor(() => expect(screen.queryByRole("button", { name: first.subject })).toBeNull());
    expect(screen.getByText(`Reading ${second.subject}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: third.subject }));
    expect(screen.getByText(`Reading ${third.subject}`)).toBeTruthy();

    await act(async () => finishArchive());

    await waitFor(() => expect(window.fluxmail.mail.listThreads).toHaveBeenCalledTimes(2));
    expect(screen.getByText(`Reading ${third.subject}`)).toBeTruthy();
    expect(window.fluxmail.mail.modify).toHaveBeenCalledTimes(1);
  });

  it("opens the next conversation after archiving the current one", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
      { threadsAfterModify: [second] },
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText(`Reading ${second.subject}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: first.subject })).toBeNull();
  });

  it("opens the previous conversation when archiving the last one", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
      { threadsAfterModify: [first] },
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: first.subject });
    fireEvent.click(screen.getByRole("button", { name: second.subject }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText(`Reading ${first.subject}`)).toBeTruthy();
  });

  it("leaves the reading pane empty when archive advancement is disabled", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
      { openNextAfterArchive: false, threadsAfterModify: [second] },
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText("No conversation")).toBeTruthy();
  });

  it("does not advance when archiving a different row", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
      { threadsAfterModify: [first] },
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));

    fireEvent.click(screen.getByRole("button", { name: `Archive ${second.subject}` }));

    expect(await screen.findByText(`Reading ${first.subject}`)).toBeTruthy();
  });

  it("does not advance after archiving multiple selected conversations", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    const third = thread("thread-3", "Third conversation", false);
    installApi(
      [first, second, third],
      vi.fn(async ({ threadId }) =>
        mailThread([first, second, third].find((item) => item.id === threadId)!),
      ),
      { threadsAfterModify: [third] },
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));
    fireEvent.click(screen.getByRole("button", { name: `Select ${first.subject}` }));
    fireEvent.click(screen.getByRole("button", { name: `Select ${second.subject}` }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText("No conversation")).toBeTruthy();
    expect(screen.queryByText(`Reading ${third.subject}`)).toBeNull();
  });

  it("restores the archived conversation without marking the next one read when archiving fails", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = { ...thread("thread-2", "Second conversation", false), unread: true };
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockImplementation(async ({ action }) => {
      if (action.type === "archive") throw new Error("Archive failed.");
      return {};
    });
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText(`Reading ${first.subject}`)).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Archive failed.");
    expect(window.fluxmail.mail.modify).toHaveBeenCalledTimes(1);
  });

  it("does not restore the archived conversation after the user navigates elsewhere", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = thread("thread-2", "Second conversation", false);
    const third = thread("thread-3", "Third conversation", false);
    let failArchive!: (error: Error) => void;
    const pendingArchive = new Promise<{ undoToken?: string }>((_resolve, reject) => {
      failArchive = reject;
    });
    installApi(
      [first, second, third],
      vi.fn(async ({ threadId }) =>
        mailThread([first, second, third].find((item) => item.id === threadId)!),
      ),
    );
    vi.mocked(window.fluxmail.mail.modify).mockReturnValueOnce(pendingArchive);
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));
    fireEvent.keyDown(window, { key: "e" });
    expect(screen.getByText(`Reading ${second.subject}`)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: third.subject }));

    await act(async () => failArchive(new Error("Archive failed.")));

    expect(screen.getByText(`Reading ${third.subject}`)).toBeTruthy();
  });

  it("marks an unread conversation read when opening it after archive", async () => {
    const first = thread("thread-1", "First conversation", false);
    const second = { ...thread("thread-2", "Second conversation", false), unread: true };
    installApi(
      [first, second],
      vi.fn(async ({ threadId }) => mailThread(threadId === first.id ? first : second)),
    );
    installMatchMedia();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: first.subject }));

    fireEvent.keyDown(window, { key: "e" });

    await waitFor(() =>
      expect(window.fluxmail.mail.modify).toHaveBeenCalledWith({
        targets: [{ accountId: second.accountId, threadId: second.id }],
        action: { type: "markRead" },
        undoable: false,
      }),
    );
    expect(screen.getByText(`Reading ${second.subject}`)).toBeTruthy();
  });

  it("does not advance when archiving in All Mail", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    fireEvent.click(screen.getByRole("button", { name: "All mail" }));
    fireEvent.click(await screen.findByRole("button", { name: current.subject }));

    fireEvent.keyDown(window, { key: "e" });

    expect(await screen.findByText(`Reading ${current.subject}`)).toBeTruthy();
  });

  it("keeps a thread opened in another mailbox selected when an archive finishes", async () => {
    const current = thread("thread-1", "Current conversation", false);
    let finishArchive!: () => void;
    const pendingArchive = new Promise<{ undoToken?: string }>((resolve) => {
      finishArchive = () => resolve({});
    });
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockReturnValue(pendingArchive);
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Archive ${current.subject}` }));
    await screen.findByText("0 conversations");
    fireEvent.click(screen.getByRole("button", { name: "All mail" }));
    fireEvent.click(await screen.findByRole("button", { name: current.subject }));
    expect(screen.getByText(`Reading ${current.subject}`)).toBeTruthy();

    await act(async () => finishArchive());

    expect(screen.getByText(`Reading ${current.subject}`)).toBeTruthy();
  });

  it("updates a thread opened in another mailbox when a star finishes", async () => {
    const current = thread("thread-1", "Current conversation", false);
    let finishStar!: () => void;
    const pendingStar = new Promise<{ undoToken?: string }>((resolve) => {
      finishStar = () => resolve({});
    });
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockReturnValue(pendingStar);
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    fireEvent.click(screen.getByRole("button", { name: "All mail" }));
    fireEvent.click(await screen.findByRole("button", { name: current.subject }));
    expect(screen.getByRole("button", { name: "Star conversation" })).toBeTruthy();

    await act(async () => finishStar());

    expect(screen.getByRole("button", { name: "Unstar conversation" })).toBeTruthy();
  });

  it("offers one-click undo after a conversation action", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockResolvedValue({ undoToken: "undo-1" });
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() =>
      expect(window.fluxmail.mail.undo).toHaveBeenCalledWith({ token: "undo-1" }),
    );
    expect(screen.getByText("Action undone")).toBeTruthy();
  });

  it("reruns an active provider search after undo", async () => {
    const current = thread("thread-1", "Current conversation", false);
    const api = installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockImplementation(async () => {
      api.setVisibleThreads([]);
      return { undoToken: "undo-1" };
    });
    vi.mocked(window.fluxmail.mail.undo).mockImplementation(async () => {
      api.setVisibleThreads([current]);
      return { undone: true };
    });
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.change(screen.getByRole("textbox", { name: "Search mail" }), {
      target: { value: "in:inbox" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run search" }));
    await waitFor(() => expect(window.fluxmail.mail.search).toHaveBeenCalled());
    await screen.findByRole("button", { name: `Archive ${current.subject}` });

    fireEvent.click(screen.getByRole("button", { name: `Archive ${current.subject}` }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    await screen.findByText("0 conversations");
    const searchesBeforeUndo = vi.mocked(window.fluxmail.mail.search).mock.calls.length;
    fireEvent.click(undo);

    await waitFor(() =>
      expect(window.fluxmail.mail.search).toHaveBeenCalledTimes(searchesBeforeUndo + 1),
    );
    expect(await screen.findByRole("button", { name: current.subject })).toBeTruthy();
  });

  it("clears undo when a permanent action supersedes the same conversation", async () => {
    const current = thread("draft-thread", "Draft in progress", true);
    installApi(
      [current],
      vi.fn(async () => draftThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify)
      .mockResolvedValueOnce({ undoToken: "undo-1" })
      .mockResolvedValueOnce({});
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    fireEvent.click(screen.getByRole("button", { name: "Drafts" }));
    await screen.findByRole("button", { name: `Star ${current.subject}` });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(screen.getByRole("button", { name: `Discard ${current.subject}` }));

    await waitFor(() => expect(window.fluxmail.mail.modify).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("runs the latest undo with Cmd+Z outside an editor", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockResolvedValue({ undoToken: "undo-1" });
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    await screen.findByRole("button", { name: "Undo" });
    fireEvent.keyDown(window, { key: "z", metaKey: true });

    await waitFor(() =>
      expect(window.fluxmail.mail.undo).toHaveBeenCalledWith({ token: "undo-1" }),
    );
  });

  it("does not treat Cmd+Shift+Z as undo", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify).mockResolvedValue({ undoToken: "undo-1" });
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    await screen.findByRole("button", { name: "Undo" });
    fireEvent.keyDown(window, { key: "z", metaKey: true, shiftKey: true });

    expect(window.fluxmail.mail.undo).not.toHaveBeenCalled();
  });

  it("clears undo when opening the same unread conversation marks it read", async () => {
    const current = { ...thread("thread-1", "Current conversation", false), unread: true };
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    vi.mocked(window.fluxmail.mail.modify)
      .mockResolvedValueOnce({ undoToken: "undo-1" })
      .mockResolvedValueOnce({});
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });

    fireEvent.click(screen.getByRole("button", { name: `Star ${current.subject}` }));
    await screen.findByRole("button", { name: "Undo" });
    fireEvent.click(screen.getByRole("button", { name: current.subject }));

    await waitFor(() => expect(window.fluxmail.mail.modify).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(window.fluxmail.mail.undo).not.toHaveBeenCalled();
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
    fireEvent.keyDown(conversation, { key: "c" });
    const composeAction = await screen.findByRole("button", { name: "Compose action" });
    fireEvent.keyDown(composeAction, { key: "#" });

    expect(window.fluxmail.mail.modify).not.toHaveBeenCalled();
  });

  it("opens each message action in the inline composer from its shortcut", async () => {
    const current = thread("thread-1", "Current conversation", false);
    installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    fireEvent.click(screen.getByRole("button", { name: current.subject }));

    fireEvent.keyDown(window, { key: "r" });
    expect(screen.getByText("Inline reply")).toBeTruthy();
    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByText("Inline replyAll")).toBeTruthy();
    fireEvent.keyDown(window, { key: "f" });
    expect(screen.getByText("Inline forward")).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Compose" })).toBeNull();
  });

  it("opens conversation find with Command+F and Control+F", async () => {
    const current = thread("thread-1", "Current conversation", false);
    const events = installApi(
      [current],
      vi.fn(async () => mailThread(current)),
    );
    installMatchMedia();
    render(<App />);
    await screen.findByRole("button", { name: current.subject });
    fireEvent.click(screen.getByRole("button", { name: current.subject }));

    expect(fireEvent.keyDown(window, { key: "f", metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: "f", ctrlKey: true })).toBe(false);

    expect(openFind).toHaveBeenCalledTimes(2);

    act(() => events.emit({ type: "find-in-conversation-requested" }));

    expect(openFind).toHaveBeenCalledTimes(3);
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
  options: {
    openNextAfterArchive?: boolean;
    threadsAfterModify?: ThreadSummary[];
  } = {},
): { emit(event: AppEvent): void; setVisibleThreads(threads: ThreadSummary[]): void } {
  const state: BootstrapState = {
    engine: {
      version: "0.3.0",
      storeFormat: 1,
      minimumSupportedFormat: 1,
      maximumSupportedFormat: 1,
    },
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
    preferences: {
      appearance: "light",
      dockBadge: true,
      openNextAfterArchive: options.openNextAfterArchive ?? true,
      blockRemoteImages: true,
      imageRelay: true,
    },
    license: {
      plan: "personal",
      maxMembers: 1,
      maxAccounts: 3,
      canUsePrivateImageRelay: false,
    },
  };
  let visibleThreads = threads;
  let eventListener: ((event: AppEvent) => void) | undefined;
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
          return {};
        }),
        undo: vi.fn(async () => ({ undone: true })),
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
      onEvent: vi.fn((callback: (event: AppEvent) => void) => {
        eventListener = callback;
        return () => {
          eventListener = undefined;
        };
      }),
    } as unknown as FluxmailDesktopApi,
  });
  return {
    emit: (event) => eventListener?.(event),
    setVisibleThreads: (nextThreads) => {
      visibleThreads = nextThreads;
    },
  };
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

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
