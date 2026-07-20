import { describe, expect, it, vi } from "vitest";
import { HostedImageRelay, HostedImageRelayAccess } from "../src/main/image-relay";
import { normalizeRemoteImageUrl } from "../src/shared/image-relay";

describe("hosted image relay", () => {
  it("normalizes image URLs and removes known tracking parameters", () => {
    expect(
      normalizeRemoteImageUrl(
        "https://images.example/photo.png?utm_source=email&size=large&FBCLID=click&mc_eid=user#tracking",
      ),
    ).toBe("https://images.example/photo.png?size=large#tracking");
    expect(normalizeRemoteImageUrl("//images.example/photo.png")).toBe(
      "https://images.example/photo.png",
    );
    expect(normalizeRemoteImageUrl("file:///tmp/image.png")).toBeUndefined();
    expect(normalizeRemoteImageUrl("https://images.example:8443/image.png")).toBeUndefined();
  });

  it("exchanges a license lease once and caches the access token", async () => {
    const licenseLease = vi.fn(async () => "signed-license-lease");
    const fetch = vi.fn(async (_input: string, _init: RequestInit) =>
      Response.json({
        accessToken: "relay-access-token",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      }),
    );
    const access = new HostedImageRelayAccess(licenseLease, fetch);

    await expect(access.token()).resolves.toBe("relay-access-token");
    await expect(access.token()).resolves.toBe("relay-access-token");

    expect(licenseLease).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: "License signed-license-lease",
    });
  });

  it("shares an in-flight access token request", async () => {
    let resolveResponse!: (response: Response) => void;
    const licenseLease = vi.fn(async () => "signed-license-lease");
    const fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveResponse = resolve;
        }),
    );
    const access = new HostedImageRelayAccess(licenseLease, fetch);

    const first = access.token();
    const second = access.token();
    await Promise.resolve();

    expect(licenseLease).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();

    resolveResponse(
      Response.json({
        accessToken: "relay-access-token",
        expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      }),
    );
    await expect(Promise.all([first, second])).resolves.toEqual([
      "relay-access-token",
      "relay-access-token",
    ]);
  });

  it("refreshes the license lease once when the exchange rejects it", async () => {
    const licenseLease = vi
      .fn<(forceRefresh?: boolean) => Promise<string>>()
      .mockResolvedValueOnce("expired-license-lease")
      .mockResolvedValueOnce("fresh-license-lease");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          accessToken: "relay-access-token",
          expiresAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        }),
      );
    const access = new HostedImageRelayAccess(licenseLease, fetch);

    await expect(access.token()).resolves.toBe("relay-access-token");
    expect(licenseLease).toHaveBeenNthCalledWith(1, false);
    expect(licenseLease).toHaveBeenNthCalledWith(2, true);
  });

  it("explains when the current plan is not eligible", async () => {
    const onAccessDenied = vi.fn();
    const access = new HostedImageRelayAccess(
      async () => "personal-license-lease",
      async () => new Response(null, { status: 403 }),
      onAccessDenied,
    );

    await expect(access.token()).rejects.toThrow(
      "Private image relay is available on Pro, Team, and Enterprise.",
    );
    expect(onAccessDenied).toHaveBeenCalledOnce();
  });

  it("authenticates, batches, and caches signed relay URLs", async () => {
    const accessToken = vi.fn(async () => "relay-access-token");
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
    const relay = new HostedImageRelay(accessToken, fetch);
    const urls = Array.from(
      { length: 51 },
      (_, index) => `https://images.example/${index}.png?utm_source=email`,
    );

    const first = await relay.proxy(urls);
    const second = await relay.proxy(urls);

    expect(Object.keys(first)).toHaveLength(51);
    expect(second).toEqual(first);
    expect(accessToken).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]?.[1].headers).toMatchObject({
      Authorization: "Bearer relay-access-token",
    });
  });

  it("removes expired entries and evicts the least recently used signed URLs", async () => {
    let now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const accessToken = vi.fn(async () => "relay-access-token");
    const fetch = vi.fn(async (_input: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { urls: string[] };
      const expiresAt = Math.floor(now / 1_000) + 120;
      const requestedUrls = Object.fromEntries(
        body.urls.map((url) => [
          url,
          `https://cdn.fluxmail.workers.dev/?url=${encodeURIComponent(url)}&exp=${expiresAt}&sig=test`,
        ]),
      );
      return Response.json({ signedUrls: requestedUrls, requestedUrls, expiresAt });
    });
    const relay = new HostedImageRelay(accessToken, fetch, undefined, 2);
    const first = "https://images.example/first.png";
    const second = "https://images.example/second.png";
    const third = "https://images.example/third.png";

    await relay.proxy([first, second]);
    await relay.proxy([first]);
    await relay.proxy([third]);
    await relay.proxy([second]);

    expect(fetch).toHaveBeenCalledTimes(3);

    now += 61_000;
    await relay.proxy([first]);

    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("refreshes rejected access tokens once without falling back to a direct load", async () => {
    const accessToken = vi
      .fn<(forceRefresh?: boolean) => Promise<string>>()
      .mockResolvedValueOnce("expired-token")
      .mockResolvedValueOnce("refreshed-token");
    const relay = new HostedImageRelay(
      accessToken,
      async () => new Response(null, { status: 401 }),
    );

    await expect(relay.proxy(["https://images.example/photo.png"])).rejects.toThrow(
      "Check your license",
    );
    expect(accessToken).toHaveBeenNthCalledWith(1);
    expect(accessToken).toHaveBeenNthCalledWith(2, true);
  });
});
