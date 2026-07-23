/** @vitest-environment jsdom */
import { createRef, StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReadingPane, type ReadingPaneHandle } from "../src/renderer/components/ReadingPane";
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

  it("opens and closes the conversation find bar through its imperative handle", async () => {
    const getThread = vi.fn(async () => detail("Searchable subject", "message-1"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const ref = createRef<ReadingPaneHandle>();
    render(
      <ReadingPane
        ref={ref}
        view="inbox"
        thread={summary()}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
      />,
    );
    await screen.findByText("Searchable subject");

    act(() => ref.current?.openFind());

    const input = screen.getByRole("textbox", { name: "Find in conversation" });
    expect(input.getAttribute("aria-keyshortcuts")).toBe("Meta+F Control+F");
    fireEvent.change(input, { target: { value: "missing" } });
    expect(screen.getByRole("status").textContent).toBe("No matches");

    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Find in conversation" })).toBeNull();
  });

  it("keeps collapsed messages searchable and restores their collapsed state", async () => {
    const getThread = vi.fn(async () => detail("Searchable subject", "message-1"));
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { mail: { getThread } } as unknown as FluxmailDesktopApi,
    });
    const ref = createRef<ReadingPaneHandle>();
    render(
      <ReadingPane
        ref={ref}
        view="inbox"
        thread={summary()}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onError={vi.fn()}
        onQuickReplyDirtyChange={vi.fn()}
      />,
    );
    await screen.findByText("Searchable subject");

    fireEvent.click(screen.getByRole("button", { name: "Collapse message" }));
    expect(screen.queryByText("Email body")).toBeNull();

    act(() => ref.current?.openFind());
    fireEvent.change(screen.getByRole("textbox", { name: "Find in conversation" }), {
      target: { value: "Email" },
    });

    expect(screen.getByText("Email body")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "Collapse message" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.keyDown(screen.getByRole("textbox", { name: "Find in conversation" }), {
      key: "Escape",
    });

    expect(screen.queryByText("Email body")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand message" })).toBeTruthy();
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

  it("restores a saved reply draft inline with its reply target", async () => {
    const thread = detail("Saved reply", "original-message");
    thread.messages.push({
      ...thread.messages[0]!,
      id: "draft-message",
      draftId: "draft-1",
      from: { email: "me@example.com" },
      to: [{ email: "sender@example.com" }],
      body: { html: "<p>Saved answer</p>", text: "Saved answer" },
      flags: { read: true, starred: false, draft: true },
    });
    const send = vi.fn(async () => ({ id: "sent-message", threadId: "thread-1" }));
    const onDraftFinished = vi.fn();
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread: vi.fn(async () => thread) },
        drafts: {
          save: vi.fn(async () => ({ draftId: "draft-1", messageId: "draft-message" })),
          delete: vi.fn(async () => undefined),
          send,
        },
        attachments: {
          prepare: vi.fn(async () => []),
          release: vi.fn(async () => undefined),
          pick: vi.fn(async () => []),
        },
        analytics: { trackFeature: vi.fn(async () => undefined) },
      } as unknown as FluxmailDesktopApi,
    });
    renderPane(summary({ draft: true, messageCount: 2 }), { onDraftFinished });

    expect(await screen.findByRole("region", { name: "Draft" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "New message" })).toBeNull();
    expect((screen.getByLabelText("Subject") as HTMLInputElement).value).toBe("Saved reply");
    expect(document.querySelector(".inline-draft-composer .tiptap")?.textContent).toBe(
      "Saved answer",
    );

    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          draftId: "draft-1",
          replyToMessageId: "original-message",
        }),
      ),
    );
    expect(onDraftFinished).toHaveBeenCalledOnce();
  });

  it("keeps an edited draft mounted when its refreshed summary date changes", async () => {
    const thread = detail("Saved reply", "original-message");
    thread.messages.push({
      ...thread.messages[0]!,
      id: "draft-message",
      draftId: "draft-1",
      to: [{ email: "sender@example.com" }],
      body: { html: "<p>Saved answer</p>", text: "Saved answer" },
      flags: { read: true, starred: false, draft: true },
    });
    const getThread = vi.fn(async () => thread);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread },
        drafts: {
          save: vi.fn(async () => ({ draftId: "draft-1", messageId: "draft-message" })),
          delete: vi.fn(async () => undefined),
          send: vi.fn(async () => ({ id: "sent-message", threadId: "thread-1" })),
        },
        attachments: {
          prepare: vi.fn(async () => []),
          release: vi.fn(async () => undefined),
          pick: vi.fn(async () => []),
        },
        analytics: { trackFeature: vi.fn(async () => undefined) },
      } as unknown as FluxmailDesktopApi,
    });
    const onModify = vi.fn(async () => undefined);
    const onError = vi.fn();
    const onQuickReplyDirtyChange = vi.fn();
    const rendered = render(
      <ReadingPane
        view="inbox"
        thread={summary({ draft: true, messageCount: 2 })}
        labels={[]}
        allowPermanentDelete={false}
        onModify={onModify}
        onError={onError}
        onQuickReplyDirtyChange={onQuickReplyDirtyChange}
      />,
    );
    const subject = (await screen.findByLabelText("Subject")) as HTMLInputElement;
    fireEvent.change(subject, { target: { value: "Edited subject" } });

    rendered.rerender(
      <ReadingPane
        view="inbox"
        thread={summary({
          draft: true,
          messageCount: 2,
          date: "2026-07-16T13:00:00Z",
        })}
        labels={[]}
        allowPermanentDelete={false}
        onModify={onModify}
        onError={onError}
        onQuickReplyDirtyChange={onQuickReplyDirtyChange}
      />,
    );

    expect(screen.getByLabelText("Subject")).toBe(subject);
    expect(subject.value).toBe("Edited subject");
    expect(getThread).toHaveBeenCalledTimes(2);
  });

  it("keeps the inline draft open when coordinated navigation cannot save it", async () => {
    const thread = detail("Saved reply", "original-message");
    thread.messages.push({
      ...thread.messages[0]!,
      id: "draft-message",
      draftId: "draft-1",
      to: [{ email: "sender@example.com" }],
      body: { text: "Saved answer" },
      flags: { read: true, starred: false, draft: true },
    });
    const save = vi.fn(async () => {
      throw new Error("Save failed");
    });
    const onError = vi.fn();
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: {
        mail: { getThread: vi.fn(async () => thread) },
        drafts: {
          save,
          delete: vi.fn(async () => undefined),
          send: vi.fn(async () => ({ id: "sent-message", threadId: "thread-1" })),
        },
        attachments: {
          prepare: vi.fn(async () => []),
          release: vi.fn(async () => undefined),
          pick: vi.fn(async () => []),
        },
        analytics: { trackFeature: vi.fn(async () => undefined) },
      } as unknown as FluxmailDesktopApi,
    });
    const ref = createRef<ReadingPaneHandle>();
    render(
      <ReadingPane
        ref={ref}
        view="inbox"
        thread={summary({ draft: true, messageCount: 2 })}
        labels={[]}
        allowPermanentDelete={false}
        onModify={vi.fn(async () => undefined)}
        onError={onError}
        onQuickReplyDirtyChange={vi.fn()}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Subject"), {
      target: { value: "Unsaved edit" },
    });

    let closed = true;
    await act(async () => {
      closed = (await ref.current?.closeDraft()) ?? true;
    });

    expect(closed).toBe(false);
    expect(screen.getByRole("region", { name: "Draft" })).toBeTruthy();
    expect(onError).toHaveBeenCalledWith("Save failed");
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
    onDraftFinished?: () => void;
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
      onDraftFinished={options.onDraftFinished}
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
