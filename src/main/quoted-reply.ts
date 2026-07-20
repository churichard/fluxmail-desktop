import type { Message, MessageBody } from "@fluxmail/core";
import { parseFragment, type DefaultTreeAdapterTypes } from "parse5";
import { quotedReplyCitation } from "../shared/quoted-reply";

const INLINE_BLOCKQUOTE_STYLE =
  "margin:0.5rem 0 0.5rem 0.25rem;border-left:0.125rem solid #d1d5db;padding-left:0.75rem;background:transparent;color:inherit;";
const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul",
]);
const HIDDEN_TAGS = new Set(["head", "script", "style", "template"]);
const QUOTED_REPLY_CLASSES = new Set([
  "gmail_quote",
  "gmail_quote_container",
  "moz-cite-prefix",
  "protonmail_quote",
  "yahoo_quoted",
]);
const QUOTED_REPLY_IDS = new Set(["divrplyfwdmsg"]);

export function buildQuotedReplyBody(reply: MessageBody, original: Message): MessageBody {
  if (containsQuotedReply(reply)) return { ...reply };
  const citation = quotedReplyCitation(original);
  const body: MessageBody = {};

  if (reply.text !== undefined) {
    const quotedText = original.body?.text ?? htmlToPlainText(original.body?.html ?? "");
    body.text = `${reply.text}\n\n${citation}\n${quotePlainText(quotedText || original.snippet || "")}`;
  }

  if (reply.html !== undefined) {
    const quotedHtml = original.body?.html
      ? cleanQuotedHtml(original.body.html)
      : plainTextHtml(original.body?.text ?? original.snippet ?? "");
    body.html =
      `${reply.html}<div class="gmail_quote gmail_quote_container">` +
      `<div dir="ltr" class="gmail_attr">${escapeHtml(citation)}<br></div>` +
      `<blockquote class="gmail_quote" style="${INLINE_BLOCKQUOTE_STYLE}">${quotedHtml}</blockquote>` +
      `</div>`;
  }

  return body;
}

export function containsQuotedReply(body: MessageBody): boolean {
  return Boolean(
    (body.html && htmlContainsQuotedReply(body.html)) ||
    (body.text && plainTextContainsQuotedReply(body.text)),
  );
}

export function referencedInlineContentIds(html: string | undefined): Set<string> {
  const contentIds = new Set<string>();
  for (const match of html?.matchAll(/\bcid:([^"'()\s<>]+)/gi) ?? []) {
    let value = match[1];
    try {
      value = decodeURIComponent(value);
    } catch {
      // Keep malformed percent escapes as-is so they can still match provider metadata.
    }
    contentIds.add(normalizeContentId(value));
  }
  return contentIds;
}

export function normalizeContentId(value: string): string {
  return value.replace(/^<|>$/g, "").toLowerCase();
}

function htmlToPlainText(html: string): string {
  if (!html) return "";
  const output: string[] = [];
  const append = (value: string) => {
    output.push(value);
  };
  const newline = () => {
    if (output.at(-1)?.endsWith("\n")) return;
    append("\n");
  };
  const visit = (node: DefaultTreeAdapterTypes.Node): void => {
    if ("value" in node) {
      append(node.value);
      return;
    }
    if (!("childNodes" in node)) return;
    const tagName = "tagName" in node ? node.tagName : undefined;
    if (tagName && HIDDEN_TAGS.has(tagName)) return;
    if (tagName === "br") {
      newline();
      return;
    }
    if (tagName && BLOCK_TAGS.has(tagName)) newline();
    for (const child of node.childNodes) visit(child);
    if (tagName === "td" || tagName === "th") append("\t");
    if (tagName && BLOCK_TAGS.has(tagName)) newline();
  };

  visit(parseFragment(html));
  return output
    .join("")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlContainsQuotedReply(html: string): boolean {
  let hasBlockquote = false;
  const visit = (node: DefaultTreeAdapterTypes.Node): boolean => {
    if ("attrs" in node) {
      const attributes = new Map(
        node.attrs.map((attribute) => [attribute.name.toLowerCase(), attribute.value]),
      );
      const classes = attributes.get("class")?.toLowerCase().split(/\s+/) ?? [];
      if (classes.some((className) => QUOTED_REPLY_CLASSES.has(className))) return true;
      const id = attributes.get("id")?.toLowerCase();
      if (id && QUOTED_REPLY_IDS.has(id)) return true;
      if (node.tagName === "blockquote") hasBlockquote = true;
      if (node.tagName === "blockquote" && attributes.get("type")?.toLowerCase() === "cite") {
        return true;
      }
    }
    return "childNodes" in node && node.childNodes.some(visit);
  };

  return (
    visit(parseFragment(html)) ||
    (hasBlockquote && /(?:^|\n)On [^\n]+ wrote:/i.test(htmlToPlainText(html)))
  );
}

function plainTextContainsQuotedReply(text: string): boolean {
  return (
    /(?:^|\n)On [^\n]+ wrote:\s*\n(?:>[^\n]*(?:\n|$))+/i.test(text) ||
    /(?:^|\n)-{2,}\s*Original Message\s*-{2,}(?:\n|$)/i.test(text)
  );
}

function cleanQuotedHtml(html: string): string {
  return html.replace(/<div([^>]*)>\s*<br[^>]*\/?>\s*<\/div>/gi, "<div$1></div>");
}

function quotePlainText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trimEnd()
    .split("\n")
    .map((line) => (line ? `> ${line}` : ">"))
    .join("\n");
}

function plainTextHtml(text: string): string {
  return `<div style="white-space:pre-wrap">${escapeHtml(text.replace(/\r\n?/g, "\n").trimEnd())}</div>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
}
