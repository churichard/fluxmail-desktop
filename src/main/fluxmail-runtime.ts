import { homedir } from "node:os";
import path from "node:path";
import type { AttachmentInput, Message, ModifyAction } from "@fluxmail/core";
import { isEmailError } from "@fluxmail/core";
import {
  buildForwardBody,
  decryptString,
  type AppContext,
  type SendInput,
  type StoreCompatibility,
} from "fluxmail";
import type {
  AccountInfo,
  Address,
  BootstrapState,
  ComposeAttachment,
  ComposeInput,
  FolderInfo,
  LicenseActivationResult,
  MailThread,
  MailboxView,
  ModifyActionInput,
  ThreadListInput,
  ThreadPage,
} from "../shared/contracts";
import { MailCache } from "./cache";
import { DesktopAnalytics, type MailOperation, type SyncTrigger } from "./analytics";
import { toEmailQuery } from "./mail-mapping";
import {
  googleCredentialsAllowPermanentDelete,
  googleOAuthClientAllowsPermanentDelete,
  googleOAuthScopes,
  runGoogleOAuth,
} from "./oauth";

interface RuntimeOptions {
  cache: MailCache;
  analytics: DesktopAnalytics;
  openExternal(url: string): Promise<void>;
  resolveAttachment(attachment: ComposeAttachment): Promise<AttachmentInput>;
  onNewMessages(messages: Message[], account: AccountInfo): void;
  onCacheChanged(): void;
  onLicenseChanged(): void;
}

const PRIVATE_IMAGE_RELAY_PLANS = new Set(["pro", "team", "enterprise"]);

export class FluxmailRuntime {
  private context!: AppContext;
  private fluxmail!: typeof import("fluxmail");
  private initialized = false;
  private cacheGeneration = 0;
  private viewRefreshGeneration = 0;
  private googleOAuthAttempt?: Promise<Awaited<ReturnType<typeof runGoogleOAuth>>>;
  private imageRelayLicenseRefresh?: Promise<void>;
  private imageRelayAccessDeniedByServer = false;
  private readonly backgroundViewRefreshes = new Map<string, Promise<void>>();
  private readonly committedViewRefreshes = new Map<string, number>();

  constructor(private readonly options: RuntimeOptions) {}

  async initialize(): Promise<void> {
    if (this.initialized) return;
    process.env.FLUXMAIL_DATA_DIR ??= path.join(homedir(), ".fluxmail");
    this.fluxmail = await import("fluxmail");
    const shouldStoreBundledGoogleConfig = prepareFluxmailConfiguration(
      this.fluxmail,
      __FLUXMAIL_GOOGLE_CLIENT_ID__,
      __FLUXMAIL_GOOGLE_CLIENT_SECRET__,
    );
    this.context = this.fluxmail.createContext();
    if (
      shouldStoreBundledGoogleConfig &&
      this.context.configuration.oauthStatus().google.source === "built-in"
    ) {
      this.context.configuration.setGoogle({
        clientId: __FLUXMAIL_GOOGLE_CLIENT_ID__,
        clientSecret: __FLUXMAIL_GOOGLE_CLIENT_SECRET__,
      });
    }
    this.context.scheduler.start();
    this.context.licenseController.start();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    this.context.scheduler.stop();
    this.context.licenseController.stop();
    await this.context.telemetry.shutdown();
  }

  accounts(): AccountInfo[] {
    return this.context.registry
      .listAccounts()
      .map((account) =>
        toAccountInfo(account, this.accountCanPermanentlyDelete(account.id, account.provider)),
      );
  }

  async imageRelayLicenseLease(forceRefresh = false): Promise<string> {
    let lease = this.fluxmail.readLeaseRow(this.context.db);
    let entitlements = this.fluxmail.getEntitlements(this.context.db);
    if (forceRefresh || !lease || entitlements.inGrace) {
      await this.context.licenseController.refreshNow();
      lease = this.fluxmail.readLeaseRow(this.context.db);
      entitlements = this.fluxmail.getEntitlements(this.context.db);
    }
    if (
      !lease ||
      !entitlements.licensed ||
      entitlements.inGrace ||
      !PRIVATE_IMAGE_RELAY_PLANS.has(entitlements.plan)
    ) {
      this.options.onLicenseChanged();
      throw new Error("Private image relay is available on Pro, Team, and Enterprise.");
    }
    this.fluxmail.verifyLease(lease.token, this.fluxmail.licensePublicKeys());
    return lease.token;
  }

  imageRelayAccessDenied(): void {
    if (this.imageRelayAccessDeniedByServer) return;
    this.imageRelayAccessDeniedByServer = true;
    this.options.onLicenseChanged();
  }

  private accountCanPermanentlyDelete(
    accountId: string,
    provider: AccountInfo["provider"],
  ): boolean {
    if (provider !== "gmail") return true;
    try {
      // CLI and MCP reconnections update this shared credential row, so the
      // desktop capability must be derived here instead of kept in its mail cache.
      const sqlite = (
        this.context.db as unknown as {
          $client: {
            prepare(source: string): {
              get(accountId: string): { encrypted_credentials: string } | undefined;
            };
          };
        }
      ).$client;
      const row = sqlite
        .prepare("SELECT encrypted_credentials FROM account_credentials WHERE account_id = ?")
        .get(accountId);
      if (!row) return false;
      const credentials = JSON.parse(
        decryptString(this.context.config.encryptionKey, row.encrypted_credentials),
      ) as {
        scope?: string;
        fluxmailOAuthClient?: { clientId: string };
      };
      const clientId = credentials.fluxmailOAuthClient?.clientId;
      const requestedScopes = clientId
        ? googleOAuthScopes(googleOAuthClientAllowsPermanentDelete(clientId))
        : [];
      return googleCredentialsAllowPermanentDelete(credentials, requestedScopes);
    } catch {
      return false;
    }
  }

  maxAttachmentBytes(): number {
    return this.context.config.maxAttachmentBytes;
  }

  unreadCount(accountIds?: string[]): number {
    const folders = this.options.cache.listFolders();
    return this.accounts()
      .filter((account) => !accountIds?.length || accountIds.includes(account.id))
      .reduce((total, account) => {
        const inbox = folders.find(
          (folder) => folder.accountId === account.id && folder.role === "inbox",
        );
        return total + (inbox?.unreadCount ?? this.options.cache.unreadCount([account.id]));
      }, 0);
  }

  async bootstrap(sync: BootstrapState["sync"]): Promise<Omit<BootstrapState, "preferences">> {
    const store = this.assertStoreCompatible();
    const accounts = this.accounts();
    this.reconcileCachedAccounts(accounts);
    const [folders, license] = await Promise.all([
      this.folders().catch(() => this.options.cache.listFolders()),
      Promise.resolve(this.license()),
    ]);
    return {
      engine: {
        version: this.fluxmail.VERSION,
        storeFormat: store.storeFormat,
        minimumSupportedFormat: store.minimumSupportedFormat,
        maximumSupportedFormat: store.maximumSupportedFormat,
      },
      accounts,
      folders,
      unreadCount: this.unreadCount(),
      draftCount: this.options.cache.draftCount(),
      countsByAccount: Object.fromEntries(
        accounts.map((account) => [
          account.id,
          {
            unreadCount: this.unreadCount([account.id]),
            draftCount: this.options.cache.draftCount([account.id]),
          },
        ]),
      ),
      sync,
      telemetry: this.options.analytics.status(),
      license,
    };
  }

  async folders(force = false): Promise<FolderInfo[]> {
    const cached = this.options.cache.listFolders();
    if (cached.length && !force) return cached;
    this.assertStoreCompatible();
    const accounts = this.accounts();
    const cacheGeneration = this.cacheGeneration;
    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const folders = await this.context.service.listFolders(account.id);
        if (cacheGeneration !== this.cacheGeneration) return [];
        this.options.cache.putFolders(account.id, folders);
        return folders.map((folder) => ({ ...folder, accountId: account.id }));
      }),
    );
    const fresh = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    const freshAccountIds = new Set(fresh.map((folder) => folder.accountId));
    const fallback = cached.filter((folder) => !freshAccountIds.has(folder.accountId));
    if (fresh.length || fallback.length || !accounts.length) return [...fresh, ...fallback];
    const failure = results.find((result) => result.status === "rejected");
    throw failure?.reason ?? new Error("Fluxmail could not load folders.");
  }

  license(): BootstrapState["license"] {
    this.refreshImageRelayLicenseInBackground();
    const entitlements = this.fluxmail.getEntitlements(this.context.db);
    const state = this.fluxmail.checkLicenseState(this.context.db);
    return {
      plan: entitlements.plan,
      maxMembers: entitlements.maxMembers,
      maxAccounts: entitlements.maxAccounts,
      canUsePrivateImageRelay:
        !this.imageRelayAccessDeniedByServer &&
        entitlements.licensed &&
        !entitlements.inGrace &&
        PRIVATE_IMAGE_RELAY_PLANS.has(entitlements.plan),
      ...(state.warning ? { warning: state.warning } : {}),
    };
  }

  async activateLicense(rawKey: string): Promise<LicenseActivationResult> {
    this.assertStoreCompatible();
    const licenseKey = rawKey.trim();
    if (!this.fluxmail.LICENSE_KEY_PATTERN.test(licenseKey)) {
      throw new Error("That license key does not look right. Check it and try again.");
    }
    if (this.context.config.licenseKeyFromEnvironment) {
      throw new Error(
        "This license is managed by FLUXMAIL_LICENSE_KEY. Remove that setting before activating a different key.",
      );
    }

    const result = await this.fluxmail.refreshLicense(this.context.db, {
      licenseKey,
      serverUrl: this.context.config.licenseServerUrl,
      dataDir: this.context.config.dataDir,
    });
    if (result.outcome !== "refreshed" && result.outcome !== "outage") {
      throw new Error(licenseActivationError(result.outcome));
    }
    if (result.outcome === "refreshed") this.imageRelayAccessDeniedByServer = false;

    this.context.configuration.setLicenseKey(licenseKey);
    this.context.licenseController.wake();
    return {
      outcome: result.outcome === "refreshed" ? "activated" : "saved_for_retry",
      license: this.license(),
    };
  }

  private refreshImageRelayLicenseInBackground(): void {
    if (this.imageRelayLicenseRefresh) return;
    const entitlements = this.fluxmail.getEntitlements(this.context.db);
    if (entitlements.licensed && !entitlements.inGrace && !this.imageRelayAccessDeniedByServer)
      return;
    if (!this.context.licenseController.configuredKey()) return;

    this.imageRelayLicenseRefresh = this.context.licenseController
      .refreshNow()
      .then((result) => {
        if (result?.outcome === "refreshed") {
          this.imageRelayAccessDeniedByServer = false;
          this.options.onLicenseChanged();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        this.imageRelayLicenseRefresh = undefined;
      });
  }

  async connectGmail(accountId?: string): Promise<AccountInfo> {
    this.assertStoreCompatible();
    const config = this.context.config.google;
    if (!config) {
      throw new Error(
        "This build is missing Google OAuth settings. Set up the desktop OAuth client and rebuild Fluxmail.",
      );
    }
    if (this.googleOAuthAttempt) throw new Error("Google sign-in is already open in your browser.");
    this.googleOAuthAttempt = runGoogleOAuth({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      port: this.context.config.oauthPort,
      allowPermanentDelete: googleOAuthClientAllowsPermanentDelete(config.clientId),
      openExternal: this.options.openExternal,
    });
    let identity: Awaited<ReturnType<typeof runGoogleOAuth>>;
    try {
      identity = await this.googleOAuthAttempt;
    } finally {
      this.googleOAuthAttempt = undefined;
    }
    const existing = accountId ? this.context.registry.getAccount(accountId) : undefined;
    if (existing && existing.email.toLowerCase() !== identity.email.toLowerCase()) {
      throw new Error(`Choose ${existing.email} in Google to reconnect this account.`);
    }
    this.assertStoreCompatible();
    const members = this.fluxmail.listMembers(this.context.db);
    const owner =
      members[0] ??
      this.fluxmail.addMember(this.context.db, {
        name: identity.displayName || identity.email.split("@")[0] || "Fluxmail user",
        email: identity.email,
      });
    const account = this.context.registry.addGmailAccount(
      identity.email,
      identity.tokens,
      identity.displayName,
      owner.id,
      { sharedWithAll: false },
    );
    return toAccountInfo(account, identity.canPermanentlyDelete);
  }

  removeAccount(accountId: string): void {
    this.assertStoreCompatible();
    this.context.registry.removeAccount(accountId);
    this.options.cache.deleteAccount(accountId);
    this.options.onCacheChanged();
  }

  async listThreads(rawInput: ThreadListInput, forceProviderSearch = false): Promise<ThreadPage> {
    const input = { pageSize: 100, ...rawInput };
    this.reconcileCachedAccounts(this.accounts());
    const currentViewKey = viewKey(input);
    return this.measure(forceProviderSearch ? "search" : "list_threads", async () => {
      const refreshKey = backgroundRefreshKey(input);
      if (input.cursor) await this.backgroundViewRefreshes.get(refreshKey);
      const offset = parseCursor(input.cursor);
      const accounts = this.accountsFor(input);
      const listInput = {
        view: input.view,
        accountIds: input.accountIds,
        label: input.label,
        query: input.query,
        resultSetKey: currentViewKey,
      };
      const cachedBeforeSync = this.options.cache.listThreads({
        ...listInput,
        offset,
        limit: input.pageSize,
      });
      const cacheHit = cachedBeforeSync.length > 0;
      const needsInitialPage = accounts.some(
        (account) => !this.options.cache.getPageState(account.id, currentViewKey).initialized,
      );
      if (forceProviderSearch || input.refresh || needsInitialPage) {
        try {
          await this.syncView(input, forceProviderSearch ? "manual" : "startup", "refresh");
        } catch (error) {
          if (!cacheHit) throw error;
        }
      } else if (input.backgroundRefresh) {
        this.refreshViewInBackground(input, refreshKey);
      }

      let totalCount = this.options.cache.countThreads(listInput);
      while (totalCount <= offset && this.hasNextPage(accounts, currentViewKey)) {
        await this.syncView(input, forceProviderSearch ? "manual" : "startup", "loadMore");
        totalCount = this.options.cache.countThreads(listInput);
      }

      const items = this.options.cache.listThreads({
        ...listInput,
        offset,
        limit: input.pageSize,
      });
      totalCount = this.options.cache.countThreads(listInput);
      const loadedThrough = offset + items.length;
      const hasMore = totalCount > loadedThrough || this.hasNextPage(accounts, currentViewKey);
      return {
        value: {
          items,
          totalCount,
          ...(hasMore && items.length ? { nextCursor: String(loadedThrough) } : {}),
          syncing: false,
        },
        cacheStatus: cacheHit ? (forceProviderSearch ? "mixed" : "hit") : "miss",
      };
    });
  }

  async getThread(accountId: string, threadId: string): Promise<MailThread> {
    return this.measure("get_thread", async () => {
      const cached = this.options.cache.getThread(accountId, threadId);
      if (cached) return { value: cached, cacheStatus: "hit" as const };
      const account = this.requireAccount(accountId);
      const thread = await this.context.service.getThread(accountId, threadId);
      return {
        value: this.options.cache.putThread(account, thread),
        cacheStatus: "miss" as const,
      };
    });
  }

  async modify(
    targets: Array<{ accountId: string; threadId: string }>,
    action: ModifyActionInput,
  ): Promise<void> {
    this.cacheGeneration += 1;
    try {
      if (action.type === "discardDraft") {
        await this.discardDrafts(targets);
        return;
      }
      await this.measure("modify", async () => {
        const completeThreads = await Promise.all(
          targets.map(async (target) => {
            const account = this.requireAccount(target.accountId);
            const thread = await this.context.service.getThread(target.accountId, target.threadId);
            this.options.cache.putThread(account, thread);
            return { target, thread };
          }),
        );
        const snapshots = targets.map((target) => ({
          target,
          row: this.options.cache.snapshotThread(target.accountId, target.threadId),
        }));
        const groups = new Map<string, Set<string>>();
        for (const { target, thread } of completeThreads) {
          const ids = groups.get(target.accountId) ?? new Set<string>();
          for (const message of thread.messages) ids.add(message.id);
          groups.set(target.accountId, ids);
        }
        for (const target of targets)
          this.options.cache.applyAction(target.accountId, target.threadId, action);
        this.options.onCacheChanged();
        const groupEntries = [...groups];
        const mutationResults = await Promise.allSettled(
          groupEntries.map(async ([accountId, ids]) => {
            await this.context.service.modify(accountId, [...ids], toModifyAction(action));
            return accountId;
          }),
        );
        const failedAccountIds = new Set(
          mutationResults.flatMap((result, index) =>
            result.status === "rejected" ? [groupEntries[index]![0]] : [],
          ),
        );
        await Promise.all(
          snapshots
            .filter((snapshot) => failedAccountIds.has(snapshot.target.accountId))
            .map(async (snapshot) => {
              try {
                const thread = await this.context.service.getThread(
                  snapshot.target.accountId,
                  snapshot.target.threadId,
                );
                this.options.cache.putThread(
                  this.requireAccount(snapshot.target.accountId),
                  thread,
                );
              } catch (error) {
                if (isEmailError(error) && error.code === "not_found") {
                  this.options.cache.finalizeDelete(
                    snapshot.target.accountId,
                    snapshot.target.threadId,
                  );
                } else if (snapshot.row) {
                  this.options.cache.restoreThread(snapshot.row);
                }
              }
            }),
        );
        const successfulTargets = targets.filter(
          (target) => !failedAccountIds.has(target.accountId),
        );
        if (action.type === "delete") {
          for (const target of successfulTargets)
            this.options.cache.finalizeDelete(target.accountId, target.threadId);
        } else {
          await Promise.allSettled(
            successfulTargets.map(async (target) => {
              const thread = await this.context.service.getThread(
                target.accountId,
                target.threadId,
              );
              this.options.cache.putThread(this.requireAccount(target.accountId), thread);
            }),
          );
        }
        await this.folders(true).catch(() => []);
        this.options.onCacheChanged();
        const failure = mutationResults.find((result) => result.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        return { value: undefined };
      });
    } finally {
      this.cacheGeneration += 1;
    }
  }

  private async discardDrafts(
    targets: Array<{ accountId: string; threadId: string }>,
  ): Promise<void> {
    await this.measure("modify", async () => {
      const draftEntries = (
        await Promise.all(
          targets.map(async (target) => {
            const account = this.requireAccount(target.accountId);
            const thread = await this.context.service.getThread(target.accountId, target.threadId);
            const draftIds = thread.messages.flatMap((message) =>
              message.flags.draft && message.draftId ? [message.draftId] : [],
            );
            if (!draftIds.length) throw new Error("This draft is no longer available.");
            return [...new Set(draftIds)].map((draftId) => ({ account, draftId }));
          }),
        )
      ).flat();
      const drafts = [
        ...new Map(
          draftEntries.map((draft) => [`${draft.account.id}:${draft.draftId}`, draft]),
        ).values(),
      ];
      const results = await Promise.allSettled(
        drafts.map(async ({ account, draftId }) => {
          await this.context.service.deleteDraft(account.id, draftId);
          this.options.cache.deleteDraft(account, draftId);
        }),
      );
      if (results.some((result) => result.status === "fulfilled")) this.options.onCacheChanged();
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
      return { value: undefined };
    });
  }

  async saveDraft(input: ComposeInput): Promise<{ draftId: string; messageId: string }> {
    return this.measure("save_draft", async () => {
      const payload = await this.toSendInput(input);
      const draft = input.draftId
        ? await this.context.service.updateDraft(input.accountId, input.draftId, payload)
        : await this.context.service.createDraft(input.accountId, payload);
      if (!draft.draftId) throw new Error("Gmail did not return a draft ID.");
      this.options.cache.putMessages(this.requireAccount(input.accountId), [draft], {
        invalidateBodies: true,
      });
      this.includeThreadInViews(input.accountId, draft.threadId, ["drafts", "all"]);
      this.options.onCacheChanged();
      return { value: { draftId: draft.draftId, messageId: draft.id } };
    });
  }

  async deleteDraft(accountId: string, draftId: string): Promise<void> {
    await this.measure("delete_draft", async () => {
      await this.context.service.deleteDraft(accountId, draftId);
      this.options.cache.deleteDraft(this.requireAccount(accountId), draftId);
      this.options.onCacheChanged();
      return { value: undefined };
    });
  }

  async send(input: ComposeInput): Promise<{ id: string; threadId: string }> {
    return this.measure("send", async () => {
      let result: { id: string; threadId: string };
      if (input.draftId) {
        const account = this.requireAccount(input.accountId);
        const draft = await this.context.service.updateDraft(
          input.accountId,
          input.draftId,
          await this.toSendInput(input),
        );
        this.options.cache.putMessages(account, [draft], {
          invalidateBodies: true,
        });
        result = await this.context.service.send(input.accountId, {
          draftId: input.draftId,
        });
        this.options.cache.deleteDraft(account, input.draftId);
      } else {
        result = await this.context.service.send(input.accountId, await this.toSendInput(input));
      }
      try {
        const thread = await this.context.service.getThread(input.accountId, result.threadId);
        this.options.cache.putThread(this.requireAccount(input.accountId), thread);
        this.includeThreadInViews(input.accountId, result.threadId, ["sent", "all"]);
      } catch {
        this.options.cache.invalidateThread(input.accountId, result.threadId);
      }
      this.options.onCacheChanged();
      return { value: { id: result.id, threadId: result.threadId } };
    });
  }

  async forward(input: {
    accountId: string;
    messageId: string;
    to: Address[];
    cc?: Address[];
    bcc?: Address[];
    subject: string;
    comment?: string;
    text?: string;
    html?: string;
    attachments?: ComposeAttachment[];
    includeAttachments?: boolean;
  }): Promise<void> {
    await this.measure("forward", async () => {
      const original = await this.context.service.getMessage(input.accountId, input.messageId);
      const originalAttachments = input.includeAttachments
        ? await Promise.all(
            (original.attachments ?? []).map(async (attachment) => {
              const result = await this.context.service.getAttachment(
                input.accountId,
                original.id,
                attachment.id,
                this.context.config.maxAttachmentBytes,
              );
              return {
                filename: result.meta.filename,
                mimeType: result.meta.mimeType,
                content: result.content.toString("base64"),
                ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
                ...(attachment.disposition ? { disposition: attachment.disposition } : {}),
              } satisfies AttachmentInput;
            }),
          )
        : [];
      const addedAttachments = input.attachments?.length
        ? await Promise.all(
            input.attachments.map((attachment) => this.options.resolveAttachment(attachment)),
          )
        : [];
      const result = await this.context.service.send(input.accountId, {
        to: input.to,
        ...(input.cc?.length ? { cc: input.cc } : {}),
        ...(input.bcc?.length ? { bcc: input.bcc } : {}),
        subject: input.subject,
        body: forwardBody(original, input.text ?? input.comment, input.html),
        ...(originalAttachments.length || addedAttachments.length
          ? { attachments: [...originalAttachments, ...addedAttachments] }
          : {}),
      });
      try {
        const thread = await this.context.service.getThread(input.accountId, result.threadId);
        this.options.cache.putThread(this.requireAccount(input.accountId), thread);
        this.includeThreadInViews(input.accountId, result.threadId, ["sent", "all"]);
      } catch {
        this.options.cache.invalidateThread(input.accountId, result.threadId);
      }
      this.options.onCacheChanged();
      return { value: undefined };
    });
  }

  async attachment(
    accountId: string,
    messageId: string,
    attachmentId: string,
  ): Promise<{
    meta: { filename: string; mimeType: string };
    content: Buffer;
  }> {
    return this.measure("download_attachment", async () => ({
      value: await this.context.service.getAttachment(
        accountId,
        messageId,
        attachmentId,
        this.context.config.maxAttachmentBytes,
      ),
    }));
  }

  async refresh(
    trigger: SyncTrigger = "manual",
    activeInput: ThreadListInput = { view: "inbox" },
  ): Promise<number> {
    const started = performance.now();
    try {
      this.assertStoreCompatible();
      this.reconcileCachedAccounts(this.accounts());
      await this.folders(true);
      const inboxInput: ThreadListInput = { view: "inbox", pageSize: 100 };
      const draftInput: ThreadListInput = { view: "drafts", pageSize: 100 };
      const activeViewKey = viewKey(activeInput);
      let count = await this.syncView(inboxInput, trigger, "refresh");
      let draftsSynced = false;
      if (["startup", "manual", "resume", "mutation"].includes(trigger)) {
        try {
          count += await this.syncCompleteView(draftInput, trigger);
          draftsSynced = true;
        } catch {
          // Draft counts are supplemental unless Drafts is the active mailbox.
        }
      }
      if (
        activeViewKey !== viewKey(inboxInput) &&
        !(draftsSynced && activeViewKey === viewKey(draftInput))
      ) {
        count +=
          activeInput.view === "drafts"
            ? await this.syncCompleteView(activeInput, trigger)
            : await this.syncView(activeInput, trigger, "refresh");
      }
      this.options.analytics.captureSync({
        trigger,
        outcome: "success",
        durationMs: performance.now() - started,
        itemCount: count,
      });
      return count;
    } catch (error) {
      this.options.analytics.captureSync({
        trigger,
        outcome: "error",
        durationMs: performance.now() - started,
        itemCount: 0,
      });
      throw error;
    }
  }

  private async syncCompleteView(input: ThreadListInput, trigger: SyncTrigger): Promise<number> {
    const refreshedAccounts = new Set<string>();
    let count = await this.syncView(input, trigger, "refresh", refreshedAccounts);
    const accounts = this.accountsFor(input);
    const currentViewKey = viewKey(input);
    while (this.hasNextPage(accounts, currentViewKey))
      count += await this.syncView(input, trigger, "loadMore");
    const role = reconciledFolderRole(input);
    if (role)
      for (const account of accounts)
        if (refreshedAccounts.has(account.id))
          this.options.cache.reconcileCompleteView(account, currentViewKey, role);
    return count;
  }

  private async syncView(
    input: ThreadListInput,
    trigger: SyncTrigger,
    mode: "refresh" | "loadMore",
    refreshedAccounts?: Set<string>,
  ): Promise<number> {
    const accounts = this.accountsFor(input);
    const query = toEmailQuery(input);
    const currentViewKey = viewKey(input);
    const refreshGeneration = mode === "refresh" ? (this.viewRefreshGeneration += 1) : undefined;
    const pageResults = await Promise.allSettled(
      accounts.map(async (account) => {
        const cacheGeneration = this.cacheGeneration;
        const currentAccountViewKey = accountViewKey(account.id, currentViewKey);
        const committedRefreshGeneration = this.committedViewRefreshes.get(currentAccountViewKey);
        const pageState = this.options.cache.getPageState(account.id, currentViewKey);
        if (mode === "loadMore" && pageState.initialized && !pageState.nextToken) return undefined;
        const token = mode === "loadMore" ? pageState.nextToken : undefined;
        const page = await this.context.service.listMessages(account.id, query, {
          pageSize: input.pageSize ?? 100,
          ...(token ? { pageToken: token } : {}),
        });
        if (cacheGeneration !== this.cacheGeneration) return undefined;
        if (
          refreshGeneration !== undefined
            ? refreshGeneration < (this.committedViewRefreshes.get(currentAccountViewKey) ?? 0)
            : committedRefreshGeneration !== this.committedViewRefreshes.get(currentAccountViewKey)
        )
          return undefined;
        this.options.cache.putMessages(account, page.items);
        this.options.cache.recordResultPage(
          account.id,
          currentViewKey,
          page.items.map((message) => message.threadId),
          mode === "refresh",
        );
        const folderRole = reconciledFolderRole(input);
        if (mode === "refresh" && folderRole)
          this.options.cache.reconcileFolderPage(
            account,
            folderRole,
            page.items,
            !page.nextPageToken,
          );
        this.options.cache.setPageToken(account.id, currentViewKey, page.nextPageToken);
        if (mode === "refresh") refreshedAccounts?.add(account.id);
        if (input.view === "inbox" && mode === "refresh") {
          const notification = this.options.cache.recordInboxPage(account.id, page.items);
          const newMessages = notification.newMessages.filter(
            (message) => message.from?.email.toLowerCase() !== account.email.toLowerCase(),
          );
          if (newMessages.length) this.options.onNewMessages(newMessages, account);
        }
        if (refreshGeneration !== undefined)
          this.committedViewRefreshes.set(currentAccountViewKey, refreshGeneration);
        return page.items.length;
      }),
    );
    const pages = pageResults.flatMap((result) =>
      result.status === "fulfilled" && result.value !== undefined ? [result.value] : [],
    );
    const failure = pageResults.find((result) => result.status === "rejected");
    if (!pages.length && failure) throw failure.reason;
    if (pages.length) this.options.onCacheChanged();
    return pages.reduce((sum, value) => sum + value, 0);
  }

  private accountsFor(input: ThreadListInput): AccountInfo[] {
    return this.accounts().filter(
      (account) => !input.accountIds?.length || input.accountIds.includes(account.id),
    );
  }

  private reconcileCachedAccounts(accounts: AccountInfo[]): void {
    const connected = new Set(accounts.map((account) => account.id));
    for (const accountId of this.options.cache.accountIds())
      if (!connected.has(accountId)) this.options.cache.deleteAccount(accountId);
  }

  private hasNextPage(accounts: AccountInfo[], currentViewKey: string): boolean {
    return accounts.some(
      (account) => this.options.cache.getPageState(account.id, currentViewKey).nextToken,
    );
  }

  private refreshViewInBackground(input: ThreadListInput, refreshKey: string): void {
    if (this.backgroundViewRefreshes.has(refreshKey)) return;
    const refresh = this.syncView(input, "startup", "refresh")
      .then(() => undefined)
      .catch(() => undefined)
      .finally(() => {
        if (this.backgroundViewRefreshes.get(refreshKey) === refresh)
          this.backgroundViewRefreshes.delete(refreshKey);
      });
    this.backgroundViewRefreshes.set(refreshKey, refresh);
  }

  private includeThreadInViews(accountId: string, threadId: string, views: MailboxView[]): void {
    for (const view of views)
      this.options.cache.recordResultPage(accountId, viewKey({ view }), [threadId], false);
  }

  private requireAccount(accountId: string): AccountInfo {
    const account = this.accounts().find((candidate) => candidate.id === accountId);
    if (!account) throw new Error("This email account is no longer connected.");
    return account;
  }

  private async toSendInput(input: ComposeInput): Promise<SendInput> {
    const attachments = input.attachments?.length
      ? await Promise.all(
          input.attachments.map((attachment) => this.options.resolveAttachment(attachment)),
        )
      : undefined;
    return {
      to: input.to,
      ...(input.cc?.length ? { cc: input.cc } : {}),
      ...(input.bcc?.length ? { bcc: input.bcc } : {}),
      subject: input.subject,
      body: {
        ...(input.text ? { text: input.text } : {}),
        ...(input.html ? { html: input.html } : {}),
      },
      ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      ...(input.replyAll ? { replyAll: true } : {}),
      ...(attachments?.length ? { attachments } : {}),
    };
  }

  private async measure<T>(
    operation: MailOperation,
    work: () => Promise<{ value: T; cacheStatus?: "hit" | "miss" | "mixed" }>,
  ): Promise<T> {
    const started = performance.now();
    try {
      this.assertStoreCompatible();
      const result = await work();
      this.options.analytics.captureOperation({
        operation,
        outcome: "success",
        durationMs: performance.now() - started,
        cacheStatus: result.cacheStatus,
      });
      return result.value;
    } catch (error) {
      this.options.analytics.captureOperation({
        operation,
        outcome: "error",
        errorCode: isEmailError(error) ? error.code : "desktop_error",
        durationMs: performance.now() - started,
      });
      throw error;
    }
  }

  private assertStoreCompatible(): StoreCompatibility {
    const compatibility = this.fluxmail.inspectStoreCompatibility(
      this.context.config.dbPath,
      this.context.config.dataDir,
    );
    if (compatibility.compatible) return compatibility;
    this.context.scheduler.stop();
    this.context.licenseController.stop();
    throw new this.fluxmail.IncompatibleStoreError(compatibility);
  }
}

function licenseActivationError(
  outcome: "invalid_key" | "not_found" | "inactive" | "in_use" | "bad_lease",
): string {
  const messages = {
    invalid_key: "That license key is invalid. Check it for typos.",
    not_found: "That license key is invalid. Check it for typos.",
    inactive: "That license is no longer active.",
    in_use:
      "This license is active on another Fluxmail instance. Deactivate it there first, or manage instances from your Fluxmail account.",
    bad_lease: "Fluxmail could not verify the license response. Update Fluxmail and try again.",
  } as const;
  return messages[outcome];
}

function forwardBody(
  original: Message,
  text?: string,
  html?: string,
): NonNullable<Message["body"]> {
  const comment = text?.trim() ? text : undefined;
  const body = buildForwardBody(original, comment);
  if (!comment || !html) return body;
  const forwarded = buildForwardBody(original);
  body.html = `${html}${
    forwarded.html ?? `<div style="white-space:pre-wrap">${escapeHtml(forwarded.text ?? "")}</div>`
  }`;
  return body;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
}

function toAccountInfo(
  account: ReturnType<AppContext["registry"]["getAccount"]>,
  canPermanentlyDelete: boolean,
): AccountInfo {
  return {
    id: account.id,
    email: account.email,
    ...(account.displayName ? { displayName: account.displayName } : {}),
    provider: account.provider,
    status: account.status,
    canPermanentlyDelete,
  };
}

function toModifyAction(action: ModifyActionInput): ModifyAction {
  if (action.type === "discardDraft")
    throw new Error("Drafts must use the draft discard operation.");
  if (action.type === "move") return { move: action.folder };
  if (action.type === "addLabels") return { addLabels: action.labels };
  if (action.type === "removeLabels") return { removeLabels: action.labels };
  return action.type;
}

function parseCursor(cursor: string | undefined): number {
  const value = Number(cursor ?? 0);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function reconciledFolderRole(
  input: ThreadListInput,
): "inbox" | "sent" | "drafts" | "spam" | "trash" | undefined {
  if (input.query || input.label) return undefined;
  if (["inbox", "sent", "drafts", "spam", "trash"].includes(input.view))
    return input.view as "inbox" | "sent" | "drafts" | "spam" | "trash";
  return undefined;
}

function viewKey(input: ThreadListInput): string {
  return `${input.view}:${input.label ?? ""}:${input.query ?? ""}`;
}

function accountViewKey(accountId: string, currentViewKey: string): string {
  return JSON.stringify([accountId, currentViewKey]);
}

function backgroundRefreshKey(input: ThreadListInput): string {
  return JSON.stringify([viewKey(input), [...(input.accountIds ?? [])].sort()]);
}

export function shouldUseBundledGoogleConfig(
  existingClientId: string | undefined,
  existingClientSecret: string | undefined,
  bundledClientId: string,
  bundledClientSecret: string,
): boolean {
  return Boolean(
    bundledClientId && bundledClientSecret && (!existingClientId || !existingClientSecret),
  );
}

type FluxmailConfigurationModule = Pick<
  typeof import("fluxmail"),
  "IncompatibleStoreError" | "inspectStoreCompatibility" | "resolveStoreLocation"
>;

export function prepareFluxmailConfiguration(
  fluxmail: FluxmailConfigurationModule,
  bundledClientId: string,
  bundledClientSecret: string,
): boolean {
  const storeLocation = fluxmail.resolveStoreLocation();
  const compatibility = fluxmail.inspectStoreCompatibility(
    storeLocation.dbPath,
    storeLocation.dataDir,
  );
  if (!compatibility.compatible) throw new fluxmail.IncompatibleStoreError(compatibility);

  const existingClientId = process.env.GOOGLE_CLIENT_ID;
  const existingClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (
    !shouldUseBundledGoogleConfig(
      existingClientId,
      existingClientSecret,
      bundledClientId,
      bundledClientSecret,
    )
  )
    return false;

  if (existingClientId || existingClientSecret) {
    process.env.GOOGLE_CLIENT_ID = bundledClientId;
    process.env.GOOGLE_CLIENT_SECRET = bundledClientSecret;
    return false;
  }

  return true;
}
