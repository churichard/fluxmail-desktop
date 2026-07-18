import type { MailboxView, ModifyActionInput } from "../shared/contracts";

export function mailboxMoveAction(view: MailboxView): ModifyActionInput {
  if (view === "trash") return { type: "untrash" };
  if (view === "spam") return { type: "move", folder: "archive" };
  return { type: "archive" };
}

export function mailboxDeleteAction(
  view: MailboxView,
  allowPermanentDelete = false,
): ModifyActionInput | undefined {
  if (view === "drafts") return { type: "discardDraft" };
  if (view === "trash") return allowPermanentDelete ? { type: "delete" } : undefined;
  return { type: "trash" };
}

export function mailboxMoveLabel(view: MailboxView): string {
  return view === "trash" ? "Restore" : "Archive";
}

export function mailboxDeleteLabel(view: MailboxView): string {
  if (view === "drafts") return "Discard draft";
  return view === "trash" ? "Delete permanently" : "Trash";
}
