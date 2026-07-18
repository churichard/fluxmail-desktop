/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailHtml } from "../src/renderer/components/EmailHtml";
import type { FluxmailDesktopApi, MailMessage } from "../src/shared/contracts";

class TestResizeObserver {
  observe(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  globalThis.ResizeObserver = TestResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("EmailHtml remote image consent", () => {
  it("blocks images again when the component is reused for another message", () => {
    installApi(vi.fn(async () => ({})));
    const { container, rerender } = render(
      <EmailHtml message={message("first")} imageRelay={false} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load remote images" }));
    expect(frameSource(container)).toContain('src="https://images.example/first.png"');

    rerender(<EmailHtml message={message("second")} imageRelay={false} />);

    expect(frameSource(container)).toContain('data-remote-src="https://images.example/second.png"');
    expect(frameDocument(container).querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(frameSource(container)).toContain("img-src data: blob:;");
  });

  it("ignores a relay response that belongs to the previous message", async () => {
    let resolveProxy!: (urls: Record<string, string>) => void;
    const proxy = vi.fn(
      () =>
        new Promise<Record<string, string>>((resolve) => {
          resolveProxy = resolve;
        }),
    );
    installApi(proxy);
    const onError = vi.fn();
    const { container, rerender } = render(
      <EmailHtml message={message("first")} imageRelay onError={onError} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load remote images" }));

    rerender(<EmailHtml message={message("second")} imageRelay onError={onError} />);
    await act(async () => {
      resolveProxy({
        "https://images.example/first.png":
          "https://cdn.fluxmail.workers.dev/?url=first&exp=2000000000&sig=test",
      });
      await Promise.resolve();
    });

    expect(
      (screen.getByRole("button", { name: "Load remote images" }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(frameSource(container)).toContain('data-remote-src="https://images.example/second.png"');
    expect(frameSource(container)).not.toContain("cdn.fluxmail.workers.dev");
    expect(onError).not.toHaveBeenCalled();
  });

  it("uses the relay when automatic image loading is enabled", async () => {
    const proxied = "https://cdn.fluxmail.workers.dev/?url=first&exp=2000000000&sig=test";
    const proxy = vi.fn(async () => ({ "https://images.example/first.png": proxied }));
    installApi(proxy);
    const { container } = render(
      <EmailHtml message={message("first")} blockRemoteImages={false} imageRelay />,
    );

    await waitFor(() =>
      expect(frameDocument(container).querySelector("img")?.getAttribute("src")).toBe(proxied),
    );
    expect(frameSource(container)).not.toContain("images.example");
    expect(proxy).toHaveBeenCalledWith(["https://images.example/first.png"]);
  });

  it("does not fall back to direct loading when the relay is unavailable", () => {
    const proxy = vi.fn(async () => ({}));
    installApi(proxy);
    const { container } = render(
      <EmailHtml
        message={message("first")}
        blockRemoteImages={false}
        imageRelay
        imageRelayAvailable={false}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "Image relay unavailable" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(frameDocument(container).querySelector("img")?.hasAttribute("src")).toBe(false);
    expect(frameSource(container)).toContain('data-remote-src="https://images.example/first.png"');
    expect(proxy).not.toHaveBeenCalled();
  });

  it("skips the relay for messages without remote images", async () => {
    const proxy = vi.fn(async () => ({}));
    installApi(proxy);
    const onError = vi.fn();
    render(
      <EmailHtml
        message={{ ...message("plain"), body: { text: "No remote images" } }}
        blockRemoteImages={false}
        imageRelay
        onError={onError}
      />,
    );

    await waitFor(() => expect(onError).not.toHaveBeenCalled());
    expect(proxy).not.toHaveBeenCalled();
  });
});

function installApi(proxy: FluxmailDesktopApi["images"]["proxy"]): void {
  Object.defineProperty(window, "fluxmail", {
    configurable: true,
    value: {
      attachments: { inlineData: vi.fn() },
      images: { proxy },
      system: { openExternal: vi.fn() },
    } as unknown as FluxmailDesktopApi,
  });
}

function message(id: string): MailMessage {
  return {
    id,
    threadId: "thread-1",
    accountId: "account-1",
    to: [{ email: "me@example.com" }],
    subject: id,
    date: "2026-07-18T12:00:00Z",
    body: { html: `<img src="https://images.example/${id}.png">` },
    flags: { read: true, starred: false, draft: false },
  };
}

function frameSource(container: HTMLElement): string {
  return container.querySelector("iframe")?.getAttribute("srcdoc") ?? "";
}

function frameDocument(container: HTMLElement): Document {
  return new DOMParser().parseFromString(frameSource(container), "text/html");
}
