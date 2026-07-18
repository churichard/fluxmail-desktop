import { useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  Ellipsis,
  Forward,
  LoaderCircle,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Reply,
  ReplyAll,
  Star,
  Tag,
  Trash2,
  ShieldAlert,
  X,
  Undo2,
} from "lucide-react";
import type {
  MailMessage,
  MailThread,
  MailboxView,
  ModifyActionInput,
  ThreadSummary,
} from "../../shared/contracts";
import type { ComposeSeed } from "./ComposeDialog";
import { KEYBOARD_SHORTCUTS } from "../shortcuts";
import { EmailHtml } from "./EmailHtml";
import { MailEditorContent, MailEditorToolbar, useMailEditor } from "./MailEditor";
import { IconButton, MenuButton } from "./Controls";
import { OverlayScrollbar } from "./OverlayScrollbar";
import {
  mailboxDeleteAction,
  mailboxDeleteLabel,
  mailboxMoveAction,
  mailboxMoveLabel,
} from "../mail-actions";

interface Props {
  view: MailboxView;
  thread?: ThreadSummary;
  labels: string[];
  allowPermanentDelete: boolean;
  onModify(action: ModifyActionInput): Promise<void>;
  onCompose(seed: ComposeSeed): void;
  onError(message: string): void;
  onQuickReplyDirtyChange(dirty: boolean): void;
  quickReplyDiscardVersion?: number;
}

export function ReadingPane({
  view,
  thread,
  labels,
  allowPermanentDelete,
  onModify,
  onCompose,
  onError,
  onQuickReplyDirtyChange,
  quickReplyDiscardVersion,
}: Props) {
  const [detail, setDetail] = useState<MailThread>();
  const [loading, setLoading] = useState(false);
  const [replying, setReplying] = useState<"reply" | "replyAll">();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const forwardRequest = useRef(0);
  const threadIdentity = thread ? `${thread.accountId}:${thread.id}` : "";
  const threadIdentityRef = useRef(threadIdentity);
  threadIdentityRef.current = threadIdentity;
  const handleScrollerRef = useCallback((element: HTMLDivElement | null) => {
    setScroller(element);
  }, []);

  useEffect(() => {
    setReplying(undefined);
  }, [quickReplyDiscardVersion]);

  const openForward = useCallback(
    async (summary: ThreadSummary, message: MailMessage) => {
      const request = ++forwardRequest.current;
      const identity = `${summary.accountId}:${summary.id}`;
      try {
        const initialAttachments = message.attachments?.length
          ? await window.fluxmail.attachments.prepare({
              accountId: summary.accountId,
              messageId: message.id,
              attachments: message.attachments,
            })
          : [];
        if (request !== forwardRequest.current || identity !== threadIdentityRef.current) {
          if (initialAttachments.length)
            void window.fluxmail.attachments
              .release(initialAttachments.map((attachment) => attachment.token))
              .catch(() => undefined);
          return;
        }
        onCompose(forwardSeed(summary, message, initialAttachments));
      } catch {
        if (request === forwardRequest.current && identity === threadIdentityRef.current) {
          onError("Could not add the original attachments. You can still forward without them.");
          onCompose(forwardSeed(summary, message, []));
        }
      }
    },
    [onCompose, onError],
  );

  useEffect(() => {
    setDetail(undefined);
    setReplying(undefined);
    if (!thread) return;
    let canceled = false;
    setLoading(true);
    void window.fluxmail.mail
      .getThread({ accountId: thread.accountId, threadId: thread.id })
      .then((result) => {
        if (!canceled) setDetail(result);
      })
      .catch((error) =>
        onError(
          error instanceof Error ? error.message : "Fluxmail could not open this conversation.",
        ),
      )
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [onError, thread?.accountId, thread?.date, thread?.id, thread?.messageCount]);

  if (!thread)
    return (
      <section className="reading-pane empty-reading">
        <div className="reading-placeholder">
          <h2>Select a conversation</h2>
          <p>Your message will open here.</p>
        </div>
      </section>
    );
  if (loading || !detail)
    return (
      <section className="reading-pane empty-reading">
        <LoaderCircle className="spin" size={22} />
        <p>Opening conversation...</p>
      </section>
    );
  const lastMessage = detail.messages.at(-1);
  const deleteAction = mailboxDeleteAction(view, allowPermanentDelete);

  return (
    <section className="reading-pane">
      <header className="reading-toolbar">
        <div className="toolbar-group">
          <IconButton
            label={mailboxMoveLabel(view)}
            shortcut={KEYBOARD_SHORTCUTS.archive}
            onClick={() => void onModify(mailboxMoveAction(view))}
          >
            {view === "trash" ? <Undo2 size={17} /> : <Archive size={17} />}
          </IconButton>
          {deleteAction ? (
            <IconButton
              label={mailboxDeleteLabel(view)}
              shortcut={KEYBOARD_SHORTCUTS.trash}
              onClick={() => void onModify(deleteAction)}
            >
              <Trash2 size={17} />
            </IconButton>
          ) : null}
          <IconButton
            label="Mark unread"
            shortcut={KEYBOARD_SHORTCUTS.toggleRead}
            onClick={() => void onModify({ type: "markUnread" })}
          >
            <MailOpen size={17} />
          </IconButton>
          {labels.length ? (
            <MenuButton
              label="Apply label"
              options={labels.map((label) => ({
                id: label,
                label,
                onSelect: () => void onModify({ type: "addLabels", labels: [label] }),
              }))}
            >
              <Tag size={16} />
            </MenuButton>
          ) : null}
          <MenuButton
            label="More actions"
            options={[
              {
                id: "spam",
                label: "Mark as spam",
                icon: <ShieldAlert size={15} />,
                onSelect: () => void onModify({ type: "move", folder: "spam" }),
              },
            ]}
          >
            <MoreHorizontal size={17} />
          </MenuButton>
        </div>
        <IconButton
          label={thread.starred ? "Unstar" : "Star"}
          shortcut={KEYBOARD_SHORTCUTS.star}
          onClick={() => void onModify({ type: thread.starred ? "unstar" : "star" })}
        >
          <Star size={17} fill={thread.starred ? "currentColor" : "none"} />
        </IconButton>
      </header>
      <div className="conversation-scroll-shell">
        <div ref={handleScrollerRef} className="conversation-scroll">
          <div className="conversation-title">
            <h1>{detail.subject || "(no subject)"}</h1>
            {thread.labels.filter((label) => labels.includes(label)).length ? (
              <div className="thread-labels">
                {thread.labels
                  .filter((label) => labels.includes(label))
                  .map((label) => (
                    <button
                      key={label}
                      title={`Remove ${label}`}
                      onClick={() => void onModify({ type: "removeLabels", labels: [label] })}
                    >
                      {label}
                      <X size={11} />
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
          {detail.messages
            .filter((message) => !message.flags.draft)
            .map((message) => (
              <MessageCard key={message.id} message={message} onError={onError} />
            ))}
          {lastMessage ? (
            <div className="reply-actions">
              <button onClick={() => setReplying("reply")}>
                <Reply size={16} />
                Reply
              </button>
              <button onClick={() => setReplying("replyAll")}>
                <ReplyAll size={16} />
                Reply all
              </button>
              <button onClick={() => void openForward(thread, lastMessage)}>
                <Forward size={16} />
                Forward
              </button>
            </div>
          ) : null}
          {replying && lastMessage ? (
            <QuickReply
              accountId={thread.accountId}
              message={lastMessage}
              replyAll={replying === "replyAll"}
              onCancel={() => setReplying(undefined)}
              onSent={() => setReplying(undefined)}
              onError={onError}
              onDirtyChange={onQuickReplyDirtyChange}
            />
          ) : null}
        </div>
        <OverlayScrollbar scroller={scroller} fadeClass="reading-fade" />
      </div>
    </section>
  );
}

function MessageCard({
  message,
  onError,
}: {
  message: MailMessage;
  onError(message: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  const senderName = message.from?.name || message.from?.email || "Unknown sender";
  const senderEmail =
    message.from?.email && message.from.email !== senderName ? message.from.email : undefined;
  return (
    <article className="message-card">
      <button className="message-header" onClick={() => setExpanded((value) => !value)}>
        <span className="sender-avatar">{senderName.slice(0, 1).toUpperCase()}</span>
        <span className="message-sender">
          <span
            className="message-from"
            title={senderEmail ? `${senderName} <${senderEmail}>` : senderName}
          >
            <strong>{senderName}</strong>
            {senderEmail ? <span className="message-from-email">&lt;{senderEmail}&gt;</span> : null}
          </span>
          <small>to {formatRecipients(message.to)}</small>
        </span>
        <time>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(message.date))}
        </time>
      </button>
      {expanded ? (
        <div className="message-body">
          <EmailHtml message={message} onError={onError} />
          {message.attachments?.length ? (
            <div className="attachment-list">
              {message.attachments
                .filter((attachment) => attachment.disposition !== "inline")
                .map((attachment) => (
                  <button
                    key={attachment.id}
                    onClick={() =>
                      void window.fluxmail.attachments
                        .save({
                          accountId: message.accountId,
                          messageId: message.id,
                          attachment,
                        })
                        .catch((error) =>
                          onError(
                            error instanceof Error
                              ? error.message
                              : "Could not save the attachment.",
                          ),
                        )
                    }
                  >
                    <Paperclip size={14} />
                    <span>{attachment.filename}</span>
                    <small>{formatBytes(attachment.sizeBytes)}</small>
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function QuickReply({
  accountId,
  message,
  replyAll,
  onCancel,
  onSent,
  onError,
  onDirtyChange,
}: {
  accountId: string;
  message: MailMessage;
  replyAll: boolean;
  onCancel(): void;
  onSent(): void;
  onError(message: string): void;
  onDirtyChange(dirty: boolean): void;
}) {
  const [html, setHtml] = useState("<p></p>");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const editor = useMailEditor({
    autoFocus: true,
    onChange: (value) => {
      setHtml(value.html);
      setText(value.text);
      onDirtyChange(Boolean(value.text.trim()));
    },
  });
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await window.fluxmail.drafts.send({
        accountId,
        to: [],
        subject: message.subject.toLowerCase().startsWith("re:")
          ? message.subject
          : `Re: ${message.subject}`,
        text,
        html,
        replyToMessageId: message.id,
        replyAll,
      });
      onSent();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Fluxmail could not send the reply.");
    } finally {
      setSending(false);
    }
  };
  return (
    <div
      className="quick-reply"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void send();
        }
      }}
    >
      <MailEditorContent
        editor={editor}
        empty={!text.trim()}
        placeholder={replyAll ? "Reply to everyone" : "Write a reply"}
      />
      <div className="quoted-reply">
        <IconButton
          label={quoteOpen ? "Hide quoted message" : "Show quoted message"}
          className="quoted-reply-toggle"
          tooltipSide="top"
          onClick={() => setQuoteOpen((value) => !value)}
        >
          <Ellipsis size={18} />
        </IconButton>
        {quoteOpen ? (
          <div className="quoted-reply-content">
            <div className="quoted-reply-meta">
              {message.from?.name || message.from?.email || "Previous message"}
            </div>
            <EmailHtml message={message} onError={onError} />
          </div>
        ) : null}
      </div>
      <div className="quick-reply-footer">
        <MailEditorToolbar editor={editor} />
        <div className="quick-reply-actions">
          <button className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={sending || !text.trim()}
            onClick={() => void send()}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatRecipients(recipients: Array<{ name?: string; email: string }>): string {
  return recipients.map((recipient) => recipient.name || recipient.email).join(", ") || "me";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function forwardSeed(
  thread: ThreadSummary,
  message: MailMessage,
  initialAttachments: ComposeSeed["initialAttachments"],
): ComposeSeed {
  return {
    accountId: thread.accountId,
    subject: thread.subject.toLowerCase().startsWith("fwd:")
      ? thread.subject
      : `Fwd: ${thread.subject}`,
    forwardMessageId: message.id,
    threadId: thread.id,
    initialAttachments,
  };
}
