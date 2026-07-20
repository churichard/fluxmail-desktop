import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
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
  ComposeAttachment,
  ThreadSummary,
} from "../../shared/contracts";
import { parseAddressField } from "./ComposeDialog";
import { KEYBOARD_SHORTCUTS } from "../shortcuts";
import { EmailHtml } from "./EmailHtml";
import { TrackingPixelIndicator } from "./TrackingPixelIndicator";
import { MailEditorContent, MailEditorToolbar, useMailEditor } from "./MailEditor";
import { IconButton, MenuButton } from "./Controls";
import { OverlayScrollbar } from "./OverlayScrollbar";
import {
  mailboxDeleteAction,
  mailboxDeleteLabel,
  mailboxMoveAction,
  mailboxMoveLabel,
} from "../mail-actions";
import type { TrackingPixelDetail } from "../email/tracking-pixels";
import { quotedReplyCitation } from "../../shared/quoted-reply";

interface Props {
  view: MailboxView;
  thread?: ThreadSummary;
  labels: string[];
  allowPermanentDelete: boolean;
  blockRemoteImages?: boolean;
  imageRelay?: boolean;
  imageRelayAvailable?: boolean;
  onModify(action: ModifyActionInput): Promise<void>;
  onError(message: string): void;
  onQuickReplyDirtyChange(dirty: boolean): void;
  quickReplyDiscardVersion?: number;
}

export type InlineComposerMode = "reply" | "replyAll" | "forward";

export interface ReadingPaneHandle {
  openComposer(mode: InlineComposerMode): void;
}

interface InlineComposerState {
  mode: InlineComposerMode;
  initialAttachments: ComposeAttachment[];
}

export const ReadingPane = forwardRef<ReadingPaneHandle, Props>(function ReadingPane(
  {
    view,
    thread,
    labels,
    allowPermanentDelete,
    blockRemoteImages = true,
    imageRelay = true,
    imageRelayAvailable = true,
    onModify,
    onError,
    onQuickReplyDirtyChange,
    quickReplyDiscardVersion,
  },
  ref,
) {
  const [loadedThread, setLoadedThread] = useState<{
    key: string;
    detail: MailThread;
  }>();
  const [composer, setComposer] = useState<InlineComposerState>();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const forwardRequest = useRef(0);
  const composerRef = useRef<InlineComposerState | undefined>(undefined);
  const composerDirty = useRef(false);
  composerRef.current = composer;
  const threadIdentity = thread ? `${thread.accountId}:${thread.id}` : "";
  const threadLoadKey = thread ? `${threadIdentity}:${thread.date}:${thread.messageCount}` : "";
  const threadIdentityRef = useRef(threadIdentity);
  threadIdentityRef.current = threadIdentity;
  const detail = loadedThread?.key === threadLoadKey ? loadedThread.detail : undefined;
  const handleScrollerRef = useCallback((element: HTMLDivElement | null) => {
    setScroller(element);
  }, []);

  useEffect(() => {
    composerDirty.current = false;
    setComposer(undefined);
  }, [quickReplyDiscardVersion]);

  const canReplaceComposer = useCallback((mode: InlineComposerMode) => {
    const current = composerRef.current;
    if (!current) return true;
    if (current.mode === mode) return false;
    if (composerDirty.current && !window.confirm("Discard this unsent message?")) return false;
    composerDirty.current = false;
    setComposer(undefined);
    return true;
  }, []);

  const closeComposer = useCallback(() => {
    composerDirty.current = false;
    setComposer(undefined);
  }, []);

  const handleComposerDirtyChange = useCallback(
    (dirty: boolean) => {
      composerDirty.current = dirty;
      onQuickReplyDirtyChange(dirty);
    },
    [onQuickReplyDirtyChange],
  );

  const openComposer = useCallback(
    async (mode: InlineComposerMode) => {
      const message = detail?.messages.at(-1);
      if (!thread || !message) return;
      if (mode === "replyAll" && !shouldOfferReplyAll(thread.accountEmail, message)) return;
      if (!canReplaceComposer(mode)) return;
      if (mode !== "forward") {
        forwardRequest.current += 1;
        setComposer({ mode, initialAttachments: [] });
        return;
      }
      const request = ++forwardRequest.current;
      const identity = `${thread.accountId}:${thread.id}`;
      try {
        const initialAttachments = message.attachments?.length
          ? await window.fluxmail.attachments.prepare({
              accountId: thread.accountId,
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
        setComposer({ mode, initialAttachments });
      } catch {
        if (request === forwardRequest.current && identity === threadIdentityRef.current) {
          onError("Could not add the original attachments. You can still forward without them.");
          setComposer({ mode, initialAttachments: [] });
        }
      }
    },
    [canReplaceComposer, detail, onError, thread],
  );

  useImperativeHandle(ref, () => ({ openComposer: (mode) => void openComposer(mode) }), [
    openComposer,
  ]);

  useEffect(() => {
    composerDirty.current = false;
    setComposer(undefined);
    if (!thread) return;
    let canceled = false;
    void window.fluxmail.mail
      .getThread({ accountId: thread.accountId, threadId: thread.id })
      .then((result) => {
        if (!canceled) setLoadedThread({ key: threadLoadKey, detail: result });
      })
      .catch((error) => {
        if (!canceled)
          onError(
            error instanceof Error ? error.message : "Fluxmail could not open this conversation.",
          );
      });
    return () => {
      canceled = true;
    };
  }, [onError, thread?.accountId, thread?.id, threadLoadKey]);

  if (!thread)
    return (
      <section className="reading-pane empty-reading">
        <div className="reading-placeholder">
          <h2>Select a conversation</h2>
          <p>Your message will open here.</p>
        </div>
      </section>
    );
  if (!detail)
    return (
      <section className="reading-pane empty-reading">
        <LoaderCircle className="spin" size={22} />
      </section>
    );
  const lastMessage = detail.messages.at(-1);
  const replyAllAvailable = Boolean(
    lastMessage && shouldOfferReplyAll(detail.accountEmail, lastMessage),
  );
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
              <MessageCard
                key={message.id}
                message={message}
                blockRemoteImages={blockRemoteImages}
                imageRelay={imageRelay}
                imageRelayAvailable={imageRelayAvailable}
                onError={onError}
              />
            ))}
          {lastMessage ? (
            <div className="reply-actions">
              <button
                aria-keyshortcuts={KEYBOARD_SHORTCUTS.reply.keys}
                onClick={() => void openComposer("reply")}
              >
                <Reply size={16} />
                Reply
              </button>
              {replyAllAvailable ? (
                <button
                  aria-keyshortcuts={KEYBOARD_SHORTCUTS.replyAll.keys}
                  onClick={() => void openComposer("replyAll")}
                >
                  <ReplyAll size={16} />
                  Reply all
                </button>
              ) : null}
              <button
                aria-keyshortcuts={KEYBOARD_SHORTCUTS.forward.keys}
                onClick={() => void openComposer("forward")}
              >
                <Forward size={16} />
                Forward
              </button>
            </div>
          ) : null}
          {composer && lastMessage ? (
            <InlineComposer
              key={composer.mode}
              accountId={thread.accountId}
              threadId={thread.id}
              message={lastMessage}
              mode={composer.mode}
              initialAttachments={composer.initialAttachments}
              imageRelay={imageRelay}
              imageRelayAvailable={imageRelayAvailable}
              onCancel={closeComposer}
              onSent={closeComposer}
              onError={onError}
              onDirtyChange={handleComposerDirtyChange}
              blockRemoteImages={blockRemoteImages}
            />
          ) : null}
        </div>
        <OverlayScrollbar scroller={scroller} fadeClass="reading-fade" />
      </div>
    </section>
  );
});

function MessageCard({
  message,
  blockRemoteImages,
  imageRelay,
  imageRelayAvailable,
  onError,
}: {
  message: MailMessage;
  blockRemoteImages: boolean;
  imageRelay: boolean;
  imageRelayAvailable: boolean;
  onError(message: string): void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [trackingPixels, setTrackingPixels] = useState<TrackingPixelDetail[]>([]);
  const senderName = message.from?.name || message.from?.email || "Unknown sender";
  const senderEmail =
    message.from?.email && message.from.email !== senderName ? message.from.email : undefined;
  return (
    <article className="message-card">
      <div className="message-header">
        <button
          type="button"
          className="message-header-toggle"
          aria-label={expanded ? "Collapse message" : "Expand message"}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        />
        <span className="sender-avatar">{senderName.slice(0, 1).toUpperCase()}</span>
        <span className="message-sender">
          <span className="message-from">
            <span
              className="message-from-identity"
              title={senderEmail ? `${senderName} <${senderEmail}>` : senderName}
            >
              <strong>{senderName}</strong>
              {senderEmail ? (
                <span className="message-from-email">&lt;{senderEmail}&gt;</span>
              ) : null}
            </span>
            {trackingPixels.length ? (
              <TrackingPixelIndicator trackingPixels={trackingPixels} />
            ) : null}
          </span>
          <small>to {formatRecipients(message.to)}</small>
        </span>
        <time>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(message.date))}
        </time>
      </div>
      {expanded ? (
        <div className="message-body">
          <EmailHtml
            message={message}
            blockRemoteImages={blockRemoteImages}
            imageRelay={imageRelay}
            imageRelayAvailable={imageRelayAvailable}
            onError={onError}
            onTrackingPixelsChange={setTrackingPixels}
          />
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

function InlineComposer({
  accountId,
  threadId,
  message,
  mode,
  initialAttachments,
  imageRelay,
  imageRelayAvailable,
  onCancel,
  onSent,
  onError,
  onDirtyChange,
  blockRemoteImages,
}: {
  accountId: string;
  threadId: string;
  message: MailMessage;
  mode: InlineComposerMode;
  initialAttachments: ComposeAttachment[];
  imageRelay: boolean;
  imageRelayAvailable: boolean;
  onCancel(): void;
  onSent(): void;
  onError(message: string): void;
  onDirtyChange(dirty: boolean): void;
  blockRemoteImages: boolean;
}) {
  const forwarding = mode === "forward";
  const initialSubject = forwarding
    ? message.subject.toLowerCase().startsWith("fwd:")
      ? message.subject
      : `Fwd: ${message.subject}`
    : message.subject.toLowerCase().startsWith("re:")
      ? message.subject
      : `Re: ${message.subject}`;
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [subject, setSubject] = useState(initialSubject);
  const [html, setHtml] = useState("<p></p>");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [attachmentsChanged, setAttachmentsChanged] = useState(false);
  const attachmentTokens = useRef(
    new Set(initialAttachments.map((attachment) => attachment.token)),
  );
  const attachmentsReleased = useRef(false);
  const releaseTimer = useRef<number | undefined>(undefined);
  const ccRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);
  const editor = useMailEditor({
    autoFocus: !forwarding,
    onChange: (value) => {
      setHtml(value.html);
      setText(value.text);
    },
  });

  const releaseAttachments = useCallback(() => {
    if (attachmentsReleased.current) return;
    attachmentsReleased.current = true;
    const tokens = [...attachmentTokens.current];
    for (let index = 0; index < tokens.length; index += 20)
      void window.fluxmail.attachments
        .release(tokens.slice(index, index + 20))
        .catch(() => undefined);
  }, []);

  useEffect(() => {
    onDirtyChange(
      Boolean(
        text.trim() ||
        attachmentsChanged ||
        (forwarding && (to.trim() || cc.trim() || bcc.trim() || subject !== initialSubject)),
      ),
    );
  }, [attachmentsChanged, bcc, cc, forwarding, initialSubject, onDirtyChange, subject, text, to]);

  useEffect(() => {
    window.clearTimeout(releaseTimer.current);
    return () => {
      onDirtyChange(false);
      releaseTimer.current = window.setTimeout(releaseAttachments, 0);
    };
  }, [onDirtyChange, releaseAttachments]);

  const send = async () => {
    const toField = parseAddressField(to);
    const ccField = parseAddressField(cc);
    const bccField = parseAddressField(bcc);
    if (forwarding && (toField.invalid || ccField.invalid || bccField.invalid)) {
      onError("Check the recipient addresses and try again.");
      return;
    }
    if (
      (!forwarding && !text.trim()) ||
      (forwarding &&
        !toField.addresses.length &&
        !ccField.addresses.length &&
        !bccField.addresses.length)
    )
      return;
    setSending(true);
    try {
      if (forwarding) {
        await window.fluxmail.mail.forward({
          target: { accountId, threadId },
          messageId: message.id,
          to: toField.addresses,
          cc: ccField.addresses,
          bcc: bccField.addresses,
          subject,
          text,
          html,
          attachments,
          includeAttachments: false,
        });
      } else {
        await window.fluxmail.drafts.send({
          accountId,
          to: [],
          subject,
          text,
          html,
          replyToMessageId: message.id,
          replyAll: mode === "replyAll",
          attachments,
        });
      }
      releaseAttachments();
      onSent();
    } catch (error) {
      onError(error instanceof Error ? error.message : "Fluxmail could not send this message.");
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
      {forwarding ? (
        <div className="compose-fields inline-compose-fields">
          <label className="recipient-row">
            <span>To</span>
            <input
              aria-label="To"
              autoFocus
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@example.com"
            />
            <span className="recipient-field-actions">
              {!showCc ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowCc(true);
                    window.requestAnimationFrame(() => ccRef.current?.focus());
                  }}
                >
                  Cc
                </button>
              ) : null}
              {!showBcc ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowBcc(true);
                    window.requestAnimationFrame(() => bccRef.current?.focus());
                  }}
                >
                  Bcc
                </button>
              ) : null}
            </span>
          </label>
          {showCc ? (
            <label className="recipient-row">
              <span>Cc</span>
              <input
                ref={ccRef}
                aria-label="Cc"
                value={cc}
                onChange={(event) => setCc(event.target.value)}
              />
            </label>
          ) : null}
          {showBcc ? (
            <label className="recipient-row">
              <span>Bcc</span>
              <input
                ref={bccRef}
                aria-label="Bcc"
                value={bcc}
                onChange={(event) => setBcc(event.target.value)}
              />
            </label>
          ) : null}
          <label>
            <span>Subject</span>
            <input
              aria-label="Subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <MailEditorContent
        editor={editor}
        empty={!text.trim()}
        placeholder={
          forwarding ? "Add a message" : mode === "replyAll" ? "Reply to everyone" : "Write a reply"
        }
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
            <div className="quoted-reply-meta">{quotedReplyCitation(message)}</div>
            <div className="quoted-reply-body">
              <EmailHtml
                message={message}
                blockRemoteImages={blockRemoteImages}
                imageRelay={imageRelay}
                imageRelayAvailable={imageRelayAvailable}
                onError={onError}
              />
            </div>
          </div>
        ) : null}
      </div>
      {attachments.length ? (
        <div className="compose-attachments inline-compose-attachments">
          {attachments.map((attachment) => (
            <span key={attachment.token}>
              <Paperclip size={13} />
              {attachment.filename}
              <button
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => {
                  setAttachmentsChanged(true);
                  setAttachments((current) =>
                    current.filter((item) => item.token !== attachment.token),
                  );
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="quick-reply-footer">
        <MailEditorToolbar
          editor={editor}
          onAttach={() =>
            void window.fluxmail.attachments
              .pick()
              .then((picked) => {
                if (!picked.length) return;
                if (attachments.length + picked.length > 20) {
                  void window.fluxmail.attachments.release(
                    picked.map((attachment) => attachment.token),
                  );
                  onError("You can attach up to 20 files to a message.");
                  return;
                }
                for (const attachment of picked) attachmentTokens.current.add(attachment.token);
                setAttachmentsChanged(true);
                setAttachments((current) => [...current, ...picked]);
              })
              .catch((error) =>
                onError(
                  error instanceof Error ? error.message : "Fluxmail could not attach these files.",
                ),
              )
          }
        />
        <div className="quick-reply-actions">
          <button className="text-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="primary-button"
            disabled={
              sending ||
              (!forwarding && !text.trim()) ||
              (forwarding && !to.trim() && !cc.trim() && !bcc.trim())
            }
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

export function shouldOfferReplyAll(accountEmail: string, message: MailMessage): boolean {
  const ownAddress = normalizeAddress(accountEmail);
  const replyTargets = message.replyTo?.length
    ? message.replyTo
    : message.from
      ? [message.from]
      : [];
  const replyRecipients = uniqueAddresses(replyTargets).filter((address) => address !== ownAddress);
  const normalRecipients = new Set(
    replyRecipients.length ? replyRecipients : uniqueAddresses(message.to),
  );
  const replyAllRecipients = uniqueAddresses([
    ...replyTargets,
    ...message.to,
    ...(message.cc ?? []),
  ]).filter((address) => address !== ownAddress);
  if (!replyAllRecipients.length) replyAllRecipients.push(ownAddress);
  return replyAllRecipients.some((address) => !normalRecipients.has(address));
}

function uniqueAddresses(addresses: Array<{ email: string }>): string[] {
  return [...new Set(addresses.map((address) => normalizeAddress(address.email)).filter(Boolean))];
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
