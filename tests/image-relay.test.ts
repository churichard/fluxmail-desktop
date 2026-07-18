import { describe, expect, it, vi } from "vitest";
import { HostedImageRelay } from "../src/main/image-relay";
import { normalizeRemoteImageUrl } from "../src/shared/image-relay";

describe("hosted image relay", () => {
  it("normalizes image URLs without copying the server's tracking rules", () => {
    expect(
      normalizeRemoteImageUrl(
        "https://images.example/photo.png?utm_source=email&size=large#tracking",
      ),
    ).toBe("https://images.example/photo.png?utm_source=email&size=large#tracking");
    expect(normalizeRemoteImageUrl("//images.example/photo.png")).toBe(
      "https://images.example/photo.png",
    );
    expect(normalizeRemoteImageUrl("file:///tmp/image.png")).toBeUndefined();
    expect(normalizeRemoteImageUrl("https://images.example:8443/image.png")).toBeUndefined();
  });

  it("authenticates, batches, and caches signed relay URLs", async () => {
    const identityTokens = vi.fn(async () => ["google-id-token"]);
    const fetch = vi.fn(async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { urls: string[] };
      const requestedUrls = Object.fromEntries(
        body.urls.map((url) => [
          url,
          `https://cdn.fluxmail.workers.dev/?url=${encodeURIComponent(url)}&exp=2000000000&sig=test`,
        ]),
      );
      return Response.json({
        signedUrls: requestedUrls,
        requestedUrls,
        expiresAt: 2_000_000_000,
      });
    });
    const relay = new HostedImageRelay(identityTokens, fetch);
    const urls = Array.from(
      { length: 51 },
      (_, index) => `https://images.example/${index}.png?utm_source=email`,
    );

    const first = await relay.proxy(urls);
    const second = await relay.proxy(urls);

    expect(Object.keys(first)).toHaveLength(51);
    expect(second).toEqual(first);
    expect(identityTokens).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: "Bearer google-id-token",
    });
  });

  it("does not fall back to a direct load when authorization fails", async () => {
    const identityTokens = vi
      .fn<(forceRefresh?: boolean) => Promise<string[]>>()
      .mockResolvedValueOnce(["expired-token"])
      .mockResolvedValueOnce(["refreshed-token"]);
    const relay = new HostedImageRelay(
      identityTokens,
      async () => new Response(null, { status: 401 }),
    );

    await expect(relay.proxy(["https://images.example/photo.png"])).rejects.toThrow(
      "Reconnect Gmail",
    );
    expect(identityTokens).toHaveBeenNthCalledWith(1);
    expect(identityTokens).toHaveBeenNthCalledWith(2, true);
  });

  it("refreshes rejected identity tokens and retries once", async () => {
    const identityTokens = vi
      .fn<(forceRefresh?: boolean) => Promise<string[]>>()
      .mockResolvedValueOnce(["stale-token"])
      .mockResolvedValueOnce(["fresh-token"]);
    const fetch = vi.fn(async (_input: string, init: RequestInit) => {
      const token = new Headers(init.headers).get("Authorization");
      if (token !== "Bearer fresh-token") return new Response(null, { status: 401 });
      const body = JSON.parse(String(init.body)) as { urls: string[] };
      const requestedUrls = Object.fromEntries(
        body.urls.map((url) => [
          url,
          "https://cdn.fluxmail.workers.dev/?url=image&exp=2000000000&sig=test",
        ]),
      );
      return Response.json({ signedUrls: requestedUrls, requestedUrls, expiresAt: 2_000_000_000 });
    });
    const relay = new HostedImageRelay(identityTokens, fetch);

    await expect(relay.proxy(["https://images.example/photo.png"])).resolves.toHaveProperty(
      "https://images.example/photo.png",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("tries other active Gmail identities when one OAuth audience is rejected", async () => {
    const identityTokens = vi.fn(async () => ["custom-client-token", "allowed-client-token"]);
    const fetch = vi.fn(async (_input: string, init: RequestInit) => {
      const token = new Headers(init.headers).get("Authorization");
      if (token !== "Bearer allowed-client-token") return new Response(null, { status: 401 });
      const body = JSON.parse(String(init.body)) as { urls: string[] };
      const requestedUrls = Object.fromEntries(
        body.urls.map((url) => [
          url,
          "https://cdn.fluxmail.workers.dev/?url=image&exp=2000000000&sig=test",
        ]),
      );
      return Response.json({ signedUrls: requestedUrls, requestedUrls, expiresAt: 2_000_000_000 });
    });
    const relay = new HostedImageRelay(identityTokens, fetch);

    await expect(relay.proxy(["https://images.example/photo.png"])).resolves.toHaveProperty(
      "https://images.example/photo.png",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(identityTokens).toHaveBeenCalledOnce();
  });
});
