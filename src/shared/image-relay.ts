export function normalizeRemoteImageUrl(value: string): string | undefined {
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.port && url.port !== "80" && url.port !== "443") return undefined;
    if (!url.hostname || trimmed.length > 2048) return undefined;

    return [...url.toString()]
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code > 31 && code !== 127;
      })
      .join("");
  } catch {
    return undefined;
  }
}
