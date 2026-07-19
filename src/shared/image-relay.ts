const IMAGE_TRACKING_PARAMETERS = new Set([
  "_hsenc",
  "_hsmi",
  "dclid",
  "fbclid",
  "gclid",
  "gbraid",
  "igshid",
  "li_fat_id",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "msclkid",
  "oly_anon_id",
  "oly_enc_id",
  "s_cid",
  "sc_cid",
  "ttclid",
  "twclid",
  "vero_conv",
  "vero_id",
  "wbraid",
]);

export function normalizeRemoteImageUrl(value: string): string | undefined {
  try {
    const trimmed = value.trim();
    const url = new URL(trimmed.startsWith("//") ? `https:${trimmed}` : trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    if (url.port && url.port !== "80" && url.port !== "443") return undefined;
    if (!url.hostname || trimmed.length > 2048) return undefined;

    const trackingKeys = new Set<string>();
    for (const key of url.searchParams.keys()) {
      const normalizedKey = key.toLowerCase();
      if (normalizedKey.startsWith("utm_") || IMAGE_TRACKING_PARAMETERS.has(normalizedKey)) {
        trackingKeys.add(key);
      }
    }
    for (const key of trackingKeys) url.searchParams.delete(key);

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
