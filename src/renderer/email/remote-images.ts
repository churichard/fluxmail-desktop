import { normalizeRemoteImageUrl } from "../../shared/image-relay";

const CSS_URL_REGEX = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

interface SrcsetEntry {
  url: string;
  descriptor?: string;
}

export function collectRemoteImageUrls(html: string): string[] {
  const document = new DOMParser().parseFromString(html, "text/html");
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
    for (const url of cssUrls(element.getAttribute("style") ?? "")) add(url);
  for (const style of document.querySelectorAll("style"))
    for (const url of cssUrls(style.textContent ?? "")) add(url);

  return [...urls];
}

export function rewriteRemoteImageUrls(
  document: Document,
  relayUrls: Record<string, string>,
): void {
  const replacement = (value: string): string | undefined => {
    const normalized = normalizeRemoteImageUrl(value);
    return normalized ? relayUrls[normalized] : undefined;
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

function cssUrls(value: string): string[] {
  const urls: string[] = [];
  value.replace(CSS_URL_REGEX, (match, _quote, url: unknown) => {
    if (typeof url === "string" && url.trim()) urls.push(url.trim());
    return match;
  });
  return urls;
}

function rewriteCss(value: string, replace: (url: string) => string | undefined): string {
  return value.replace(CSS_URL_REGEX, (match, quote: string, url: unknown) => {
    if (typeof url !== "string" || !normalizeRemoteImageUrl(url.trim())) return match;
    const proxied = replace(url.trim());
    if (!proxied) return 'url("data:,")';
    return `url(${quote}${proxied}${quote})`;
  });
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
