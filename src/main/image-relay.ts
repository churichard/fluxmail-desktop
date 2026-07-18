import { z } from "zod";
import { normalizeRemoteImageUrl } from "../shared/image-relay";

export const IMAGE_RELAY_SIGN_ENDPOINT = "https://fluxmail.ai/api/image-proxy/sign";
export const IMAGE_RELAY_ORIGIN = "https://cdn.fluxmail.workers.dev";

const MAX_URLS_PER_REQUEST = 50;
const relayUrlSchema = z
  .string()
  .url()
  .refine((value) => new URL(value).origin === IMAGE_RELAY_ORIGIN);
const signedResponseSchema = z.object({
  signedUrls: z.record(relayUrlSchema),
  requestedUrls: z.record(relayUrlSchema),
  expiresAt: z.number().int().positive(),
});

type RelayFetch = (input: string, init: RequestInit) => Promise<Response>;

export class HostedImageRelay {
  private readonly cache = new Map<string, { proxyUrl: string; expiresAt: number }>();

  constructor(
    private readonly identityTokens: (forceRefresh?: boolean) => Promise<string[]>,
    private readonly fetch: RelayFetch,
    private readonly endpoint = IMAGE_RELAY_SIGN_ENDPOINT,
  ) {}

  async proxy(rawUrls: string[]): Promise<Record<string, string>> {
    const urls = [...new Set(rawUrls.flatMap((url) => normalizeRemoteImageUrl(url) ?? []))];
    const result: Record<string, string> = {};
    const missing: string[] = [];
    const now = Date.now();

    for (const url of urls) {
      const cached = this.cache.get(url);
      if (cached && cached.expiresAt * 1000 > now + 60_000) result[url] = cached.proxyUrl;
      else missing.push(url);
    }

    if (!missing.length) return result;
    let tokens = await this.identityTokens();
    for (let offset = 0; offset < missing.length; offset += MAX_URLS_PER_REQUEST) {
      const batch = missing.slice(offset, offset + MAX_URLS_PER_REQUEST);
      let signed = await this.sign(batch, tokens);
      if (!signed) {
        tokens = await this.identityTokens(true);
        signed = await this.sign(batch, tokens);
      }
      if (!signed) throw relayResponseError(401);

      tokens = [signed.token, ...tokens.filter((token) => token !== signed.token)];
      for (const [url, proxyUrl] of Object.entries(signed.response.requestedUrls)) {
        if (!batch.includes(url)) continue;
        this.cache.set(url, { proxyUrl, expiresAt: signed.response.expiresAt });
        result[url] = proxyUrl;
      }
    }

    return result;
  }

  private async sign(
    urls: string[],
    tokens: string[],
  ): Promise<{ response: z.infer<typeof signedResponseSchema>; token: string } | undefined> {
    for (const token of new Set(tokens)) {
      const response = await this.fetch(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ urls }),
      });
      if (response.status === 401) continue;
      if (!response.ok) throw relayResponseError(response.status);
      return { response: signedResponseSchema.parse(await response.json()), token };
    }
    return undefined;
  }
}

function relayResponseError(status: number): Error {
  if (status === 401)
    return new Error(
      "The image relay could not verify this account. Reconnect Gmail and try again.",
    );
  if (status === 501) return new Error("The Fluxmail image relay is not available right now.");
  return new Error(`The Fluxmail image relay returned HTTP ${status}.`);
}
