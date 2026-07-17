import type { EmailQuery } from "@fluxmail/core";
import type { ThreadListInput } from "../shared/contracts";

export function toEmailQuery(input: ThreadListInput): EmailQuery {
  const query: EmailQuery = {};
  if (input.view === "inbox") query.folder = "inbox";
  if (input.view === "sent") query.folder = "sent";
  if (input.view === "drafts") query.folder = "drafts";
  if (input.view === "spam") query.folder = "spam";
  if (input.view === "trash") query.folder = "trash";
  if (input.view === "starred") query.starredOnly = true;
  if (input.view === "label" && input.label) query.folder = input.label;
  if ((input.view === "search" || input.query) && input.query?.trim())
    query.text = input.query.trim();
  return query;
}
