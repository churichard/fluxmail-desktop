import { parseEmailSearch, type EmailSearchExpression } from "@fluxmail/core";
import type { AccountInfo } from "../shared/contracts";

export interface SqlSearch {
  sql: string;
  params: Array<string | number>;
}

/** Compile the shared search tree against cached thread summaries and message metadata. */
export function compileSearchSql(query: string, accounts?: AccountInfo[]): SqlSearch | undefined {
  const expression = parseEmailSearch(query);
  if (!expression) return undefined;
  const compiled = compile(expression, accounts);
  return {
    sql: `EXISTS (
      SELECT 1 FROM messages AS search_message
      WHERE search_message.account_id = threads.account_id
        AND search_message.thread_id = threads.thread_id
        AND (${compiled.sql})
    )`,
    params: compiled.params,
  };
}

function compile(expression: EmailSearchExpression, accounts?: AccountInfo[]): SqlSearch {
  if (expression.type === "all") return { sql: "1", params: [] };
  if (expression.type === "none") return { sql: "0", params: [] };
  if (expression.type === "not") {
    const operand = compile(expression.operand, accounts);
    return { sql: `NOT COALESCE((${operand.sql}), 0)`, params: operand.params };
  }
  if (expression.type === "and" || expression.type === "or") {
    const operands = expression.operands.map((operand) => compile(operand, accounts));
    return {
      sql: `(${operands.map((operand) => `(${operand.sql})`).join(` ${expression.type.toUpperCase()} `)})`,
      params: operands.flatMap((operand) => operand.params),
    };
  }
  if (expression.type === "text") {
    const value = contains(expression.value);
    return {
      sql: `(
        json_extract(search_message.payload_json, '$.subject') LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        json_extract(search_message.payload_json, '$.from.name') LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        json_extract(search_message.payload_json, '$.from.email') LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        json_extract(search_message.payload_json, '$.snippet') LIKE ? ESCAPE '\\' COLLATE NOCASE
      )`,
      params: [value, value, value, value],
    };
  }
  const value = String(expression.value);
  switch (expression.field) {
    case "from":
      return address("from", value, true);
    case "to":
    case "cc":
    case "bcc":
      return address(expression.field, value, false);
    case "subject":
      return jsonValue("$.subject", value);
    case "label":
      return {
        sql: `EXISTS (
          SELECT 1 FROM json_each(json_extract(search_message.payload_json, '$.labels')) AS label
          WHERE label.value = ? COLLATE NOCASE
        )`,
        params: [value],
      };
    case "folder": {
      const role = value.toLowerCase() === "draft" ? "drafts" : value.toLowerCase();
      if (role === "all")
        return {
          sql: `COALESCE(json_extract(search_message.payload_json, '$.folder.role'), '') NOT IN ('spam', 'trash')`,
          params: [],
        };
      return {
        sql: `(
          json_extract(search_message.payload_json, '$.folder.role') = ? COLLATE NOCASE OR
          json_extract(search_message.payload_json, '$.folder.name') = ? COLLATE NOCASE OR
          json_extract(search_message.payload_json, '$.folder.id') = ? COLLATE NOCASE
        )`,
        params: [role, value, value],
      };
    }
    case "has_attachment":
      return {
        sql: `(COALESCE(json_array_length(json_extract(search_message.payload_json, '$.attachments')), 0) > 0) = ?`,
        params: [expression.value ? 1 : 0],
      };
    case "read":
      return {
        sql: `json_extract(search_message.payload_json, '$.flags.read') = ?`,
        params: [expression.value ? 1 : 0],
      };
    case "starred":
      return {
        sql: `json_extract(search_message.payload_json, '$.flags.starred') = ?`,
        params: [expression.value ? 1 : 0],
      };
    case "after":
      return { sql: `search_message.date >= ?`, params: [value] };
    case "before":
      return { sql: `search_message.date < ?`, params: [value] };
    case "filename":
      return attachmentName(contains(value));
    case "filetype":
      return attachmentName(`%.${escapeLike(value.replace(/^\./, ""))}`);
    case "account": {
      if (accounts) {
        const wanted = value.toLowerCase();
        const accountIds = accounts
          .filter((account) =>
            [account.id, account.email, account.displayName, account.provider]
              .filter((candidate): candidate is string => Boolean(candidate))
              .some((candidate) => candidate.toLowerCase().includes(wanted)),
          )
          .map((account) => account.id);
        if (!accountIds.length) return { sql: "0", params: [] };
        return {
          sql: `threads.account_id IN (${accountIds.map(() => "?").join(", ")})`,
          params: accountIds,
        };
      }
      const match = contains(value);
      return {
        sql: `(threads.account_id LIKE ? ESCAPE '\\' COLLATE NOCASE OR threads.account_email LIKE ? ESCAPE '\\' COLLATE NOCASE)`,
        params: [match, match],
      };
    }
  }
}

function address(field: "from" | "to" | "cc" | "bcc", value: string, singular: boolean): SqlSearch {
  const match = contains(value);
  if (singular)
    return {
      sql: `(
        json_extract(search_message.payload_json, '$.${field}.email') LIKE ? ESCAPE '\\' COLLATE NOCASE OR
        json_extract(search_message.payload_json, '$.${field}.name') LIKE ? ESCAPE '\\' COLLATE NOCASE
      )`,
      params: [match, match],
    };
  return {
    sql: `EXISTS (
      SELECT 1 FROM json_each(json_extract(search_message.payload_json, '$.${field}')) AS address
      WHERE json_extract(address.value, '$.email') LIKE ? ESCAPE '\\' COLLATE NOCASE
         OR json_extract(address.value, '$.name') LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`,
    params: [match, match],
  };
}

function jsonValue(path: string, value: string): SqlSearch {
  return {
    sql: `json_extract(search_message.payload_json, '${path}') LIKE ? ESCAPE '\\' COLLATE NOCASE`,
    params: [contains(value)],
  };
}

function attachmentName(pattern: string): SqlSearch {
  return {
    sql: `EXISTS (
      SELECT 1 FROM json_each(json_extract(search_message.payload_json, '$.attachments')) AS attachment
      WHERE json_extract(attachment.value, '$.filename') LIKE ? ESCAPE '\\' COLLATE NOCASE
    )`,
    params: [pattern],
  };
}

function contains(value: string): string {
  return `%${escapeLike(value)}%`;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
