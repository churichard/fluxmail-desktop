import type { ComposeAttachment, MailMessage } from "../../shared/contracts";
import {
  BLOCK_TAGS,
  collapseWhitespace,
  endsWithQuoteAttribution,
  HIDDEN_TAGS,
  isQuoteAttribution,
  normalizeContentId,
  QUOTED_REPLY_CLASSES,
  QUOTED_REPLY_IDS,
  quotedReplyCitation,
  referencedInlineContentIds,
} from "../../shared/quoted-reply";

/**
 * Drops the quoted history from a saved reply so the composer only edits what the sender wrote.
 * The quote is rebuilt from the original message when the reply is sent, which keeps the original
 * formatting intact instead of running it through the rich-text editor.
 */
export function replyWithoutQuotedHtml(html: string): { html: string; quoted: boolean } {
  const document = new DOMParser().parseFromString(html, "text/html");
  const marker = findQuotedReplyMarker(document.body);
  if (!marker) return { html, quoted: false };
  removeFromNode(marker, document.body);
  removeTrailingAttribution(document.body);
  return { html: document.body.innerHTML, quoted: true };
}

/**
 * The message a saved draft quotes, found by the citation the quote carries. A draft written by
 * another client can cite the original in a form Fluxmail does not produce, which leaves the quote
 * unattributed rather than attributed to the wrong message.
 */
export function quotedReplyTarget<T extends MailMessage>(
  body: { html?: string; text?: string } | undefined,
  candidates: T[],
): T | undefined {
  if (!body?.html && !body?.text) return undefined;
  const quoted = collapseWhitespace(`${body.text ?? ""}\n${body.html ? plainText(body.html) : ""}`);
  return candidates.find((candidate) =>
    quoted.includes(collapseWhitespace(quotedReplyCitation(candidate))),
  );
}

/** Drops inline attachments that only the removed quote referenced. */
export function attachmentsWithoutQuotedInline(
  attachments: ComposeAttachment[],
  html: string,
): ComposeAttachment[] {
  const referenced = referencedInlineContentIds(html);
  return attachments.filter(
    (attachment) =>
      attachment.disposition !== "inline" ||
      !attachment.contentId ||
      referenced.has(normalizeContentId(attachment.contentId)),
  );
}

function plainText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
}

function findQuotedReplyMarker(root: HTMLElement): Element | undefined {
  for (const element of root.querySelectorAll("*")) {
    const classes = (element.getAttribute("class") ?? "").toLowerCase().split(/\s+/);
    if (classes.some((className) => QUOTED_REPLY_CLASSES.has(className))) return element;
    const id = element.getAttribute("id")?.toLowerCase();
    if (id && QUOTED_REPLY_IDS.has(id)) return element;
    // An editor that rewrote the draft can strip the quote markup and leave the attribution line
    // in front of the loose quoted blocks, so cut from the attribution itself.
    if (
      BLOCK_TAGS.has(element.tagName.toLowerCase()) &&
      element.nextSibling &&
      isQuoteAttribution(element.textContent ?? "")
    )
      return element;
    if (element.tagName !== "BLOCKQUOTE") continue;
    if (element.getAttribute("type")?.toLowerCase() === "cite") return element;
    // Only treat an unmarked blockquote as history when an attribution introduces it, so quotes
    // the sender wrote themselves stay in the draft.
    if (endsWithQuoteAttribution(textBefore(element, root))) return element;
  }
  return undefined;
}

/** Text preceding an element, with block boundaries kept as line breaks. */
function textBefore(element: Element, root: HTMLElement): string {
  const parts: string[] = [];
  const visit = (node: Node): boolean => {
    if (node === element) return true;
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent ?? "");
      return false;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return false;
    const tagName = (node as Element).tagName.toLowerCase();
    if (HIDDEN_TAGS.has(tagName)) return false;
    if (tagName === "br") {
      parts.push("\n");
      return false;
    }
    if (BLOCK_TAGS.has(tagName)) parts.push("\n");
    for (const child of node.childNodes) {
      if (visit(child)) return true;
    }
    if (BLOCK_TAGS.has(tagName)) parts.push("\n");
    return false;
  };

  for (const child of root.childNodes) {
    if (visit(child)) break;
  }
  return parts.join("");
}

function removeFromNode(marker: Element, root: HTMLElement): void {
  let current: Element | null = marker;
  while (current) {
    const parent: HTMLElement | null = current.parentElement;
    let sibling = current.nextSibling;
    while (sibling) {
      const next = sibling.nextSibling;
      sibling.remove();
      sibling = next;
    }
    if (current === marker) current.remove();
    current = parent && parent !== root ? parent : null;
  }
}

function removeTrailingAttribution(root: HTMLElement): void {
  removeTrailingBreaks(root);
  const last = root.lastElementChild;
  if (last && last === root.lastChild && isQuoteAttribution(last.textContent ?? "")) {
    last.remove();
    removeTrailingBreaks(root);
  }
}

function removeTrailingBreaks(root: HTMLElement): void {
  let node = root.lastChild;
  while (node && (isBlankText(node) || isLineBreak(node))) {
    const previous = node.previousSibling;
    node.remove();
    node = previous;
  }
}

function isBlankText(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && !node.textContent?.trim();
}

function isLineBreak(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR";
}
