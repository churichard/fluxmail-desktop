import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AppError,
  AppEvent,
  BootstrapState,
  MailboxView,
  ModifyActionInput,
  ThreadPage,
  ThreadSummary,
} from "../shared/contracts";
import { Sidebar } from "./components/Sidebar";
import { ThreadListPane } from "./components/ThreadListPane";
import { ReadingPane } from "./components/ReadingPane";
import {
  ComposeDialog,
  type ComposeDialogHandle,
  type ComposeSeed,
} from "./components/ComposeDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { Onboarding } from "./components/Onboarding";
import { FluxmailLogoMark } from "./components/FluxmailLogoMark";
import { mailboxDeleteAction, mailboxMoveAction } from "./mail-actions";

const DEFAULT_PAGE_SIZE = 100;

export function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapState | null>(null);
  const [view, setView] = useState<MailboxView>("inbox");
  const [label, setLabel] = useState<string>();
  const [accountId, setAccountId] = useState<string>();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [selectedThread, setSelectedThread] = useState<ThreadSummary>();
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchText, setSearchText] = useState("");
  const deferredSearch = useDeferredValue(searchText);
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);
  const [quickReplyDiscardVersion, setQuickReplyDiscardVersion] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [startupError, setStartupError] = useState<AppError>();
  const [sidebarWidth, setSidebarWidth] = useState(228);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [listWidth, setListWidth] = useState(410);
  const searchRef = useRef<HTMLInputElement>(null);
  const composeDialogRef = useRef<ComposeDialogHandle>(null);
  const refreshTimer = useRef<number | undefined>(undefined);
  const listRequest = useRef(0);
  const openThreadRequest = useRef(0);
  const quickReplyDirty = useRef(false);
  const loadedThreadCount = useRef(DEFAULT_PAGE_SIZE);
  const mailboxContext = JSON.stringify([accountId, label, submittedSearch, view]);
  const mailboxContextRef = useRef(mailboxContext);
  useLayoutEffect(() => {
    mailboxContextRef.current = mailboxContext;
  }, [mailboxContext]);

  const accountIds = useMemo(() => (accountId ? [accountId] : undefined), [accountId]);
  const permanentDeleteAccountIds = useMemo(
    () =>
      new Set(
        (bootstrap?.accounts ?? [])
          .filter((account) => account.canPermanentlyDelete)
          .map((account) => account.id),
      ),
    [bootstrap?.accounts],
  );
  const handleQuickReplyDirtyChange = useCallback((dirty: boolean) => {
    quickReplyDirty.current = dirty;
  }, []);
  const confirmQuickReplyNavigation = useCallback(() => {
    const hasUnsavedReply = quickReplyDirty.current;
    if (!canCloseQuickReply(hasUnsavedReply)) return false;
    if (hasUnsavedReply) setQuickReplyDiscardVersion((current) => current + 1);
    quickReplyDirty.current = false;
    return true;
  }, []);
  const selectedCounts = accountId
    ? (bootstrap?.countsByAccount[accountId] ?? {
        unreadCount: 0,
        draftCount: 0,
      })
    : {
        unreadCount: bootstrap?.unreadCount ?? 0,
        draftCount: bootstrap?.draftCount ?? 0,
      };
  const availableLabels = useMemo(
    () => [
      ...new Set(
        (bootstrap?.folders ?? [])
          .filter((folder) => !folder.role && (!accountId || folder.accountId === accountId))
          .map((folder) => folder.name),
      ),
    ],
    [accountId, bootstrap?.folders],
  );
  const availableSearchAccounts = useMemo(
    () => (bootstrap?.accounts ?? []).filter((account) => !accountId || account.id === accountId),
    [accountId, bootstrap?.accounts],
  );

  const loadBootstrap = useCallback(async () => {
    try {
      const state = await window.fluxmail.bootstrap();
      setBootstrap(state);
      setAccountId((current) => reconcileAccountSelection(current, state.accounts));
    } catch (caught) {
      setStartupError(errorDetails(caught));
    }
  }, []);

  const refreshMail = useCallback(async () => {
    try {
      await window.fluxmail.sync.refresh({
        view: submittedSearch ? "search" : view,
        accountIds,
        label,
        query: submittedSearch || undefined,
        pageSize: DEFAULT_PAGE_SIZE,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, [accountIds, label, submittedSearch, view]);

  const loadThreads = useCallback(
    async (options?: {
      append?: boolean;
      forceSearch?: boolean;
      quiet?: boolean;
      refresh?: boolean;
      backgroundRefresh?: boolean;
      preservePages?: boolean;
      preserveSelection?: boolean;
    }) => {
      if (mailboxContext !== mailboxContextRef.current) return;
      const append = options?.append ?? false;
      const quiet = options?.quiet ?? false;
      const request = ++listRequest.current;
      if (append) setLoadingMore(true);
      else if (!quiet) setLoading(true);
      try {
        const input = {
          view: submittedSearch ? ("search" as const) : view,
          accountIds,
          label,
          query: submittedSearch || undefined,
          refresh: options?.refresh,
          backgroundRefresh: options?.backgroundRefresh,
          cursor: append ? cursor : undefined,
          pageSize: DEFAULT_PAGE_SIZE,
        };
        let page = options?.forceSearch
          ? await window.fluxmail.mail.search(input)
          : await window.fluxmail.mail.listThreads(input);
        if (!append && options?.preservePages) {
          page = await loadThreadPages(page, loadedThreadCount.current, async (nextCursor) =>
            window.fluxmail.mail.listThreads({
              ...input,
              refresh: undefined,
              cursor: nextCursor,
            }),
          );
        }
        if (request !== listRequest.current || mailboxContext !== mailboxContextRef.current) return;
        startTransition(() => {
          setThreads((current) => {
            const next = append ? mergeThreads(current, page.items) : page.items;
            loadedThreadCount.current = Math.max(DEFAULT_PAGE_SIZE, next.length);
            return next;
          });
          if (!append)
            setSelectedThread((current) =>
              current
                ? (page.items.find((thread) => threadKey(thread) === threadKey(current)) ??
                  (options?.preserveSelection ? current : undefined))
                : current,
            );
          setCursor(page.nextCursor);
        });
      } catch (caught) {
        if (request !== listRequest.current || mailboxContext !== mailboxContextRef.current) return;
        setError(errorMessage(caught));
      } finally {
        if (request === listRequest.current && mailboxContext === mailboxContextRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [accountIds, cursor, label, mailboxContext, submittedSearch, view],
  );

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const appearance = bootstrap?.preferences.appearance;
    if (!appearance) return;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved =
        appearance === "system" ? (systemTheme.matches ? "dark" : "light") : appearance;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    if (appearance !== "system") return;
    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [bootstrap?.preferences.appearance]);

  useEffect(() => {
    openThreadRequest.current += 1;
    if (!bootstrap?.accounts.length) return;
    setThreads([]);
    loadedThreadCount.current = DEFAULT_PAGE_SIZE;
    setCursor(undefined);
    setSelection(new Set());
    setSelectedThread(undefined);
    void loadThreads({
      forceSearch: Boolean(submittedSearch),
      backgroundRefresh: !submittedSearch && view !== "inbox",
    });
  }, [accountId, bootstrap?.accounts.length, label, submittedSearch, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = window.fluxmail.onEvent((event: AppEvent) => {
      if (event.type === "sync-status")
        setBootstrap((current) => (current ? { ...current, sync: event.state } : current));
      if (event.type === "accounts-changed" || event.type === "license-changed")
        void loadBootstrap();
      if (event.type === "window-close-requested") {
        const composeDialog = composeDialogRef.current;
        if (!composeDialog) {
          if (canCloseQuickReply(quickReplyDirty.current)) {
            void window.fluxmail.system.confirmWindowClose();
          } else {
            void window.fluxmail.system.cancelWindowClose();
          }
        } else {
          void composeDialog.close().then((closed) => {
            if (closed) void window.fluxmail.system.confirmWindowClose();
            else void window.fluxmail.system.cancelWindowClose();
          });
        }
      }
      if (event.type === "cache-changed") {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = window.setTimeout(() => {
          void loadBootstrap();
          void loadThreads({ quiet: true, preservePages: true, preserveSelection: true });
        }, 120);
      }
    });
    return () => {
      window.clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [loadBootstrap, loadThreads]);

  const openCompose = useCallback(() => {
    if (!confirmQuickReplyNavigation()) return;
    const account = accountId
      ? bootstrap?.accounts.find((candidate) => candidate.id === accountId)
      : bootstrap?.accounts[0];
    if (!account) return;
    setComposeSeed({ accountId: account.id });
    void window.fluxmail.analytics
      .trackFeature({ feature: "compose", action: "opened", source: "sidebar" })
      .catch(() => undefined);
  }, [accountId, bootstrap?.accounts, confirmQuickReplyNavigation]);

  const openSeededCompose = useCallback(
    (seed: ComposeSeed) => {
      if (!confirmQuickReplyNavigation()) return;
      setComposeSeed(seed);
    },
    [confirmQuickReplyNavigation],
  );

  const changeAccount = useCallback(
    (nextAccountId?: string) => {
      if (nextAccountId === accountId || !confirmQuickReplyNavigation()) return;
      setAccountId(nextAccountId);
    },
    [accountId, confirmQuickReplyNavigation],
  );

  const changeView = useCallback(
    (nextView: MailboxView, nextLabel?: string) => {
      if (
        (nextView === view && nextLabel === label && !submittedSearch) ||
        !confirmQuickReplyNavigation()
      )
        return;
      setView(nextView);
      setLabel(nextLabel);
      setSubmittedSearch("");
      setSearchText("");
      void window.fluxmail.analytics
        .trackFeature({
          feature: "navigation",
          action: "viewed",
          source: "sidebar",
        })
        .catch(() => undefined);
    },
    [confirmQuickReplyNavigation, label, submittedSearch, view],
  );

  const submitSearch = useCallback(() => {
    const query = searchText.trim();
    if (query === submittedSearch || !confirmQuickReplyNavigation()) return;
    if (!query) {
      setSubmittedSearch("");
      return;
    }
    setSubmittedSearch(query);
    void window.fluxmail.analytics
      .trackFeature({
        feature: "search",
        action: "submitted",
        source: "toolbar",
      })
      .catch(() => undefined);
  }, [confirmQuickReplyNavigation, searchText, submittedSearch]);

  const modify = useCallback(
    async (action: ModifyActionInput, explicit?: ThreadSummary[]) => {
      const targets = explicit ?? threads.filter((thread) => selection.has(threadKey(thread)));
      if (!targets.length) return;
      if (action.type === "delete") {
        if (!window.confirm(permanentDeletePrompt(targets.length))) return;
      }
      const optimisticRemoval = shouldOptimisticallyRemoveFromView(
        submittedSearch ? "search" : view,
        action,
      );
      const previousThreads = threads;
      const previousSelection = selection;
      const previousSelectedThread = selectedThread;
      const targetKeys = new Set(targets.map(threadKey));
      if (
        quickReplyDirty.current &&
        selectedThread &&
        targetKeys.has(threadKey(selectedThread)) &&
        shouldClearSelectedThread(submittedSearch ? "search" : view, action) &&
        !confirmQuickReplyNavigation()
      )
        return;
      const preserveQuickReply = Boolean(
        quickReplyDirty.current && selectedThread && targetKeys.has(threadKey(selectedThread)),
      );

      if (optimisticRemoval) {
        setThreads((current) => current.filter((thread) => !targetKeys.has(threadKey(thread))));
        setSelection((current) => {
          const next = new Set(current);
          for (const key of targetKeys) next.delete(key);
          return next;
        });
        setSelectedThread((current) =>
          current && targetKeys.has(threadKey(current)) ? undefined : current,
        );
      }
      try {
        await window.fluxmail.mail.modify({
          targets: targets.map((thread) => ({
            accountId: thread.accountId,
            threadId: thread.id,
          })),
          action,
        });
        if (!optimisticRemoval && mailboxContext === mailboxContextRef.current)
          setSelection(new Set());
        setSelectedThread((current) => {
          if (!current || !targetKeys.has(threadKey(current))) return current;
          if (action.type === "markRead" || action.type === "markUnread")
            return { ...current, unread: action.type === "markUnread" };
          if (action.type === "star" || action.type === "unstar")
            return { ...current, starred: action.type === "star" };
          if (mailboxContext !== mailboxContextRef.current) return current;
          if (shouldClearSelectedThread(submittedSearch ? "search" : view, action))
            return undefined;
          return current;
        });
        await loadThreads({
          quiet: optimisticRemoval,
          forceSearch: shouldForceProviderSearchAfterMutation(submittedSearch),
          preservePages: preserveQuickReply,
          preserveSelection: preserveQuickReply,
        });
      } catch (caught) {
        if (optimisticRemoval && mailboxContext === mailboxContextRef.current) {
          setThreads(previousThreads);
          setSelection(previousSelection);
          setSelectedThread((current) => current ?? previousSelectedThread);
        }
        setError(errorMessage(caught));
      }
    },
    [
      confirmQuickReplyNavigation,
      loadThreads,
      mailboxContext,
      selectedThread,
      selection,
      submittedSearch,
      threads,
      view,
    ],
  );

  const openThread = useCallback(
    async (thread: ThreadSummary) => {
      const changesThread =
        thread.draft || !selectedThread || threadKey(selectedThread) !== threadKey(thread);
      if (changesThread && !confirmQuickReplyNavigation()) return;
      const request = ++openThreadRequest.current;
      if (thread.draft) {
        try {
          const detail = await window.fluxmail.mail.getThread({
            accountId: thread.accountId,
            threadId: thread.id,
          });
          if (request !== openThreadRequest.current) return;
          const draft = [...detail.messages].reverse().find((message) => message.flags.draft);
          if (!draft?.draftId) throw new Error("Fluxmail could not find this draft.");
          const attachments = draft.attachments?.length
            ? await window.fluxmail.attachments.prepare({
                accountId: thread.accountId,
                messageId: draft.id,
                attachments: draft.attachments,
              })
            : [];
          if (request !== openThreadRequest.current) {
            if (attachments.length)
              void window.fluxmail.attachments
                .release(attachments.map((attachment) => attachment.token))
                .catch(() => undefined);
            return;
          }
          setComposeSeed({
            accountId: thread.accountId,
            draftId: draft.draftId,
            to: formatAddresses(draft.to),
            cc: formatAddresses(draft.cc),
            bcc: formatAddresses(draft.bcc),
            subject: draft.subject,
            initialHtml: draft.body?.html,
            initialText: draft.body?.text,
            initialAttachments: attachments,
          });
        } catch (caught) {
          if (request === openThreadRequest.current) setError(errorMessage(caught));
        }
        return;
      }
      const openedThread = thread.unread ? { ...thread, unread: false } : thread;
      setSelectedThread(openedThread);
      if (!thread.unread) return;

      setThreads((current) =>
        current.map((candidate) =>
          threadKey(candidate) === threadKey(thread) ? { ...candidate, unread: false } : candidate,
        ),
      );
      if (thread.folderRoles.includes("inbox")) {
        setBootstrap((current) =>
          current ? adjustUnreadCount(current, thread.accountId, -1) : current,
        );
      }
      void window.fluxmail.mail
        .modify({
          targets: [{ accountId: thread.accountId, threadId: thread.id }],
          action: { type: "markRead" },
        })
        .catch((caught) => {
          setThreads((current) =>
            current.map((candidate) =>
              threadKey(candidate) === threadKey(thread)
                ? { ...candidate, unread: true }
                : candidate,
            ),
          );
          setSelectedThread((current) =>
            current && threadKey(current) === threadKey(thread)
              ? { ...current, unread: true }
              : current,
          );
          if (thread.folderRoles.includes("inbox")) {
            setBootstrap((current) =>
              current ? adjustUnreadCount(current, thread.accountId, 1) : current,
            );
          }
          setError(errorMessage(caught));
        });
    },
    [confirmQuickReplyNavigation, selectedThread],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (composeSeed || settingsOpen) return;
      const target = event.target;
      const editing =
        target instanceof Element &&
        Boolean(target.closest('input, textarea, [contenteditable="true"]'));
      if (event.metaKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (event.metaKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refreshMail();
        return;
      }
      if (editing) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "[") {
        event.preventDefault();
        setSidebarCollapsed((current) => !current);
        return;
      }
      const selectedThreads = threads.filter((thread) => selection.has(threadKey(thread)));
      const actionTargets = selectedThreads.length
        ? selectedThreads
        : selectedThread
          ? [selectedThread]
          : undefined;
      if (event.key.toLowerCase() === "c") openCompose();
      const activeView = submittedSearch ? "search" : view;
      if (event.key.toLowerCase() === "e")
        void modify(mailboxMoveAction(activeView), actionTargets);
      const deleteAction = mailboxDeleteAction(
        activeView,
        Boolean(
          actionTargets?.length &&
          actionTargets.every((thread) => permanentDeleteAccountIds.has(thread.accountId)),
        ),
      );
      if (event.key === "#" && deleteAction) void modify(deleteAction, actionTargets);
      if (event.key.toLowerCase() === "s" && selectedThread)
        void modify({ type: selectedThread.starred ? "unstar" : "star" }, [selectedThread]);
      if (event.key.toLowerCase() === "r" && selectedThread)
        openSeededCompose(replySeed(selectedThread));
      if (!event.shiftKey && event.key.toLowerCase() === "u" && actionTargets?.length)
        void modify(
          {
            type: actionTargets.some((thread) => thread.unread) ? "markRead" : "markUnread",
          },
          actionTargets,
        );
      if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") {
        event.preventDefault();
        const currentIndex = selectedThread
          ? threads.findIndex((thread) => threadKey(thread) === threadKey(selectedThread))
          : -1;
        const offset = event.key.toLowerCase() === "j" ? 1 : -1;
        const nextIndex = Math.min(threads.length - 1, Math.max(0, currentIndex + offset));
        if (threads[nextIndex]) void openThread(threads[nextIndex]);
      }
      if (event.key === "/" && !event.metaKey) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    composeSeed,
    modify,
    openCompose,
    openSeededCompose,
    openThread,
    permanentDeleteAccountIds,
    refreshMail,
    selectedThread,
    selection,
    settingsOpen,
    submittedSearch,
    threads,
    view,
  ]);

  if (!bootstrap) return <Splash error={startupError} />;
  if (!bootstrap.accounts.length) {
    return (
      <Onboarding
        onConnected={async () => {
          await loadBootstrap();
          await loadThreads();
        }}
      />
    );
  }
  const imageRelayAvailable = bootstrap.license.canUsePrivateImageRelay;

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      style={
        {
          "--sidebar-width": `${sidebarCollapsed ? 0 : sidebarWidth}px`,
          "--sidebar-divider-width": sidebarCollapsed ? "0px" : "1px",
          "--list-width": `${listWidth}px`,
        } as React.CSSProperties
      }
    >
      <Sidebar
        accounts={bootstrap.accounts}
        folders={bootstrap.folders}
        accountId={accountId}
        activeView={submittedSearch ? "search" : view}
        activeLabel={label}
        unreadCount={selectedCounts.unreadCount}
        draftCount={selectedCounts.draftCount}
        collapsed={sidebarCollapsed}
        onAccountChange={changeAccount}
        onViewChange={changeView}
        onCompose={openCompose}
        onSettings={() => setSettingsOpen(true)}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      {sidebarCollapsed ? (
        <div className="pane-divider" />
      ) : (
        <PaneResizer
          label="Resize sidebar"
          value={sidebarWidth}
          min={188}
          max={320}
          onChange={setSidebarWidth}
        />
      )}
      <ThreadListPane
        view={submittedSearch ? "search" : view}
        title={submittedSearch ? `Search: ${submittedSearch}` : viewTitle(view, label)}
        threads={threads}
        selected={selectedThread}
        selection={selection}
        loading={loading}
        loadingMore={loadingMore}
        hasMore={Boolean(cursor)}
        searchText={searchText}
        deferredSearch={deferredSearch}
        searchRef={searchRef}
        sync={bootstrap.sync}
        labels={availableLabels}
        accounts={availableSearchAccounts}
        permanentDeleteAccountIds={permanentDeleteAccountIds}
        sidebarCollapsed={sidebarCollapsed}
        onSearchText={setSearchText}
        onSearch={submitSearch}
        onSelect={openThread}
        onToggleSelection={(thread) =>
          setSelection((current) => {
            const next = new Set(current);
            const key = threadKey(thread);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
          })
        }
        onToggleSelectAll={() =>
          setSelection((current) => {
            const visibleKeys = threads.map(threadKey);
            const allSelected =
              visibleKeys.length > 0 && visibleKeys.every((key) => current.has(key));
            const next = new Set(current);
            for (const key of visibleKeys) {
              if (allSelected) next.delete(key);
              else next.add(key);
            }
            return next;
          })
        }
        onModify={modify}
        onLoadMore={() => void loadThreads({ append: true })}
        onRefresh={() => void refreshMail()}
        onExpandSidebar={() => setSidebarCollapsed(false)}
        onCompose={openCompose}
      />
      <PaneResizer
        label="Resize message list"
        value={listWidth}
        min={330}
        max={560}
        onChange={setListWidth}
      />
      <ReadingPane
        view={submittedSearch ? "search" : view}
        thread={selectedThread}
        labels={availableLabels}
        allowPermanentDelete={Boolean(
          selectedThread && permanentDeleteAccountIds.has(selectedThread.accountId),
        )}
        blockRemoteImages={bootstrap.preferences.blockRemoteImages}
        imageRelay={bootstrap.preferences.imageRelay}
        imageRelayAvailable={imageRelayAvailable}
        onModify={(action) =>
          selectedThread ? modify(action, [selectedThread]) : Promise.resolve()
        }
        onCompose={openSeededCompose}
        onError={setError}
        onQuickReplyDirtyChange={handleQuickReplyDirtyChange}
        quickReplyDiscardVersion={quickReplyDiscardVersion}
      />
      {composeSeed ? (
        <ComposeDialog
          ref={composeDialogRef}
          seed={composeSeed}
          accounts={bootstrap.accounts}
          blockRemoteImages={bootstrap.preferences.blockRemoteImages}
          imageRelay={bootstrap.preferences.imageRelay}
          imageRelayAvailable={imageRelayAvailable}
          onClose={() => setComposeSeed(null)}
          onSent={() => {
            setComposeSeed(null);
            void loadThreads();
          }}
          onError={setError}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsDialog
          state={bootstrap}
          onClose={() => setSettingsOpen(false)}
          onState={setBootstrap}
          onError={setError}
        />
      ) : null}
      {error ? (
        <div className="toast" role="alert">
          <span>{error}</span>
          <button onClick={() => setError(undefined)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PaneResizer({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
}) {
  return (
    <div
      className="pane-resizer"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(Math.max(min, value - 8));
        if (event.key === "ArrowRight") onChange(Math.min(max, value + 8));
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = value;
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const move = (pointer: PointerEvent) =>
          onChange(Math.min(max, Math.max(min, startWidth + pointer.clientX - startX)));
        const stop = (pointer: PointerEvent) => {
          if (target.hasPointerCapture(pointer.pointerId))
            target.releasePointerCapture(pointer.pointerId);
          target.removeEventListener("pointermove", move);
          target.removeEventListener("pointerup", stop);
          target.removeEventListener("pointercancel", stop);
        };
        target.addEventListener("pointermove", move);
        target.addEventListener("pointerup", stop);
        target.addEventListener("pointercancel", stop);
      }}
    />
  );
}

export function mergeThreads(current: ThreadSummary[], incoming: ThreadSummary[]): ThreadSummary[] {
  const map = new Map(current.map((thread) => [threadKey(thread), thread]));
  for (const thread of incoming) map.set(threadKey(thread), thread);
  return [...map.values()].sort((left, right) => Date.parse(right.date) - Date.parse(left.date));
}

export async function loadThreadPages(
  firstPage: ThreadPage,
  minimumItems: number,
  loadNext: (cursor: string) => Promise<ThreadPage>,
): Promise<ThreadPage> {
  let items = firstPage.items;
  let nextCursor = firstPage.nextCursor;
  let totalCount = firstPage.totalCount;
  while (nextCursor && items.length < minimumItems) {
    const page = await loadNext(nextCursor);
    items = mergeThreads(items, page.items);
    nextCursor = page.nextCursor;
    totalCount = page.totalCount;
  }
  return {
    items,
    totalCount,
    syncing: false,
    ...(nextCursor ? { nextCursor } : {}),
  };
}

export function threadKey(thread: Pick<ThreadSummary, "accountId" | "id">): string {
  return `${thread.accountId}:${thread.id}`;
}

export function reconcileAccountSelection(
  accountId: string | undefined,
  accounts: Array<{ id: string }>,
): string | undefined {
  return accountId && accounts.some((account) => account.id === accountId) ? accountId : undefined;
}

export function adjustUnreadCount(
  state: BootstrapState,
  accountId: string,
  delta: number,
): BootstrapState {
  const accountCounts = state.countsByAccount[accountId];
  return {
    ...state,
    unreadCount: Math.max(0, state.unreadCount + delta),
    countsByAccount: accountCounts
      ? {
          ...state.countsByAccount,
          [accountId]: {
            ...accountCounts,
            unreadCount: Math.max(0, accountCounts.unreadCount + delta),
          },
        }
      : state.countsByAccount,
  };
}

export function shouldOptimisticallyRemoveFromView(
  view: MailboxView,
  action: ModifyActionInput,
): boolean {
  return (
    (view === "inbox" && action.type === "archive") ||
    (view === "drafts" && action.type === "discardDraft") ||
    (view === "trash" && ["untrash", "delete"].includes(action.type))
  );
}

export function shouldClearSelectedThread(view: MailboxView, action: ModifyActionInput): boolean {
  return (
    shouldOptimisticallyRemoveFromView(view, action) || ["trash", "delete"].includes(action.type)
  );
}

export function shouldForceProviderSearchAfterMutation(query: string): boolean {
  return Boolean(query.trim());
}

export function permanentDeletePrompt(count: number): string {
  return count === 1
    ? "Delete this conversation permanently? This cannot be undone."
    : `Delete ${count} conversations permanently? This cannot be undone.`;
}

export function canCloseQuickReply(
  hasUnsavedReply: boolean,
  confirmDiscard: () => boolean = () => window.confirm("Discard this unsent reply?"),
): boolean {
  return !hasUnsavedReply || confirmDiscard();
}

function viewTitle(view: MailboxView, label?: string): string {
  if (view === "label") return label || "Label";
  const titles: Record<MailboxView, string> = {
    inbox: "Inbox",
    starred: "Starred",
    sent: "Sent",
    drafts: "Drafts",
    all: "All mail",
    spam: "Spam",
    trash: "Trash",
    label: "Label",
    search: "Search",
  };
  return titles[view];
}

export function replySeed(thread: ThreadSummary): ComposeSeed {
  return {
    accountId: thread.accountId,
    subject: thread.subject.toLowerCase().startsWith("re:")
      ? thread.subject
      : `Re: ${thread.subject}`,
    threadId: thread.id,
  };
}

function formatAddresses(addresses?: Array<{ name?: string; email: string }>): string {
  return (addresses ?? [])
    .map((address) => {
      if (!address.name) return address.email;
      const name = /[,;"]/.test(address.name)
        ? `"${address.name.replaceAll('"', '\\"')}"`
        : address.name;
      return `${name} <${address.email}>`;
    })
    .join(", ");
}

export function Splash({ error }: { error?: AppError }) {
  const incompatible = error?.code === "incompatible_store";
  return (
    <div className="splash">
      <div className="brand-mark">
        <FluxmailLogoMark />
      </div>
      <h1>
        {error ? (incompatible ? "Update Fluxmail to continue" : "An error occurred") : "Fluxmail"}
      </h1>
      <p>{error?.message || "Opening your mail..."}</p>
      {error ? (
        <button
          type="button"
          className="secondary-button splash-restart"
          onClick={() => void window.fluxmail.system.restart()}
        >
          {incompatible ? "Try again" : "Restart Fluxmail"}
        </button>
      ) : null}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Fluxmail could not complete that request.";
}

export function errorDetails(error: unknown): AppError {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      retryable?: unknown;
      details?: unknown;
    };
    return {
      code: typeof candidate.code === "string" ? candidate.code : "desktop_error",
      message: candidate.message,
      retryable: typeof candidate.retryable === "boolean" ? candidate.retryable : true,
      ...(candidate.details && typeof candidate.details === "object"
        ? { details: candidate.details as Record<string, string | number | boolean> }
        : {}),
    };
  }
  return {
    code: "desktop_error",
    message: "Fluxmail could not start.",
    retryable: true,
  };
}
