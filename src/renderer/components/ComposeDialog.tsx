import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Ellipsis, Paperclip, Send, Trash2, X } from "lucide-react";
import {
  addressSchema,
  type AccountInfo,
  type ComposeAttachment,
  type MailMessage,
} from "../../shared/contracts";
import { MailEditorContent, MailEditorToolbar, useMailEditor } from "./MailEditor";
import { EmailHtml } from "./EmailHtml";
import { IconButton } from "./Controls";

export interface ComposeSeed {
  accountId: string;
  draftId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  initialHtml?: string;
  initialText?: string;
  threadId?: string;
  replyToMessageId?: string;
  replyAll?: boolean;
  forwardMessageId?: string;
  initialAttachments?: ComposeAttachment[];
}

interface Props {
  seed: ComposeSeed;
  accounts: AccountInfo[];
  onClose(): void;
  onSent(): void;
  onError(message: string): void;
}

export interface ComposeDialogHandle {
  close(): Promise<boolean>;
}

export const ComposeDialog = forwardRef<ComposeDialogHandle, Props>(function ComposeDialog(
  { seed, accounts, onClose, onSent, onError },
  ref,
) {
  const initialEditorHtml = seed.initialHtml ?? htmlFromText(seed.initialText ?? "");
  const [accountId, setAccountId] = useState(seed.accountId);
  const [to, setTo] = useState(seed.to ?? "");
  const [cc, setCc] = useState(seed.cc ?? "");
  const [bcc, setBcc] = useState(seed.bcc ?? "");
  const [subject, setSubject] = useState(seed.subject ?? "");
  const [replyToMessageId, setReplyToMessageId] = useState(seed.replyToMessageId);
  const [attachments, setAttachments] = useState<ComposeAttachment[]>(
    seed.initialAttachments ?? [],
  );
  const [draftId, setDraftId] = useState(seed.draftId);
  const [html, setHtml] = useState(initialEditorHtml);
  const [text, setText] = useState(() => seed.initialText ?? textFromHtml(seed.initialHtml));
  const [showCc, setShowCc] = useState(Boolean(seed.cc));
  const [showBcc, setShowBcc] = useState(Boolean(seed.bcc));
  const [recipientsCollapsed, setRecipientsCollapsed] = useState(Boolean(seed.to));
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quotedMessage, setQuotedMessage] = useState<MailMessage>();
  const [quoteOpen, setQuoteOpen] = useState(false);
  const revision = useRef(0);
  const savedRevision = useRef(0);
  const finishing = useRef(false);
  const attachmentTokens = useRef(
    new Set((seed.initialAttachments ?? []).map((attachment) => attachment.token)),
  );
  const attachmentsReleased = useRef(false);
  const releaseTimer = useRef<number | undefined>(undefined);
  const saveInFlight = useRef<Promise<{ draftId: string; messageId: string }> | undefined>(
    undefined,
  );
  const ccRef = useRef<HTMLInputElement>(null);
  const bccRef = useRef<HTMLInputElement>(null);
  const editor = useMailEditor({
    initialHtml: initialEditorHtml,
    autoFocus: Boolean(seed.to),
    onChange: ({ html: nextHtml, text: nextText }) => {
      revision.current += 1;
      setHtml(nextHtml);
      setText(nextText);
    },
  });

  const releaseTokens = useCallback((tokens: string[]) => {
    for (let index = 0; index < tokens.length; index += 20)
      void window.fluxmail.attachments
        .release(tokens.slice(index, index + 20))
        .catch(() => undefined);
  }, []);

  const releaseAttachments = useCallback(() => {
    if (attachmentsReleased.current) return;
    attachmentsReleased.current = true;
    releaseTokens([...attachmentTokens.current]);
  }, [releaseTokens]);

  useEffect(() => {
    window.clearTimeout(releaseTimer.current);
    return () => {
      releaseTimer.current = window.setTimeout(releaseAttachments, 0);
    };
  }, [releaseAttachments]);

  useEffect(() => {
    if (!seed.threadId) return;
    let canceled = false;
    void window.fluxmail.mail
      .getThread({ accountId: seed.accountId, threadId: seed.threadId })
      .then((thread) => {
        const message = thread.messages.at(-1);
        if (!message || canceled) return;
        setQuotedMessage(message);
        if (!seed.forwardMessageId) {
          if (revision.current > 0) revision.current += 1;
          setReplyToMessageId((current) => current ?? message.id);
          setTo((current) => current || replyRecipient(thread.accountEmail, message));
        }
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
  }, [onError, seed.accountId, seed.forwardMessageId, seed.threadId]);

  const toField = useMemo(() => parseAddressField(to), [to]);
  const ccField = useMemo(() => parseAddressField(cc), [cc]);
  const bccField = useMemo(() => parseAddressField(bcc), [bcc]);
  const parsedTo = toField.addresses;
  const parsedCc = ccField.addresses;
  const parsedBcc = bccField.addresses;
  const hasDraftContent = Boolean(
    text.trim() || subject.trim() || to.trim() || cc.trim() || bcc.trim() || attachments.length,
  );
  const composeTitle =
    subject.trim() ||
    (seed.forwardMessageId ? "Forward message" : replyToMessageId ? "Reply" : "New message");

  useEffect(() => {
    if (
      seed.forwardMessageId ||
      sending ||
      finishing.current ||
      revision.current === savedRevision.current ||
      (!hasDraftContent && !draftId)
    )
      return;
    const timer = window.setTimeout(() => {
      if (finishing.current) return;
      setSaving(true);
      const requestRevision = revision.current;
      const save = (pending?: { draftId: string }) =>
        window.fluxmail.drafts.save({
          accountId,
          draftId: draftId ?? pending?.draftId,
          to: parsedTo,
          cc: parsedCc,
          bcc: parsedBcc,
          subject,
          html,
          text,
          replyToMessageId,
          replyAll: seed.replyAll,
          attachments,
        });
      const previous = saveInFlight.current;
      const request = previous ? previous.catch(() => undefined).then(save) : save();
      saveInFlight.current = request;
      void request
        .then((result) => {
          setDraftId(result.draftId);
          savedRevision.current = Math.max(savedRevision.current, requestRevision);
        })
        .catch((error) =>
          onError(error instanceof Error ? error.message : "Fluxmail could not save this draft."),
        )
        .finally(() => {
          if (saveInFlight.current === request) saveInFlight.current = undefined;
          setSaving(false);
        });
    }, 1_500);
    return () => window.clearTimeout(timer);
  }, [
    accountId,
    attachments,
    draftId,
    hasDraftContent,
    html,
    onError,
    parsedBcc,
    parsedCc,
    parsedTo,
    replyToMessageId,
    seed.forwardMessageId,
    seed.replyAll,
    sending,
    subject,
    text,
  ]);

  const send = async () => {
    if (toField.invalid || ccField.invalid || bccField.invalid) {
      onError("Check the recipient addresses and try again.");
      return;
    }
    const hasRecipient = Boolean(parsedTo.length || parsedCc.length || parsedBcc.length);
    if (!hasRecipient || (!seed.forwardMessageId && !text.trim())) {
      onError("Add a recipient and write a message before sending.");
      return;
    }
    finishing.current = true;
    setSending(true);
    try {
      const pendingDraft = await saveInFlight.current?.catch(() => undefined);
      const currentDraftId = draftId ?? pendingDraft?.draftId;
      if (seed.forwardMessageId) {
        await window.fluxmail.mail.forward({
          target: {
            accountId,
            threadId: seed.threadId ?? seed.forwardMessageId,
          },
          messageId: seed.forwardMessageId,
          to: parsedTo,
          cc: parsedCc,
          bcc: parsedBcc,
          subject,
          text,
          html,
          attachments,
          includeAttachments: false,
        });
      } else {
        await window.fluxmail.drafts.send({
          accountId,
          draftId: currentDraftId,
          to: parsedTo,
          cc: parsedCc,
          bcc: parsedBcc,
          subject,
          html,
          text,
          replyToMessageId,
          replyAll: seed.replyAll,
          attachments,
        });
      }
      void window.fluxmail.analytics
        .trackFeature({
          feature: "compose",
          action: "completed",
          source: "compose",
        })
        .catch(() => undefined);
      releaseAttachments();
      onSent();
    } catch (error) {
      finishing.current = false;
      onError(error instanceof Error ? error.message : "Fluxmail could not send this message.");
    } finally {
      setSending(false);
    }
  };

  const close = async (): Promise<boolean> => {
    if (toField.invalid || ccField.invalid || bccField.invalid) {
      onError("Check the recipient addresses and try again.");
      return false;
    }
    if (finishing.current) return false;
    finishing.current = true;
    if (seed.forwardMessageId && !canCloseForward(revision.current !== savedRevision.current)) {
      finishing.current = false;
      return false;
    }
    let currentDraftId = draftId;
    if (!seed.forwardMessageId && saveInFlight.current) {
      try {
        currentDraftId ??= (await saveInFlight.current).draftId;
      } catch (error) {
        finishing.current = false;
        onError(error instanceof Error ? error.message : "Fluxmail could not save this draft.");
        return false;
      }
    }
    if (
      !seed.forwardMessageId &&
      revision.current !== savedRevision.current &&
      (hasDraftContent || Boolean(currentDraftId))
    ) {
      setSaving(true);
      try {
        const requestRevision = revision.current;
        const result = await window.fluxmail.drafts.save({
          accountId,
          draftId: currentDraftId,
          to: parsedTo,
          cc: parsedCc,
          bcc: parsedBcc,
          subject,
          html,
          text,
          replyToMessageId,
          replyAll: seed.replyAll,
          attachments,
        });
        setDraftId(result.draftId);
        savedRevision.current = requestRevision;
      } catch (error) {
        finishing.current = false;
        onError(error instanceof Error ? error.message : "Fluxmail could not save this draft.");
        setSaving(false);
        return false;
      }
      setSaving(false);
    }
    releaseAttachments();
    onClose();
    return true;
  };

  useImperativeHandle(ref, () => ({ close }));

  const discard = async () => {
    finishing.current = true;
    try {
      const pendingDraft = await saveInFlight.current;
      const currentDraftId = draftId ?? pendingDraft?.draftId;
      if (currentDraftId)
        await window.fluxmail.drafts.delete({
          accountId,
          draftId: currentDraftId,
        });
    } catch (error) {
      finishing.current = false;
      onError(error instanceof Error ? error.message : "Fluxmail could not discard this draft.");
      return;
    }
    releaseAttachments();
    onClose();
  };

  return (
    <div
      className="modal-backdrop compose-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) void close();
      }}
      onKeyDown={(event) => {
        if (event.metaKey && event.key === "Enter") {
          event.preventDefault();
          void send();
        }
        if (event.key === "Escape") void close();
      }}
    >
      <section className="compose-dialog" role="dialog" aria-modal="true" aria-label="New message">
        <header>
          <strong title={composeTitle}>{composeTitle}</strong>
          <span>{saving ? "Saving draft..." : draftId ? "Draft saved" : ""}</span>
          <button className="icon-button" onClick={() => void close()} aria-label="Close compose">
            <X size={17} />
          </button>
        </header>
        <div className="compose-fields">
          {accounts.length > 1 ? (
            <label>
              <span>From</span>
              <select
                value={accountId}
                disabled={Boolean(draftId) || saving}
                onChange={(event) => {
                  revision.current += 1;
                  setAccountId(event.target.value);
                }}
              >
                {accounts.map((account) => (
                  <option value={account.id} key={account.id}>
                    {account.email}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div
            className="compose-recipients"
            onBlurCapture={(event) => {
              const next = event.relatedTarget;
              if (!(next instanceof Node) || !event.currentTarget.contains(next))
                setRecipientsCollapsed(true);
            }}
          >
            {recipientsCollapsed ? (
              <button
                type="button"
                className="recipient-summary"
                aria-label="Edit recipients"
                onClick={() => setRecipientsCollapsed(false)}
              >
                <span>To</span>
                <span className="truncate">
                  {to || "No recipients"}
                  {cc ? `, Cc: ${cc}` : ""}
                  {bcc ? `, Bcc: ${bcc}` : ""}
                </span>
              </button>
            ) : (
              <>
                <label className="recipient-row">
                  <span>To</span>
                  <input
                    autoFocus={!seed.to}
                    value={to}
                    onFocus={() => setRecipientsCollapsed(false)}
                    onChange={(event) => {
                      revision.current += 1;
                      setTo(event.target.value);
                    }}
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
                      value={cc}
                      onFocus={() => setRecipientsCollapsed(false)}
                      onChange={(event) => {
                        revision.current += 1;
                        setCc(event.target.value);
                      }}
                    />
                  </label>
                ) : null}
                {showBcc ? (
                  <label className="recipient-row">
                    <span>Bcc</span>
                    <input
                      ref={bccRef}
                      value={bcc}
                      onFocus={() => setRecipientsCollapsed(false)}
                      onChange={(event) => {
                        revision.current += 1;
                        setBcc(event.target.value);
                      }}
                    />
                  </label>
                ) : null}
              </>
            )}
          </div>
          <label>
            <span>Subject</span>
            <input
              value={subject}
              onChange={(event) => {
                revision.current += 1;
                setSubject(event.target.value);
              }}
            />
          </label>
        </div>
        <MailEditorContent
          editor={editor}
          empty={!text.trim()}
          placeholder="Write a message"
          className="compose-editor"
          onFocus={() => setRecipientsCollapsed(true)}
        />
        {quotedMessage ? (
          <div className="compose-quoted">
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
                  {quotedMessage.from?.name || quotedMessage.from?.email || "Previous message"}
                </div>
                <EmailHtml message={quotedMessage} onError={onError} />
              </div>
            ) : null}
          </div>
        ) : null}
        {attachments.length ? (
          <div className="compose-attachments">
            {attachments.map((attachment) => (
              <span key={attachment.token}>
                <Paperclip size={13} />
                {attachment.filename}
                <button
                  aria-label={`Remove ${attachment.filename}`}
                  onClick={() =>
                    setAttachments((current) => {
                      revision.current += 1;
                      return current.filter((item) => item.token !== attachment.token);
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <footer>
          <button
            className="primary-button send-button"
            disabled={sending}
            onClick={() => void send()}
          >
            <Send size={16} />
            {sending ? "Sending..." : "Send"}
          </button>
          <MailEditorToolbar
            editor={editor}
            onAttach={() =>
              void window.fluxmail.attachments
                .pick()
                .then((picked) => {
                  if (!picked.length) return;
                  if (attachments.length + picked.length > 20) {
                    releaseTokens(picked.map((attachment) => attachment.token));
                    onError("You can attach up to 20 files to a message.");
                    return;
                  }
                  for (const attachment of picked) attachmentTokens.current.add(attachment.token);
                  revision.current += 1;
                  setAttachments((current) => [...current, ...picked]);
                })
                .catch((error) =>
                  onError(
                    error instanceof Error
                      ? error.message
                      : "Fluxmail could not attach these files.",
                  ),
                )
            }
          />
          <button
            className="icon-button discard-button"
            onClick={() => void discard()}
            aria-label="Discard draft"
          >
            <Trash2 size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
});

export function parseAddressField(value: string): {
  addresses: Array<{ name?: string; email: string }>;
  invalid: boolean;
} {
  const entries = splitAddressEntries(value);
  const addresses = entries
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const match = entry.match(/^(.*?)\s*<([^>]+)>$/);
      const email = (match?.[2] ?? entry).trim();
      const rawName = match?.[1]?.trim();
      const name =
        rawName?.startsWith('"') && rawName.endsWith('"')
          ? rawName.slice(1, -1).replaceAll('\\"', '"')
          : rawName;
      const address = { email, ...(name ? { name } : {}) };
      return addressSchema.safeParse(address).success ? [address] : [];
    });
  return {
    addresses,
    invalid: addresses.length !== entries.filter((entry) => entry.trim()).length,
  };
}

function splitAddressEntries(value: string): string[] {
  const entries: string[] = [];
  let current = "";
  let quoted = false;
  let angleDepth = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (character === '"' && value[index - 1] !== "\\") quoted = !quoted;
    if (!quoted && character === "<") angleDepth += 1;
    if (!quoted && character === ">") angleDepth = Math.max(0, angleDepth - 1);
    if (!quoted && angleDepth === 0 && (character === "," || character === ";")) {
      entries.push(current);
      current = "";
    } else {
      current += character;
    }
  }
  entries.push(current);
  return entries;
}

function textFromHtml(value?: string): string {
  if (!value) return "";
  const document = new DOMParser().parseFromString(value, "text/html");
  return document.body.textContent?.trim() ?? "";
}

function htmlFromText(value: string): string {
  const escaped = value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
  return `<p>${escaped.replaceAll("\n", "<br>")}</p>`;
}

export function replyRecipient(accountEmail: string, message: MailMessage): string {
  const ownAddress = accountEmail.toLowerCase();
  const replyTargets = message.replyTo?.length
    ? message.replyTo
    : message.from
      ? [message.from]
      : [];
  const externalReplyTargets = replyTargets.filter(
    (address) => address.email.toLowerCase() !== ownAddress,
  );
  if (externalReplyTargets.length) return externalReplyTargets.map(formatAddress).join(", ");
  const recipient = message.to.find((address) => address.email.toLowerCase() !== ownAddress);
  return formatAddress(recipient);
}

export function canCloseForward(
  hasUnsavedChanges: boolean,
  confirmDiscard: () => boolean = () => window.confirm("Discard this unsent forward?"),
): boolean {
  return !hasUnsavedChanges || confirmDiscard();
}

function formatAddress(address?: { name?: string; email: string }): string {
  if (!address) return "";
  if (!address.name) return address.email;
  const name = /[,;"]/.test(address.name)
    ? `"${address.name.replaceAll('"', '\\"')}"`
    : address.name;
  return `${name} <${address.email}>`;
}
