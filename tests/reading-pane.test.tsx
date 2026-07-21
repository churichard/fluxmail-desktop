/** @vitest-environment jsdom */
import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingPane } from "../src/renderer/components/ReadingPane";
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ReadingPane", () => {
  it("announces when a conversation is opening", () => {
    const getThread = vi.fn(() => new Promise<MailThread>(() => undefined));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });

    renderPane(summary());

    expect(screen.getByRole("status").textContent).toBe("Opening conversation...");
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

  it("hides Reply all when it would have the same recipients as Reply", async () => {
    const getThread = vi.fn(async () => detail("Direct message", "message-1"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary());

    await screen.findByText("Direct message");

    expect(screen.queryByRole("button", { name: "Reply all" })).toBeNull();
  });

  it("offers Reply all when the message has another recipient", async () => {
    const thread = detail("Group message", "message-1");
    thread.messages[0]!.to.push({ email: "teammate@example.com" });
    const getThread = vi.fn(async () => thread);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary());

    await screen.findByText("Group message");
    fireEvent.click(screen.getByRole("button", { name: "Reply all" }));

    expect(screen.getByText("Reply to everyone")).toBeTruthy();
  });

  it("shows the inline forward composer with the original attachments", async () => {
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
    const release = vi.fn(async () => undefined);
    const forward = vi.fn(async () => undefined);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread, forward },
        attachments: {
          prepare,
          release,
          pick: vi.fn(async () => []),
        },
      } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary(), { strict: true });
    await screen.findByText("Forward subject");

    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(await screen.findByRole("textbox", { name: "To" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove report.pdf" })).toBeTruthy();
    expect(prepare).toHaveBeenCalledWith({
      accountId: "account-1",
      messageId: "message-1",
      attachments: message.attachments,
    });
    expect(release).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("textbox", { name: "To" }), {
      target: { value: "friend@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(forward).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { accountId: "account-1", threadId: "thread-1" },
          messageId: "message-1",
          to: [{ email: "friend@example.com" }],
          attachments: [prepared],
          includeAttachments: false,
        }),
      ),
    );
    expect(release).toHaveBeenCalledWith([prepared.token]);
  });

  it("confirms before replacing a dirty inline composer", async () => {
    const getThread = vi.fn(async () => detail("Reply subject", "message-1"));
    const attachment = {
      token: "reply-attachment",
      filename: "draft.txt",
      mimeType: "text/plain",
      sizeBytes: 32,
    };
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread },
        attachments: {
          pick: vi.fn(async () => [attachment]),
          release: vi.fn(async () => undefined),
        },
      } as unknown as FluxmailDesktopApi,
    });
    const confirmDiscard = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPane(summary());
    await screen.findByText("Reply subject");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach files" }));
    await screen.findByRole("button", { name: "Remove draft.txt" });
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));

    expect(confirmDiscard).toHaveBeenCalledWith("Discard this unsent message?");
    expect(screen.getByRole("button", { name: "Remove draft.txt" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "To" })).toBeNull();

    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    const to = await screen.findByRole("textbox", { name: "To" });
    fireEvent.change(to, { target: { value: "friend@example.com" } });
    confirmDiscard.mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect((screen.getByRole("textbox", { name: "To" }) as HTMLInputElement).value).toBe(
      "friend@example.com",
    );

    confirmDiscard.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    expect(screen.getByText("Write a reply")).toBeTruthy();
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
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
        quickReplyDiscardVersion={1}
      />,
    );

    expect(screen.queryByText("Write a reply")).toBeNull();
  });

  it("shows the outbound citation and quoted body when expanding a quick reply", async () => {
    const getThread = vi.fn(async () => detail("Reply subject", "message-1"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const { container } = renderPane(summary());
    await screen.findByText("Reply subject");

    fireEvent.click(screen.getByRole("button", { name: "Reply" }));
    fireEvent.click(screen.getByRole("button", { name: "Show quoted message" }));

    expect(screen.getByText(/^On .+ sender@example\.com wrote:$/)).toBeTruthy();
    expect(container.querySelector(".quick-reply .quoted-reply-body")?.textContent).toBe(
      "Email body",
    );
  });
});

function renderPane(
  thread: ThreadSummary,
  options: {
    view?: "inbox" | "trash";
    onModify?: (action: ModifyActionInput) => Promise<void>;
    quickReplyDiscardVersion?: number;
    allowPermanentDelete?: boolean;
    strict?: boolean;
  } = {},
) {
  const pane = (
    <ReadingPane
      view={options.view ?? "inbox"}
      thread={thread}
      labels={[]}
      allowPermanentDelete={options.allowPermanentDelete ?? false}
      onModify={options.onModify ?? vi.fn(async () => undefined)}
      onError={vi.fn()}
      onQuickReplyDirtyChange={vi.fn()}
      quickReplyDiscardVersion={options.quickReplyDiscardVersion}
    />
  );
  return render(options.strict ? <StrictMode>{pane}</StrictMode> : pane);
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
