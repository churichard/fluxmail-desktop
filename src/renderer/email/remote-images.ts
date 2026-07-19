import { normalizeRemoteImageUrl } from "../../shared/image-relay";
import { blockTrackingPixels } from "./tracking-pixels";

const CSS_URL_REGEX =
  /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^'")])+?))\s*\)/gi;
const CSS_IMAGE_SET_REGEX = /(?:-webkit-)?image-set\s*\(/gi;

interface SrcsetEntry {
  url: string;
  descriptor?: string;
}

export function collectRemoteImageUrls(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
  blockTrackingPixels(document);
  const urls = new Set<string>();
  const add = (value?: string | null) => {
    const normalized = value ? normalizeRemoteImageUrl(value) : undefined;
    if (normalized) urls.add(normalized);
  };

  for (const image of document.querySelectorAll("img[src]")) add(image.getAttribute("src"));
  for (const element of document.querySelectorAll("img[srcset], source[srcset]")) {
    for (const entry of parseSrcset(element.getAttribute("srcset") ?? "")) add(entry.url);
  }
  for (const image of document.querySelectorAll("image"))
    add(image.getAttribute("href") || image.getAttribute("xlink:href"));
  for (const element of document.querySelectorAll("[background]"))
    add(element.getAttribute("background"));
  for (const element of document.querySelectorAll("[style]"))
    for (const url of cssImageUrls(element.getAttribute("style") ?? "")) add(url);
  for (const style of document.querySelectorAll("style"))
    for (const url of cssImageUrls(style.textContent ?? "")) add(url);

  return [...urls];
}

export function rewriteRemoteImageUrls(
  document: Document,
  relayUrls?: Record<string, string>,
): void {
  const replacement = (value: string): string | undefined => {
    const normalized = normalizeRemoteImageUrl(value);
    return normalized ? (relayUrls ? relayUrls[normalized] : normalized) : undefined;
  };

  for (const image of document.querySelectorAll("img[src]")) {
    const source = image.getAttribute("src") ?? "";
    if (!normalizeRemoteImageUrl(source)) continue;
    const proxied = replacement(source);
    if (proxied) image.setAttribute("src", proxied);
    else image.removeAttribute("src");
  }
  for (const element of document.querySelectorAll("img[srcset], source[srcset]")) {
    const entries = parseSrcset(element.getAttribute("srcset") ?? "").flatMap((entry) => {
      if (!normalizeRemoteImageUrl(entry.url)) return [entry];
      const proxied = replacement(entry.url);
      return proxied ? [{ ...entry, url: proxied }] : [];
    });
    if (entries.length) element.setAttribute("srcset", stringifySrcset(entries));
    else element.removeAttribute("srcset");
  }
  for (const image of document.querySelectorAll("image")) {
    const source = image.getAttribute("href") || image.getAttribute("xlink:href") || "";
    if (!normalizeRemoteImageUrl(source)) continue;
    const proxied = replacement(source);
    for (const attribute of ["href", "xlink:href"])
      if (image.hasAttribute(attribute)) {
        if (proxied) image.setAttribute(attribute, proxied);
        else image.removeAttribute(attribute);
      }
  }
  for (const element of document.querySelectorAll("[background]")) {
    const source = element.getAttribute("background") ?? "";
    if (!normalizeRemoteImageUrl(source)) continue;
    const proxied = replacement(source);
    if (proxied) element.setAttribute("background", proxied);
    else element.removeAttribute("background");
  }
  for (const element of document.querySelectorAll("[style]"))
    element.setAttribute("style", rewriteCss(element.getAttribute("style") ?? "", replacement));
  for (const style of document.querySelectorAll("style"))
    style.textContent = rewriteCss(style.textContent ?? "", replacement);
}

function cssImageUrls(value: string): string[] {
  const urls: string[] = [];
  for (const match of value.matchAll(CSS_URL_REGEX)) {
    const url = match[1] ?? match[2] ?? match[3];
    if (url?.trim()) urls.push(url.trim());
  }
  transformImageSetCandidates(value, (candidate) => {
    const source = parseImageSetString(candidate)?.value.trim();
    if (source) urls.push(source);
    return candidate;
  });
  return urls;
}

function rewriteCss(value: string, replace: (url: string) => string | undefined): string {
  const imageSetsRewritten = transformImageSetCandidates(value, (candidate) => {
    const source = parseImageSetString(candidate);
    if (!source || !normalizeRemoteImageUrl(source.value.trim())) return candidate;
    const proxied = replace(source.value.trim()) ?? "data:,";
    return `${candidate.slice(0, source.start)}${source.quote}${proxied}${source.quote}${candidate.slice(source.end)}`;
  });
  return imageSetsRewritten.replace(
    CSS_URL_REGEX,
    (match, doubleQuoted, singleQuoted, unquoted) => {
      const url = doubleQuoted ?? singleQuoted ?? unquoted;
      if (typeof url !== "string" || !normalizeRemoteImageUrl(url.trim())) return match;
      const proxied = replace(url.trim());
      if (!proxied) return 'url("data:,")';
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : "";
      return `url(${quote}${proxied}${quote})`;
    },
  );
}

function transformImageSetCandidates(
  value: string,
  transform: (candidate: string) => string,
): string {
  let result = "";
  let copiedThrough = 0;
  CSS_IMAGE_SET_REGEX.lastIndex = 0;
  while (CSS_IMAGE_SET_REGEX.exec(value)) {
    const openParenthesis = CSS_IMAGE_SET_REGEX.lastIndex - 1;
    const closeParenthesis = findClosingParenthesis(value, openParenthesis);
    if (closeParenthesis === undefined) break;
    const candidates = splitCssFunctionArguments(
      value.slice(openParenthesis + 1, closeParenthesis),
    );
    result += value.slice(copiedThrough, openParenthesis + 1);
    result += candidates.map(transform).join(", ");
    result += ")";
    copiedThrough = closeParenthesis + 1;
    CSS_IMAGE_SET_REGEX.lastIndex = copiedThrough;
  }
  return result + value.slice(copiedThrough);
}

function parseImageSetString(
  candidate: string,
): { value: string; quote: string; start: number; end: number } | undefined {
  const start = candidate.search(/["']/);
  if (start < 0 || candidate.slice(0, start).trim()) return undefined;
  const quote = candidate[start]!;
  for (let position = start + 1; position < candidate.length; position += 1) {
    if (candidate[position] === "\\") {
      position += 1;
      continue;
    }
    if (candidate[position] === quote)
      return {
        value: candidate.slice(start + 1, position),
        quote,
        start,
        end: position + 1,
      };
  }
  return undefined;
}

function findClosingParenthesis(value: string, openParenthesis: number): number | undefined {
  let depth = 1;
  let quote = "";
  for (let position = openParenthesis + 1; position < value.length; position += 1) {
    const character = value[position];
    if (quote) {
      if (character === "\\") position += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") {
      depth -= 1;
      if (depth === 0) return position;
    }
  }
  return undefined;
}

function splitCssFunctionArguments(value: string): string[] {
  const candidates: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let position = 0; position < value.length; position += 1) {
    const character = value[position];
    if (quote) {
      if (character === "\\") position += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (character === "," && depth === 0) {
      candidates.push(value.slice(start, position).trim());
      start = position + 1;
    }
  }
  candidates.push(value.slice(start).trim());
  return candidates.filter(Boolean);
}

function parseSrcset(srcset: string): SrcsetEntry[] {
  const parts = srcset.split(",").map((part) => part.trim());
  const entries: SrcsetEntry[] = [];
  let current = "";
  for (const part of parts) {
    const startsWithUrl = /^(https?:\/\/|\/\/|\/|data:|blob:|cid:)/i.test(part);
    if (!current || hasDescriptor(current) || startsWithUrl) {
      if (current) entries.push(parseSrcsetEntry(current));
      current = part;
    } else current += `,${part}`;
  }
  if (current) entries.push(parseSrcsetEntry(current));
  return entries.filter((entry) => entry.url);
}

function stringifySrcset(entries: SrcsetEntry[]): string {
  return entries
    .map((entry) => (entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url))
    .join(", ");
}

function parseSrcsetEntry(value: string): SrcsetEntry {
  const tokens = value.split(/\s+/);
  const descriptor = tokens.at(-1);
  return descriptor && /^\d+(?:\.\d+)?[wx]$/i.test(descriptor)
    ? { url: tokens.slice(0, -1).join(" "), descriptor }
    : { url: value };
}

function hasDescriptor(value: string): boolean {
  return /\s+\d+(?:\.\d+)?[wx]$/i.test(value.trim());
}
