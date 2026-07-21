import { useCallback, useMemo, useState, type RefObject } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Archive,
  LoaderCircle,
  Mail,
  MailOpen,
  MoreHorizontal,
  PanelLeft,
  Paperclip,
  Pencil,
  RefreshCw,
  Search,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Undo2,
} from "lucide-react";
import type {
  MailboxView,
  ModifyActionInput,
  SyncState,
  ThreadSummary,
} from "../../shared/contracts";
import { threadKey } from "../App";
import {
  mailboxDeleteAction,
  mailboxDeleteLabel,
  mailboxMoveAction,
  mailboxMoveLabel,
} from "../mail-actions";
import { KEYBOARD_SHORTCUTS, type KeyboardShortcutHint } from "../shortcuts";
import { IconButton, MenuButton, SelectionCheckbox } from "./Controls";
import { OverlayScrollbar } from "./OverlayScrollbar";

interface Props {
  view: MailboxView;
  title: string;
  threads: ThreadSummary[];
  selected?: ThreadSummary;
  selection: Set<string>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  searchText: string;
  deferredSearch: string;
  searchRef: RefObject<HTMLInputElement | null>;
  sync: SyncState;
  labels: string[];
  permanentDeleteAccountIds: ReadonlySet<string>;
  sidebarCollapsed: boolean;
  onSearchText(value: string): void;
  onSearch(): void;
  onSelect(thread: ThreadSummary): void;
  onToggleSelection(thread: ThreadSummary): void;
  onToggleSelectAll(): void;
  onModify(action: ModifyActionInput, threads?: ThreadSummary[]): Promise<void>;
  onLoadMore(): void;
  onRefresh(): void;
  onExpandSidebar(): void;
  onCompose(): void;
}

export function ThreadListPane(props: Props) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const handleScrollerRef = useCallback((element: HTMLElement | Window | null) => {
    setScroller(element instanceof HTMLElement ? element : null);
  }, []);
  const selectedThreads = useMemo(
    () => props.threads.filter((thread) => props.selection.has(threadKey(thread))),
    [props.selection, props.threads],
  );
  const allThreadsSelected =
    props.threads.length > 0 && selectedThreads.length === props.threads.length;
  const selectionState = allThreadsSelected
    ? "checked"
    : selectedThreads.length
      ? "mixed"
      : "unchecked";
  const readAction = getSelectionReadAction(selectedThreads);
  const deleteAction = mailboxDeleteAction(
    props.view,
    selectedThreads.every((thread) => props.permanentDeleteAccountIds.has(thread.accountId)),
  );
  const groups = useMemo(() => groupThreadsByDate(props.threads), [props.threads]);
  const entries = useMemo(
    () =>
      groups.flatMap((group) => [
        { type: "group" as const, label: group.label },
        ...group.threads.map((thread) => ({ type: "thread" as const, thread })),
      ]),
    [groups],
  );
  return (
    <section className="thread-pane">
      <header className="thread-header">
        <div className="search-row">
          {props.sidebarCollapsed ? (
            <div className="header-quick-actions">
              <IconButton
                label="Expand sidebar"
                tooltipSide="bottom"
                shortcut={KEYBOARD_SHORTCUTS.toggleSidebar}
                onClick={props.onExpandSidebar}
              >
                <PanelLeft size={17} />
              </IconButton>
              <IconButton
                label="Compose"
                className="icon-button header-compose-button"
                tooltipSide="bottom"
                shortcut={KEYBOARD_SHORTCUTS.compose}
                onClick={props.onCompose}
              >
                <Pencil size={16} />
              </IconButton>
            </div>
          ) : null}
          <form
            className="search-box"
            onSubmit={(event) => {
              event.preventDefault();
              props.onSearch();
            }}
          >
            <Search size={16} />
            <input
              ref={props.searchRef}
              value={props.searchText}
              onChange={(event) => props.onSearchText(event.target.value)}
              placeholder="Search mail"
              aria-label="Search mail"
            />
            {props.searchText !== props.deferredSearch ? (
              <LoaderCircle className="spin" size={14} />
            ) : (
              <kbd>⌘K</kbd>
            )}
          </form>
        </div>
        <div className={`title-row ${selectedThreads.length ? "selection-mode" : ""}`}>
          <SelectionCheckbox
            state={selectionState}
            label={allThreadsSelected ? "Clear selection" : "Select all conversations"}
            className="header-check"
            onClick={props.onToggleSelectAll}
          />
          {selectedThreads.length ? (
            <>
              <span className="selection-count" aria-live="polite">
                {selectedThreads.length} selected
              </span>
              <div className="selection-actions">
                <IconButton
                  label={mailboxMoveLabel(props.view)}
                  shortcut={KEYBOARD_SHORTCUTS.archive}
                  onClick={() => void props.onModify(mailboxMoveAction(props.view))}
                >
                  {props.view === "trash" ? <Undo2 size={16} /> : <Archive size={16} />}
                </IconButton>
                {deleteAction ? (
                  <IconButton
                    label={mailboxDeleteLabel(props.view)}
                    shortcut={KEYBOARD_SHORTCUTS.trash}
                    onClick={() => void props.onModify(deleteAction)}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                ) : null}
                <IconButton
                  label={readAction === "markRead" ? "Mark read" : "Mark unread"}
                  shortcut={KEYBOARD_SHORTCUTS.toggleRead}
                  onClick={() => void props.onModify({ type: readAction })}
                >
                  {readAction === "markRead" ? <MailOpen size={16} /> : <Mail size={16} />}
                </IconButton>
                {props.labels.length ? (
                  <MenuButton
                    label="Apply label"
                    options={props.labels.map((label) => ({
                      id: label,
                      label,
                      onSelect: () =>
                        void props.onModify({
                          type: "addLabels",
                          labels: [label],
                        }),
                    }))}
                  >
                    <Tag size={16} />
                  </MenuButton>
                ) : null}
                <MenuButton
                  label="More actions"
                  align="right"
                  options={[
                    {
                      id: "spam",
                      label: "Mark as spam",
                      icon: <ShieldAlert size={15} />,
                      onSelect: () => void props.onModify({ type: "move", folder: "spam" }),
                    },
                  ]}
                >
                  <MoreHorizontal size={17} />
                </MenuButton>
              </div>
            </>
          ) : (
            <>
              <div className="title-heading">
                <h1>{props.title}</h1>
              </div>
              <SyncLabel sync={props.sync} />
              <IconButton
                label="Refresh"
                shortcut={KEYBOARD_SHORTCUTS.refresh}
                onClick={props.onRefresh}
              >
                <RefreshCw className={props.sync.status === "syncing" ? "spin" : ""} size={16} />
              </IconButton>
            </>
          )}
        </div>
      </header>
      <div className="thread-list">
        {props.loading && !props.threads.length ? (
          <ThreadSkeleton />
        ) : props.threads.length ? (
          <Virtuoso
            data={entries}
            computeItemKey={(_index, entry) =>
              entry.type === "thread" ? `thread:${threadKey(entry.thread)}` : `group:${entry.label}`
            }
            scrollerRef={handleScrollerRef}
            endReached={() => {
              if (props.hasMore && !props.loadingMore) props.onLoadMore();
            }}
            itemContent={(_index, entry) => {
              if (entry.type === "group")
                return <div className="thread-date-group">{entry.label}</div>;
              const thread = entry.thread;
              return (
                <ThreadRow
                  thread={thread}
                  active={threadKey(thread) === (props.selected ? threadKey(props.selected) : "")}
                  checked={props.selection.has(threadKey(thread))}
                  onOpen={() => props.onSelect(thread)}
                  onCheck={() => props.onToggleSelection(thread)}
                  moveLabel={mailboxMoveLabel(props.view)}
                  restore={props.view === "trash"}
                  onMove={() => void props.onModify(mailboxMoveAction(props.view), [thread])}
                  onToggleRead={() =>
                    void props.onModify({ type: thread.unread ? "markRead" : "markUnread" }, [
                      thread,
                    ])
                  }
                  onStar={() =>
                    void props.onModify({ type: thread.starred ? "unstar" : "star" }, [thread])
                  }
                />
              );
            }}
            components={{
              Footer: () =>
                props.loadingMore ? (
                  <div className="loading-more">
                    <LoaderCircle className="spin" size={16} />
                    Loading more
                  </div>
                ) : null,
            }}
          />
        ) : (
          <EmptyList />
        )}
        <OverlayScrollbar scroller={scroller} fadeClass="thread-fade" />
      </div>
    </section>
  );
}

export function ThreadRow({
  thread,
  active,
  checked,
  onOpen,
  onCheck,
  moveLabel,
  restore,
  onMove,
  onToggleRead,
  onStar,
}: {
  thread: ThreadSummary;
  active: boolean;
  checked: boolean;
  onOpen(): void;
  onCheck(): void;
  moveLabel: string;
  restore: boolean;
  onMove(): void;
  onToggleRead(): void;
  onStar(): void;
}) {
  return (
    <div
      className={`thread-row ${active ? "active" : ""} ${thread.unread ? "unread" : ""}`}
      onClick={onOpen}
    >
      <SelectionCheckbox
        state={checked ? "checked" : "unchecked"}
        label={checked ? "Deselect conversation" : "Select conversation"}
        className="row-check"
        onClick={(event) => {
          event.stopPropagation();
          onCheck();
        }}
      />
      <button className="thread-open">
        <div className="thread-content">
          <div className="thread-topline">
            {thread.unread ? <span className="unread-dot" aria-hidden="true" /> : null}
            <span className="sender truncate">{thread.senderName}</span>
            <time>{formatListDate(thread.date)}</time>
          </div>
          <div className="subject-line">
            <span className="truncate">{thread.subject || "(no subject)"}</span>
            {thread.messageCount > 1 ? (
              <span className="message-count">{thread.messageCount}</span>
            ) : null}
          </div>
          <div className="snippet-line">
            <span className="truncate">{thread.snippet}</span>
            {thread.hasAttachments ? <Paperclip size={13} /> : null}
          </div>
        </div>
      </button>
      <div className="row-actions">
        <RowAction
          label={`${moveLabel} conversation`}
          shortcut={KEYBOARD_SHORTCUTS.archive}
          onClick={onMove}
        >
          {restore ? <Undo2 size={15} /> : <Archive size={15} />}
        </RowAction>
        <RowAction
          label={thread.unread ? "Mark conversation read" : "Mark conversation unread"}
          shortcut={KEYBOARD_SHORTCUTS.toggleRead}
          onClick={onToggleRead}
        >
          {thread.unread ? <MailOpen size={15} /> : <Mail size={15} />}
        </RowAction>
        <RowAction
          label={thread.starred ? "Unstar conversation" : "Star conversation"}
          shortcut={KEYBOARD_SHORTCUTS.star}
          active={thread.starred}
          onClick={onStar}
        >
          <Star size={15} fill={thread.starred ? "currentColor" : "none"} />
        </RowAction>
      </div>
    </div>
  );
}

export function getSelectionReadAction(
  threads: Array<Pick<ThreadSummary, "unread">>,
): "markRead" | "markUnread" {
  return threads.some((thread) => thread.unread) ? "markRead" : "markUnread";
}

function RowAction({
  label,
  active = false,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  shortcut?: KeyboardShortcutHint;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <IconButton
      className={`row-action ${active ? "active" : ""}`}
      label={label}
      shortcut={shortcut}
      tooltipSide="top"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </IconButton>
  );
}

function SyncLabel({ sync }: { sync: SyncState }) {
  if (sync.status === "offline") return <span className="sync-label warning">Offline</span>;
  if (sync.status === "error") return <span className="sync-label warning">Sync paused</span>;
  return null;
}

function ThreadSkeleton() {
  return (
    <div className="skeleton-list">
      {Array.from({ length: 9 }, (_, index) => (
        <div className="thread-skeleton" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function EmptyList() {
  return (
    <div className="empty-list">
      <Mail size={30} />
      <h2>Nothing here</h2>
      <p>This mailbox is empty.</p>
    </div>
  );
}

function formatListDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  if (date.getFullYear() === now.getFullYear())
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  return new Intl.DateTimeFormat(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function groupThreadsByDate(
  threads: ThreadSummary[],
  now = new Date(),
): Array<{ label: string; threads: ThreadSummary[] }> {
  const labels = ["Today", "Yesterday", "This week", "Last week", "This month", "Earlier"];
  const groups = new Map(labels.map((label) => [label, [] as ThreadSummary[]]));
  for (const thread of threads)
    groups.get(dateGroupLabel(new Date(thread.date), now))!.push(thread);
  return labels.flatMap((label) => {
    const items = groups.get(label)!;
    return items.length ? [{ label, threads: items }] : [];
  });
}

function dateGroupLabel(date: Date, now: Date): string {
  const today = startOfDay(now);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(today);
  const dayFromMonday = (thisWeek.getDay() + 6) % 7;
  thisWeek.setDate(thisWeek.getDate() - dayFromMonday);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  if (date >= today) return "Today";
  if (date >= yesterday) return "Yesterday";
  if (date >= thisWeek) return "This week";
  if (date >= lastWeek) return "Last week";
  if (date >= thisMonth) return "This month";
  return "Earlier";
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
