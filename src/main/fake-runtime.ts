import type { Message } from "@fluxmail/core";
import {
  CURRENT_STORE_FORMAT,
  LICENSE_KEY_PATTERN,
  MAX_SUPPORTED_STORE_FORMAT,
  MIN_SUPPORTED_STORE_FORMAT,
  VERSION,
} from "fluxmail";
import type {
  AccountInfo,
  BootstrapState,
  ComposeInput,
  LicenseActivationResult,
  MailThread,
  ModifyActionInput,
  ThreadListInput,
  ThreadPage,
  ThreadSummary,
} from "../shared/contracts";
import type { DesktopAnalytics } from "./analytics";

const account: AccountInfo = {
  id: "test-account",
  email: "dev@fluxmail.test",
  displayName: "Fluxmail Test",
  provider: "gmail",
  status: "active",
  canPermanentlyDelete: false,
  canUseImageRelay: true,
};

function todayAt(hour: number): string {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const seedMessages: Message[] = [
  {
    id: "welcome-message",
    threadId: "welcome-thread",
    accountId: account.id,
    folder: { id: "INBOX", name: "Inbox", role: "inbox" },
    from: { name: "Fluxmail Team", email: "team@fluxmail.test" },
    to: [{ email: account.email }],
    subject: "Welcome to Fluxmail",
    date: todayAt(14),
    snippet: "Your desktop inbox is ready.",
    body: {
      html: '<p>Your desktop inbox is ready.</p><script>window.evil = true</script><img src="https://tracker.invalid/pixel" width="1"><img src="https://t.yesware.com/tt/message-1"><img src = "https://images.invalid/welcome.png" width="320" height="180">',
    },
    flags: { read: false, starred: false, draft: false },
  },
  {
    id: "receipt-message",
    threadId: "receipt-thread",
    accountId: account.id,
    folder: { id: "INBOX", name: "Inbox", role: "inbox" },
    labels: ["Receipts"],
    from: { name: "Corner Market", email: "receipts@market.test" },
    to: [{ email: account.email }],
    subject: "Receipt for Tuesday",
    date: todayAt(13),
    snippet: "Thanks for shopping with us.",
    body: { html: "<p>Thanks for shopping with us.</p>" },
    flags: { read: true, starred: true, draft: false },
    attachments: [
      {
        id: "receipt-pdf",
        filename: "receipt.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
      },
    ],
  },
  {
    id: "draft-message",
    threadId: "draft-thread",
    accountId: account.id,
    draftId: "test-draft",
    folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
    from: { name: account.displayName, email: account.email },
    to: [{ name: "Sam", email: "sam@example.test" }],
    cc: [{ email: "editor@example.test" }],
    subject: "Launch notes",
    date: todayAt(12),
    snippet: "The first draft is ready.",
    body: {
      html: "<p>The first <strong>draft</strong> is ready.</p>",
      text: "The first draft is ready.",
    },
    attachments: [
      {
        id: "draft-attachment",
        filename: "launch-notes.pdf",
        mimeType: "application/pdf",
        sizeBytes: 128,
      },
    ],
    flags: { read: true, starred: false, draft: true },
  },
];

export class FakeFluxmailRuntime {
  async imageRelayIdentityTokens(_forceRefresh = false): Promise<string[]> {
    return ["fake-image-relay-token"];
  }

  private connected = true;
  private messages = structuredClone(seedMessages);
  private licenseValue: BootstrapState["license"] = {
    plan: "personal",
    maxMembers: 1,
    maxAccounts: 3,
  };

  constructor(
    private readonly options: {
      analytics: DesktopAnalytics;
      onCacheChanged(): void;
    },
  ) {}

  async initialize(): Promise<void> {}
  async shutdown(): Promise<void> {}

  accounts(): AccountInfo[] {
    return this.connected ? [account] : [];
  }

  maxAttachmentBytes(): number {
    return 25 * 1024 * 1024;
  }

  unreadCount(accountIds?: string[]): number {
    if (accountIds?.length && !accountIds.includes(account.id)) return 0;
    return this.messages.filter(
      (message) => message.folder?.role === "inbox" && !message.flags.read,
    ).length;
  }

  async bootstrap(sync: BootstrapState["sync"]): Promise<Omit<BootstrapState, "preferences">> {
    return {
      engine: {
        version: VERSION,
        storeFormat: CURRENT_STORE_FORMAT,
        minimumSupportedFormat: MIN_SUPPORTED_STORE_FORMAT,
        maximumSupportedFormat: MAX_SUPPORTED_STORE_FORMAT,
      },
      accounts: this.accounts(),
      folders: await this.folders(),
      unreadCount: this.messages.filter(
        (message) => message.folder?.role === "inbox" && !message.flags.read,
      ).length,
      draftCount: this.messages.filter((message) => message.flags.draft).length,
      countsByAccount: this.connected
        ? {
            [account.id]: {
              unreadCount: this.messages.filter(
                (message) => message.folder?.role === "inbox" && !message.flags.read,
              ).length,
              draftCount: this.messages.filter((message) => message.flags.draft).length,
            },
          }
        : {},
      sync,
      telemetry: this.options.analytics.status(),
      license: this.licenseValue,
    };
  }

  async activateLicense(rawKey: string): Promise<LicenseActivationResult> {
    if (!LICENSE_KEY_PATTERN.test(rawKey.trim())) {
      throw new Error("That license key does not look right. Check it and try again.");
    }
    this.licenseValue = { plan: "pro", maxMembers: 1, maxAccounts: 5 };
    return { outcome: "activated", license: this.licenseValue };
  }

  async folders(_force = false): Promise<BootstrapState["folders"]> {
    if (!this.connected) return [];
    return [
      {
        accountId: account.id,
        id: "INBOX",
        name: "Inbox",
        role: "inbox",
        unreadCount: 1,
      },
      { accountId: account.id, id: "SENT", name: "Sent", role: "sent" },
      { accountId: account.id, id: "DRAFT", name: "Drafts", role: "drafts" },
      { accountId: account.id, id: "Receipts", name: "Receipts" },
    ];
  }

  async connectGmail(_accountId?: string): Promise<AccountInfo> {
    this.connected = true;
    return account;
  }

  removeAccount(_accountId: string): void {
    this.connected = false;
    this.options.onCacheChanged();
  }

  async listThreads(raw: ThreadListInput, _forceProviderSearch = false): Promise<ThreadPage> {
    const input = { pageSize: 100, ...raw };
    const offset = Number(input.cursor ?? 0);
    const all = this.summaries().filter((thread) => {
      if (input.accountIds?.length && !input.accountIds.includes(thread.accountId)) return false;
      if (input.view === "starred" && !thread.starred) return false;
      if (input.view === "label" && input.label && !thread.labels.includes(input.label))
        return false;
      if (
        input.view === "search" &&
        thread.folderRoles.some((role) => role === "spam" || role === "trash")
      )
        return false;
      if (
        !["all", "starred", "label", "search"].includes(input.view) &&
        !thread.folderRoles.includes(input.view)
      )
        return false;
      const query = input.query?.trim().toLowerCase();
      return (
        !query ||
        `${thread.senderName} ${thread.subject} ${thread.snippet}`.toLowerCase().includes(query)
      );
    });
    const items = all.slice(offset, offset + input.pageSize);
    return {
      items,
      totalCount: all.length,
      ...(offset + items.length < all.length ? { nextCursor: String(offset + items.length) } : {}),
      syncing: false,
    };
  }

  async getThread(_accountId: string, threadId: string): Promise<MailThread> {
    const messages = this.messages.filter((message) => message.threadId === threadId);
    if (!messages.length) throw new Error("This test conversation no longer exists.");
    return {
      id: threadId,
      accountId: account.id,
      accountEmail: account.email,
      subject: messages[0]!.subject,
      messages,
    };
  }

  async modify(targets: Array<{ threadId: string }>, action: ModifyActionInput): Promise<void> {
    if (action.type === "archive") {
      const delay = Number(process.env.FLUXMAIL_DESKTOP_FAKE_ARCHIVE_DELAY_MS ?? 0);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
    const ids = new Set(targets.map((target) => target.threadId));
    if (action.type === "discardDraft")
      this.messages = this.messages.filter(
        (message) => !ids.has(message.threadId) || !message.flags.draft,
      );
    else if (action.type === "delete")
      this.messages = this.messages.filter((message) => !ids.has(message.threadId));
    else {
      for (const message of this.messages.filter((item) => ids.has(item.threadId))) {
        if (action.type === "markRead") message.flags.read = true;
        if (action.type === "markUnread") message.flags.read = false;
        if (action.type === "star") message.flags.starred = true;
        if (action.type === "unstar") message.flags.starred = false;
        if (action.type === "archive")
          message.folder = { id: "ALL", name: "All mail", role: "all" };
        if (action.type === "trash") message.folder = { id: "TRASH", name: "Trash", role: "trash" };
        if (action.type === "untrash")
          message.folder = { id: "INBOX", name: "Inbox", role: "inbox" };
        if (action.type === "move")
          message.folder =
            action.folder === "spam"
              ? { id: "SPAM", name: "Spam", role: "spam" }
              : { id: action.folder, name: action.folder };
        if (action.type === "addLabels")
          message.labels = [...new Set([...(message.labels ?? []), ...action.labels])];
        if (action.type === "removeLabels")
          message.labels = (message.labels ?? []).filter((label) => !action.labels.includes(label));
      }
    }
    this.options.onCacheChanged();
  }

  async saveDraft(input: ComposeInput): Promise<{ draftId: string; messageId: string }> {
    const existing = input.draftId
      ? this.messages.find((message) => message.draftId === input.draftId)
      : undefined;
    const draftId = input.draftId ?? `test-draft-${this.messages.length + 1}`;
    const messageId = existing?.id ?? `test-draft-message-${this.messages.length + 1}`;
    const draft: Message = {
      id: messageId,
      threadId: existing?.threadId ?? messageId,
      accountId: account.id,
      draftId,
      folder: { id: "DRAFT", name: "Drafts", role: "drafts" },
      from: { name: account.displayName, email: account.email },
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.bcc?.length ? { bcc: input.bcc } : {}),
      subject: input.subject,
      date: new Date().toISOString(),
      snippet: input.text,
      body: { text: input.text, html: input.html },
      attachments: (input.attachments ?? []).map(({ token, ...attachment }) => ({
        id: token,
        ...attachment,
      })),
      flags: { read: true, starred: false, draft: true },
    };
    if (existing) this.messages[this.messages.indexOf(existing)] = draft;
    else this.messages.push(draft);
    this.options.onCacheChanged();
    return { draftId, messageId };
  }

  async deleteDraft(_accountId: string, _draftId: string): Promise<void> {}

  async send(input: ComposeInput): Promise<{ id: string; threadId: string }> {
    const id = `sent-${this.messages.length + 1}`;
    this.messages.push({
      id,
      threadId: id,
      accountId: account.id,
      folder: { id: "SENT", name: "Sent", role: "sent" },
      from: { email: account.email },
      to: input.to,
      subject: input.subject,
      date: new Date().toISOString(),
      snippet: input.text,
      body: { text: input.text, html: input.html },
      flags: { read: true, starred: false, draft: false },
    });
    this.options.onCacheChanged();
    return { id, threadId: id };
  }

  async forward(input: {
    accountId: string;
    messageId: string;
    to: Array<{ name?: string; email: string }>;
    cc?: Array<{ name?: string; email: string }>;
    bcc?: Array<{ name?: string; email: string }>;
    subject: string;
    comment?: string;
    text?: string;
    html?: string;
    attachments?: ComposeInput["attachments"];
    includeAttachments?: boolean;
  }): Promise<void> {
    const original = this.messages.find((message) => message.id === input.messageId);
    const id = `forwarded-${this.messages.length + 1}`;
    const subject = input.subject || original?.subject || "";
    this.messages.push({
      id,
      threadId: id,
      accountId: account.id,
      folder: { id: "SENT", name: "Sent", role: "sent" },
      from: { email: account.email },
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.bcc?.length ? { bcc: input.bcc } : {}),
      subject,
      date: new Date().toISOString(),
      snippet: input.text ?? input.comment ?? "",
      body: { text: input.text ?? input.comment ?? "", html: input.html },
      attachments: [
        ...(input.includeAttachments ? (original?.attachments ?? []) : []),
        ...(input.attachments ?? []).map(({ token, ...attachment }) => ({
          id: token,
          ...attachment,
        })),
      ],
      flags: { read: true, starred: false, draft: false },
    });
    this.options.onCacheChanged();
  }

  async attachment(
    _accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{
    meta: { filename: string; mimeType: string };
    content: Buffer;
  }> {
    const attachment = this.messages
      .find((message) => message.id === messageId)
      ?.attachments?.find((candidate) => candidate.id === attachmentId);
    return {
      meta: {
        filename: attachment?.filename ?? "attachment.bin",
        mimeType: attachment?.mimeType ?? "application/octet-stream",
      },
      content: Buffer.from("test"),
    };
  }

  async refresh(
    _trigger: "startup" | "poll" | "manual" | "resume" | "mutation" = "manual",
    _activeInput: ThreadListInput = { view: "inbox" },
  ): Promise<number> {
    this.options.onCacheChanged();
    return this.messages.length;
  }

  private summaries(): ThreadSummary[] {
    return this.messages
      .map((message) => ({
        id: message.threadId,
        accountId: account.id,
        accountEmail: account.email,
        subject: message.subject,
        senderName: message.from?.name || message.from?.email || "Unknown sender",
        senderEmail: message.from?.email || "",
        snippet: message.snippet || "",
        date: message.date,
        unread: !message.flags.read,
        starred: message.flags.starred,
        draft: message.flags.draft,
        hasAttachments: Boolean(message.attachments?.length),
        messageCount: 1,
        labels: message.labels ?? [],
        folderRoles: message.folder?.role ? [message.folder.role] : [],
      }))
      .sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
  }
}
