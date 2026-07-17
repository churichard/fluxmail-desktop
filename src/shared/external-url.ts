const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

export function parseExternalUrl(rawUrl: string): URL | undefined {
  try {
    const url = new URL(rawUrl);
    return EXTERNAL_PROTOCOLS.has(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
