/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingPane } from "../src/renderer/components/ReadingPane";
import type { ComposeSeed } from "../src/renderer/components/ComposeDialog";
import type {
  FluxmailDesktopApi,
  MailThread,
  ModifyActionInput,
  ThreadSummary,
} from "../src/shared/contracts";

vi.mock("../src/renderer/components/EmailHtml", () => ({
  EmailHtml: () => <div>Email body</div>,
}));

globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe("ReadingPane", () => {
  it("loads a new selection while the previous conversation is still loading", async () => {
    let resolveFirst!: (thread: MailThread) => void;
    let resolveSecond!: (thread: MailThread) => void;
    const getThread = vi.fn(({ threadId }: { threadId: string }) => {
      return new Promise<MailThread>((resolve) => {
        if (threadId === "thread-1") resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    });
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const rendered = renderPane(summary());
    expect(rendered.container.querySelector(".spin")).toBeTruthy();

    rendered.rerender(
      <ReadingPane
        view="inbox"
        thread={summary({ id: "thread-2", subject: "Second subject" })}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onCompose={vi.fn()}
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
      />,
    );

    await waitFor(() =>
      expect(getThread).toHaveBeenLastCalledWith({
        accountId: "account-1",
        threadId: "thread-2",
      }),
    );
    await act(async () => resolveFirst(detail("First loaded subject", "message-1")));
    expect(screen.queryByText("First loaded subject")).toBeNull();
    expect(rendered.container.querySelector(".spin")).toBeTruthy();

    await act(async () => resolveSecond(detail("Second loaded subject", "message-2")));
    await screen.findByText("Second loaded subject");
    expect(getThread).toHaveBeenCalledTimes(2);
  });

  it("reloads an open conversation when its message count changes", async () => {
    const getThread = vi
      .fn<() => Promise<MailThread>>()
      .mockResolvedValueOnce(detail("First subject", "message-1"))
      .mockResolvedValueOnce(detail("Updated subject", "message-2"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const initial = summary({ messageCount: 1, date: "2026-07-16T12:00:00Z" });
    const { rerender } = renderPane(initial);
    await screen.findByText("First subject");

    rerender(
      <ReadingPane
        view="inbox"
        thread={summary({ messageCount: 2, date: "2026-07-16T13:00:00Z" })}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onCompose={vi.fn()}
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
      />,
    );

    await screen.findByText("Updated subject");
    await waitFor(() => expect(getThread).toHaveBeenCalledTimes(2));
  });

  it("offers restore without permanent delete for Gmail Trash", async () => {
    const getThread = vi.fn(async () => detail("Deleted subject", "message-1"));
    const onModify = vi.fn<(action: ModifyActionInput) => Promise<void>>(async () => undefined);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary({ folderRoles: ["trash"] }), { view: "trash", onModify });
    await screen.findByText("Deleted subject");

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));

    expect(onModify).toHaveBeenNthCalledWith(1, { type: "untrash" });
    expect(screen.queryByRole("button", { name: "Delete permanently" })).toBeNull();
  });

  it("offers permanent delete when the account grants full Gmail access", async () => {
    const getThread = vi.fn(async () => detail("Deleted subject", "message-1"));
    const onModify = vi.fn<(action: ModifyActionInput) => Promise<void>>(async () => undefined);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary({ folderRoles: ["trash"] }), {
      view: "trash",
      onModify,
      allowPermanentDelete: true,
    });
    await screen.findByText("Deleted subject");

    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    expect(onModify).toHaveBeenCalledWith({ type: "delete" });
  });

  it("shows original attachments in the forward composer", async () => {
    const message = detail("Forward subject", "message-1").messages[0]!;
    message.attachments = [
      {
        id: "attachment-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
      },
    ];
    const getThread = vi.fn(async () => ({
      ...detail("Forward subject", "message-1"),
      messages: [message],
    }));
    const prepared = {
      token: "prepared-attachment",
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 128,
    };
    const prepare = vi.fn(async () => [prepared]);
    const onCompose = vi.fn();
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread },
        attachments: { prepare, release: vi.fn(async () => undefined) },
      } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary(), { onCompose });
    await screen.findByText("Forward subject");

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    await waitFor(() =>
      expect(onCompose).toHaveBeenCalledWith(
        expect.objectContaining({ initialAttachments: [prepared] }),
      ),
    );
    expect(prepare).toHaveBeenCalledWith({
      accountId: "account-1",
      messageId: "message-1",
      attachments: message.attachments,
    });
  });

  it("closes the quick-reply editor after its contents are discarded", async () => {
    const getThread = vi.fn(async () => detail("Reply subject", "message-1"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const rendered = renderPane(summary(), { quickReplyDiscardVersion: 0 });
    await screen.findByText("Reply subject");
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Write a reply")).toBeTruthy();

    rendered.rerender(
      <ReadingPane
        view="inbox"
        thread={summary()}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onCompose={vi.fn()}
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
        quickReplyDiscardVersion={1}
      />,
    );

    expect(screen.queryByText("Write a reply")).toBeNull();
  });
});

function renderPane(
  thread: ThreadSummary,
  options: {
    view?: "inbox" | "trash";
    onModify?: (action: ModifyActionInput) => Promise<void>;
    onCompose?: (seed: ComposeSeed) => void;
    quickReplyDiscardVersion?: number;
    allowPermanentDelete?: boolean;
  } = {},
) {
  return render(
    <ReadingPane
      view={options.view ?? "inbox"}
      thread={thread}
      labels={[]}
      allowPermanentDelete={options.allowPermanentDelete ?? false}
      onModify={options.onModify ?? vi.fn(async () => undefined)}
      onCompose={options.onCompose ?? vi.fn()}
      onError={vi.fn()}
      onQuickReplyDirtyChange={vi.fn()}
      quickReplyDiscardVersion={options.quickReplyDiscardVersion}
    />,
  );
}

function summary(overrides: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id: "thread-1",
    accountId: "account-1",
    accountEmail: "me@example.com",
    subject: "First subject",
    senderName: "Sender",
    senderEmail: "sender@example.com",
    snippet: "Message",
    date: "2026-07-16T12:00:00Z",
    unread: false,
    starred: false,
    draft: false,
    hasAttachments: false,
    messageCount: 1,
    labels: [],
    folderRoles: ["inbox"],
    ...overrides,
  };
}

function detail(subject: string, messageId: string): MailThread {
  return {
    id: "thread-1",
    accountId: "account-1",
    accountEmail: "me@example.com",
    subject,
    messages: [
      {
        id: messageId,
        threadId: "thread-1",
        accountId: "account-1",
        from: { email: "sender@example.com" },
        to: [{ email: "me@example.com" }],
        subject,
        date: "2026-07-16T12:00:00Z",
        flags: { read: true, starred: false, draft: false },
      },
    ],
  };
}
