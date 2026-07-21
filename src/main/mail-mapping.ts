import {
  parseEmailSearch,
  simplifyEmailSearch,
  type EmailQuery,
  type EmailSearchExpression,
} from "@fluxmail/core";
import type { AccountInfo, ThreadListInput } from "../shared/contracts";

export function toEmailQuery(input: ThreadListInput, account?: AccountInfo): EmailQuery {
  const query: EmailQuery = {};
  if (input.view === "inbox") query.folder = "inbox";
  if (input.view === "sent") query.folder = "sent";
  if (input.view === "drafts") query.folder = "drafts";
  if (input.view === "spam") query.folder = "spam";
  if (input.view === "trash") query.folder = "trash";
  if (input.view === "starred") query.starredOnly = true;
  if (input.view === "label" && input.label) query.folder = input.label;
  if ((input.view === "search" || input.query) && input.query?.trim()) {
    const parsed = parseEmailSearch(input.query.trim());
    if (parsed) {
      const resolved = account ? resolveAccountFilters(parsed, account) : parsed;
      const lowered = lowerTopLevelFilters(resolved, query);
      if (lowered.type !== "all") query.expression = lowered;
    }
  }
  return query;
}

function resolveAccountFilters(
  expression: EmailSearchExpression,
  account: AccountInfo,
): EmailSearchExpression {
  if (expression.type === "field" && expression.field === "account") {
    const wanted = String(expression.value).toLowerCase();
    const values = [account.id, account.email, account.displayName, account.provider]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());
    return { type: values.some((value) => value.includes(wanted)) ? "all" : "none" };
  }
  if (expression.type === "not")
    return simplifyEmailSearch({
      type: "not",
      operand: resolveAccountFilters(expression.operand, account),
    });
  if (expression.type === "and" || expression.type === "or")
    return simplifyEmailSearch({
      type: expression.type,
      operands: expression.operands.map((operand) => resolveAccountFilters(operand, account)),
    });
  return expression;
}

function lowerTopLevelFilters(
  expression: EmailSearchExpression,
  query: EmailQuery,
): EmailSearchExpression {
  const operands = expression.type === "and" ? expression.operands : [expression];
  const candidates = operands.map(lowerableFilter);
  const counts = new Map<string, number>();
  for (const candidate of candidates)
    if (candidate) counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + 1);
  const remaining: EmailSearchExpression[] = [];
  operands.forEach((operand, index) => {
    const candidate = candidates[index];
    if (!candidate || counts.get(candidate.key) !== 1 || candidate.key in query) {
      remaining.push(operand);
      return;
    }
    Object.assign(query, { [candidate.key]: candidate.value });
  });
  return simplifyEmailSearch(
    remaining.length ? { type: "and", operands: remaining } : { type: "all" },
  );
}

function lowerableFilter(expression: EmailSearchExpression):
  | {
      key: "folder" | "read" | "starred" | "hasAttachment" | "after" | "before";
      value: string | boolean;
    }
  | undefined {
  let field = expression;
  let negated = false;
  if (field.type === "not") {
    field = field.operand;
    negated = true;
  }
  if (field.type !== "field") return undefined;
  if (["read", "starred", "has_attachment"].includes(field.field)) {
    if (typeof field.value !== "boolean") return undefined;
    const key: "read" | "starred" | "hasAttachment" =
      field.field === "has_attachment"
        ? "hasAttachment"
        : field.field === "read"
          ? "read"
          : "starred";
    return { key, value: negated ? !field.value : field.value };
  }
  if (negated || typeof field.value !== "string") return undefined;
  if (field.field === "folder" || field.field === "after" || field.field === "before")
    return { key: field.field, value: field.value };
  return undefined;
}
