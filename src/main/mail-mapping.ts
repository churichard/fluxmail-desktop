import { EmailError, mergeEmailQueries, parseEmailSearch, type EmailQuery } from "@fluxmail/core";
import type { ThreadListInput } from "../shared/contracts";

export function toEmailQuery(input: ThreadListInput): EmailQuery {
  const structured: EmailQuery = {};
  if (input.view === "inbox") structured.folder = "inbox";
  if (input.view === "sent") structured.folder = "sent";
  if (input.view === "drafts") structured.folder = "drafts";
  if (input.view === "spam") structured.folder = "spam";
  if (input.view === "trash") structured.folder = "trash";
  if (input.view === "starred") structured.starred = true;
  if (input.view === "label" && input.label) structured.folder = input.label;

  const search = input.query?.trim();
  if (!(input.view === "search" || input.query) || !search) return structured;

  const parsed = parseEmailSearch(search);
  if (!parsed.valid) throw invalidSearch(parsed.diagnostics);
  const merged = mergeEmailQueries(parsed.query, structured);
  if (!merged.success) throw invalidSearch(merged.diagnostics);
  return merged.query;
}

function invalidSearch(diagnostics: Array<{ message: string }>): EmailError {
  return new EmailError(
    "invalid_request",
    diagnostics.map((diagnostic) => diagnostic.message).join(" "),
    { diagnostics },
  );
}
