import type { AccountInfo } from "../shared/contracts";

export interface SearchAutocompleteContext {
  accounts: AccountInfo[];
  labels: string[];
}

export interface SearchSuggestion {
  id: string;
  label: string;
  description: string;
  replacement: string;
  appendSpace: boolean;
}

export interface SearchAutocompleteResult {
  range: { start: number; end: number };
  fragment: string;
  suggestions: SearchSuggestion[];
}

interface FilterDefinition {
  operator: string;
  description: string;
}

const MAX_SUGGESTIONS = 8;

const FILTERS: FilterDefinition[] = [
  { operator: "from", description: "Messages from a sender" },
  { operator: "to", description: "Messages sent to a recipient" },
  { operator: "subject", description: "Words in the subject" },
  { operator: "is", description: "Read, unread, or starred" },
  { operator: "has", description: "Messages with attachments" },
  { operator: "in", description: "Folder" },
  { operator: "after", description: "After a date or period" },
  { operator: "before", description: "Before a date or period" },
  { operator: "label", description: "Label" },
  { operator: "account", description: "Mail account" },
  { operator: "cc", description: "Copied recipient" },
  { operator: "bcc", description: "Blind copied recipient" },
  { operator: "filename", description: "Attachment name" },
  { operator: "filetype", description: "Attachment extension" },
  { operator: "newer", description: "After a date or period" },
  { operator: "newer_than", description: "Within a period, such as 7d" },
  { operator: "older", description: "Before a date or period" },
  { operator: "older_than", description: "Older than a period, such as 30d" },
];

const VALUE_SUGGESTIONS: Record<string, Array<{ value: string; description: string }>> = {
  is: [
    { value: "unread", description: "Unread messages" },
    { value: "read", description: "Read messages" },
    { value: "starred", description: "Starred messages" },
  ],
  has: [{ value: "attachment", description: "Messages with attachments" }],
  in: [
    { value: "inbox", description: "Inbox" },
    { value: "sent", description: "Sent" },
    { value: "drafts", description: "Drafts" },
    { value: "archive", description: "Archive" },
    { value: "starred", description: "Starred" },
    { value: "spam", description: "Spam" },
    { value: "trash", description: "Trash" },
    { value: "all", description: "All mail" },
  ],
  filetype: [
    { value: "pdf", description: "PDF files" },
    { value: "docx", description: "Word documents" },
    { value: "xlsx", description: "Excel workbooks" },
    { value: "csv", description: "CSV files" },
    { value: "zip", description: "ZIP archives" },
    { value: "jpg", description: "JPEG images" },
    { value: "png", description: "PNG images" },
  ],
  after: [
    { value: "7d", description: "Past 7 days" },
    { value: "30d", description: "Past 30 days" },
    { value: "1y", description: "Past year" },
  ],
  newer: [
    { value: "7d", description: "Past 7 days" },
    { value: "30d", description: "Past 30 days" },
    { value: "1y", description: "Past year" },
  ],
  newer_than: [
    { value: "7d", description: "Past 7 days" },
    { value: "30d", description: "Past 30 days" },
    { value: "1y", description: "Past year" },
  ],
  before: [
    { value: "7d", description: "Before 7 days ago" },
    { value: "30d", description: "Before 30 days ago" },
    { value: "1y", description: "Before a year ago" },
  ],
  older: [
    { value: "7d", description: "Before 7 days ago" },
    { value: "30d", description: "Before 30 days ago" },
    { value: "1y", description: "Before a year ago" },
  ],
  older_than: [
    { value: "7d", description: "Before 7 days ago" },
    { value: "30d", description: "Before 30 days ago" },
    { value: "1y", description: "Before a year ago" },
  ],
};

export function getSearchAutocomplete(
  input: string,
  cursor: number,
  context: SearchAutocompleteContext,
): SearchAutocompleteResult {
  const range = activeTokenRange(input, cursor);
  const token = input.slice(range.start, cursor);
  const negated = token.startsWith("-");
  const fragment = negated ? token.slice(1) : token;
  const separator = fragment.indexOf(":");

  if (separator < 0) {
    const normalized = fragment.toLowerCase();
    const suggestions = ["and", "or", "not"].includes(normalized)
      ? []
      : FILTERS.filter(({ operator }) => operator.startsWith(normalized))
          .slice(0, MAX_SUGGESTIONS)
          .map(({ operator, description }) => ({
            id: `filter:${operator}`,
            label: `${operator}:`,
            description,
            replacement: `${negated ? "-" : ""}${operator}:`,
            appendSpace: false,
          }));
    return { range, fragment, suggestions };
  }

  const operator = fragment.slice(0, separator).toLowerCase();
  const valueFragment = unquote(fragment.slice(separator + 1)).toLowerCase();
  const values = valuesForOperator(operator, context);
  const suggestions = values
    .filter(({ value, searchValue }) =>
      (searchValue ?? value).toLowerCase().includes(valueFragment),
    )
    .slice(0, MAX_SUGGESTIONS)
    .map(({ value, description }) => {
      const formattedValue = quoteSearchValue(value);
      return {
        id: `value:${operator}:${value}`,
        label: `${operator}:${formattedValue}`,
        description,
        replacement: `${negated ? "-" : ""}${operator}:${formattedValue}`,
        appendSpace: true,
      };
    });
  return { range, fragment, suggestions };
}

export function applySearchSuggestion(
  input: string,
  result: SearchAutocompleteResult,
  suggestion: SearchSuggestion,
): { value: string; cursor: number } {
  const suffix = input.slice(result.range.end);
  const trailingSpace = suggestion.appendSpace && (!suffix || !/^\s|^\)/.test(suffix)) ? " " : "";
  const replacement = `${suggestion.replacement}${trailingSpace}`;
  return {
    value: `${input.slice(0, result.range.start)}${replacement}${suffix}`,
    cursor: result.range.start + replacement.length,
  };
}

function valuesForOperator(
  operator: string,
  context: SearchAutocompleteContext,
): Array<{ value: string; description: string; searchValue?: string }> {
  if (operator === "label")
    return context.labels.map((label) => ({ value: label, description: "Label" }));
  if (operator === "account")
    return context.accounts.map((account) => ({
      value: account.email,
      description: account.displayName ?? account.provider,
      searchValue: [account.email, account.displayName, account.provider].filter(Boolean).join(" "),
    }));
  return VALUE_SUGGESTIONS[operator] ?? [];
}

function activeTokenRange(input: string, cursor: number): { start: number; end: number } {
  const safeCursor = Math.max(0, Math.min(cursor, input.length));
  let start = 0;
  let quoted = false;
  let escaped = false;
  for (let index = 0; index < safeCursor; index += 1) {
    const character = input[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (/\s/.test(character) || character === "(" || character === ")"))
      start = index + 1;
  }

  let end = safeCursor;
  for (; end < input.length; end += 1) {
    const character = input[end]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (/\s/.test(character) || character === "(" || character === ")")) break;
  }
  return { start, end };
}

function quoteSearchValue(value: string): string {
  if (!/[\s()"]/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function unquote(value: string): string {
  return value.replace(/^"/, "").replace(/"$/, "");
}
