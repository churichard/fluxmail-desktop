/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildEmailDocument,
  EmailHtml,
  hasRemoteImages,
} from "../src/renderer/components/EmailHtml";
import { TrackingPixelIndicator } from "../src/renderer/components/TrackingPixelIndicator";
import { convertEmailToDarkMode } from "../src/renderer/email/convert-to-dark-mode";
import {
  blockTrackingPixels,
  TRACKING_RULESET_METADATA,
} from "../src/renderer/email/tracking-pixels";
import type { MailMessage } from "../src/shared/contracts";

globalThis.ResizeObserver = class ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
} as unknown as typeof ResizeObserver;

afterEach(cleanup);

describe("email HTML security", () => {
  it("removes active content, unsafe navigation, tracking pixels, and remote loads by default", () => {
    const document = buildEmailDocument(
      `<script>alert(1)</script><form action="https://tracker.example"><input></form>
       <iframe src="https://tracker.example"></iframe><a href="javascript:alert(1)">bad</a>
       <img src="https://tracker.example/pixel" width="1"><img src="https://images.example/photo.jpg">
       <div style="background-image:url(https://tracker.example/background)">Hello</div>`,
      {},
      false,
    );
    expect(document).not.toContain("<script");
    expect(document).not.toContain("<form");
    expect(document).not.toContain("<iframe");
    expect(document).not.toContain("javascript:");
    expect(document).not.toContain("tracker.example/pixel");
    expect(document).toContain('data-remote-src="https://images.example/photo.jpg"');
    expect(document).toContain("img-src data: blob:;");
    expect(document).not.toContain("font-src data: https:");
    expect(document).toContain('meta name="referrer" content="no-referrer"');
    expect(document).toContain('id="email-root"');
  });

  it("normalizes fixed email layouts so they fit the reading pane", () => {
    const document = buildEmailDocument(
      '<table width="1200"><tr><td style="white-space: nowrap">A long line</td></tr></table>',
      {},
      false,
    );
    expect(document).toContain("max-width:100%");
    expect(document).toContain('style="white-space: normal;"');
  });

  it("contains message margins so the iframe height includes the whole email", () => {
    const document = buildEmailDocument("<p>First line</p><p>Last line</p>", {}, false);

    expect(document).toContain("#email-root{display:flow-root");
    expect(document).toContain("#email-root>:first-child{margin-block-start:0!important}");
    expect(document).toContain("#email-root>:last-child{margin-block-end:0!important}");
  });

  it("uses a pointer cursor for links inside rendered emails", () => {
    const document = buildEmailDocument('<a href="https://example.com">Example</a>', {}, false);
    expect(document).toMatch(/a\{color:[^;]+;cursor:pointer;/);
  });

  it("keeps HTTP links from email newsletters clickable", () => {
    const href =
      "http://r.email-newsletters.timeout.com/mk/cl/f/sh/WCPzyXJTZ7fg2XUId0vTYhksBEGnwkHR/UEiRvfTGR4mW";
    const document = buildEmailDocument(`<a href="${href}">Summer Streets</a>`, {}, false);

    expect(document).toContain(`href="${href}"`);
  });

  it("resolves CID images locally and permits HTTPS images only after consent", () => {
    const document = buildEmailDocument(
      '<img src="cid:logo"><img src="https://images.example/photo.jpg">',
      { logo: "data:image/png;base64,AAAA" },
      true,
    );
    expect(document).toContain("data:image/png;base64,AAAA");
    expect(document).toContain('src="https://images.example/photo.jpg"');
    expect(document).toContain("img-src data: blob: https:;");
  });

  it("blocks known tracking services even when remote images are allowed", () => {
    const document = buildEmailDocument(
      `<img src="https://t.yesware.com/tt/message-1">
       <img src="https://images.example/photo.jpg" width="600" height="400">`,
      {},
      true,
    );

    expect(document).not.toContain("t.yesware.com");
    expect(document).toContain('src="https://images.example/photo.jpg"');
  });

  it("blocks hidden and tracking-shaped images without removing responsive content", () => {
    const document = buildEmailDocument(
      `<img src="https://images.example/hidden.gif" style="display: none">
       <img src="https://images.example/css-pixel.gif" style="width: 1px; height: 1px">
       <img src="https://images.example/open/message-1/pixel.gif?recipient_id=abc">
       <img src="https://track.example.com/newsletter.jpg" style="width: 100%; max-width: 600px">`,
      {},
      true,
    );

    expect(document).not.toContain("hidden.gif");
    expect(document).not.toContain("css-pixel.gif");
    expect(document).not.toContain("recipient_id=abc");
    expect(document).toContain('src="https://track.example.com/newsletter.jpg"');
  });

  it("keeps compact inline data images", () => {
    const inlineIcon =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 10'%3E%3Cpath d='M0 0h10v10H0z'/%3E%3C/svg%3E";
    const document = buildEmailDocument(
      `<img src="${inlineIcon}" width="64" height="64">`,
      {},
      true,
    );

    expect(document).toContain(inlineIcon);
  });

  it("records the public sources and audit date for the bundled rules", () => {
    expect(TRACKING_RULESET_METADATA.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
    expect(TRACKING_RULESET_METADATA.auditedAt).toBe("2026-07-18");
    expect(TRACKING_RULESET_METADATA.sources).toHaveLength(3);
  });

  it("blocks current email tracking services even when they claim content dimensions", () => {
    const trackingUrls = [
      "https://mailer.example/tr/op/message-1",
      "https://open.example.awstrack.me/CI0/0/abc",
      "https://e.customeriomail.com/e/o/message-1",
      "https://clicks.mlsend.com/pixel.gif",
      "https://link.mail.beehiiv.com/ss/message-1.gif",
      "https://eotrx.substackcdn.com/open.gif",
      "https://email.brand.com/o/message-1",
      "https://cdn.shopify.com/shopifycloud/shopify/assets/themes_support/notifications/spacer-1.png",
      "https://github.com/notifications/beacon/message-1.gif",
      "https://t.paypal.com/ts?v=1",
      "https://flask.us.nextdoor.com/open.gif",
      "https://email.mgtp01.squarespace-mail.com/open.gif",
      "https://open.convertkit-mail2.com/o/message-1",
      "https://mail.example/e/o/YWJjZA==",
      "https://click.icptrack.com/icp/track/message-1",
      "https://mkt4477.com/open/message-1",
      "https://strongview.com/t/message-1",
    ];
    const document = buildEmailDocument(
      trackingUrls.map((url) => `<img src="${url}" width="600" height="400">`).join(""),
      {},
      true,
    );

    for (const url of trackingUrls) expect(document).not.toContain(url);
  });

  it("uses hostname boundaries and keeps ordinary small or attributed images", () => {
    const document = buildEmailDocument(
      `<img src="https://notmailchimp.com/photo.jpg">
       <img src="https://facebook.com/logo.png">
       <img src="https://images.example/photo.jpg?utm_source=newsletter">
       <img src="https://images.example/divider.png" width="600" height="1">
       <img src="https://cdn.example.com/e/o/product-hero.jpg" width="600" height="400">
       <img src="https://track.example.com/campaign-hero.jpg" style="width: 600px; height: 400px">`,
      {},
      true,
    );

    expect(document).toContain('src="https://notmailchimp.com/photo.jpg"');
    expect(document).toContain('src="https://facebook.com/logo.png"');
    expect(document).toContain('src="https://images.example/photo.jpg?utm_source=newsletter"');
    expect(document).toContain('src="https://images.example/divider.png"');
    expect(document).toContain('src="https://cdn.example.com/e/o/product-hero.jpg"');
    expect(document).toContain('src="https://track.example.com/campaign-hero.jpg"');
  });

  it("blocks trackers in img and picture srcsets", () => {
    const document = buildEmailDocument(
      `<picture>
         <source srcset="https://t.yesware.com/t/message-1.gif 2x">
         <img src="https://images.example/fallback.jpg" width="600" height="400">
       </picture>
       <img srcset="https://eotrx.substackcdn.com/open.gif 1x">`,
      {},
      true,
    );

    expect(document).not.toContain("t.yesware.com");
    expect(document).not.toContain("eotrx.substackcdn.com");
    expect(document).toContain('src="https://images.example/fallback.jpg"');
  });

  it("preserves safe image and picture candidates when a srcset includes a tracker", () => {
    const document = buildEmailDocument(
      `<picture>
         <source srcset="https://t.yesware.com/t/message-1.gif 1x, https://images.example/hero.webp 2x">
         <img
           src="https://images.example/fallback.jpg"
           srcset="https://eotrx.substackcdn.com/open.gif 1x, https://images.example/hero.jpg 2x"
           width="600"
           height="400"
         >
       </picture>`,
      {},
      true,
    );

    expect(document).not.toContain("t.yesware.com");
    expect(document).not.toContain("eotrx.substackcdn.com");
    expect(document).toContain('src="https://images.example/fallback.jpg"');
    expect(document).toContain('srcset="https://images.example/hero.webp 2x"');
    expect(document).toContain('srcset="https://images.example/hero.jpg 2x"');
  });

  it("blocks tracking URLs in legacy backgrounds and inline or stylesheet CSS", () => {
    const parsed = new DOMParser().parseFromString(
      `<style>.tracked { background-image: url(https://eotrx.substackcdn.com/open.gif); }</style>
       <table background="https://t.yesware.com/t/message-1.gif"><tr><td>Tracked</td></tr></table>
       <div style="background: #fff url('https://link.mail.beehiiv.com/ss/message.gif')">Tracked</div>
       <div style="background-image: url(https://images.example/content.png)">Content</div>`,
      "text/html",
    );

    const report = blockTrackingPixels(parsed);

    expect(report.blockedCount).toBe(3);
    expect(report.trackingPixels.map((pixel) => pixel.domain)).toEqual([
      "t.yesware.com",
      "link.mail.beehiiv.com",
      "eotrx.substackcdn.com",
    ]);
    expect(parsed.documentElement.innerHTML).not.toContain("eotrx.substackcdn.com");
    expect(parsed.documentElement.innerHTML).not.toContain("t.yesware.com");
    expect(parsed.documentElement.innerHTML).not.toContain("link.mail.beehiiv.com");
    expect(parsed.documentElement.innerHTML).toContain("https://images.example/content.png");
  });

  it("blocks string-form image-set trackers while preserving safe candidates", () => {
    const parsed = new DOMParser().parseFromString(
      `<style>
         .mixed {
           background-image: image-set(
             "https://t.yesware.com/t/message-1.gif" 1x,
             "https://images.example/content.png" 2x
           );
         }
         .tracked {
           background-image: -webkit-image-set(
             "https://eotrx.substackcdn.com/open.gif" 1x
           );
         }
       </style>`,
      "text/html",
    );

    const report = blockTrackingPixels(parsed);

    expect(report.blockedCount).toBe(2);
    expect(parsed.documentElement.innerHTML).not.toContain("t.yesware.com");
    expect(parsed.documentElement.innerHTML).not.toContain("eotrx.substackcdn.com");
    expect(parsed.documentElement.innerHTML).toContain("https://images.example/content.png");
  });

  it("keeps legitimate content in CSS, legacy backgrounds, and picture sources", () => {
    const parsed = new DOMParser().parseFromString(
      `<style>.hero { background-image: url(https://track.example.com/campaign-hero.jpg); }</style>
       <table background="https://track.example.com/campaign-background.jpg"><tr><td>Hero</td></tr></table>
       <picture>
         <source srcset="https://track.example.com/campaign-hero.webp 2x">
         <img src="https://images.example/fallback.jpg" width="600" height="400">
       </picture>`,
      "text/html",
    );

    const report = blockTrackingPixels(parsed);

    expect(report.blockedCount).toBe(0);
    expect(parsed.documentElement.innerHTML).toContain(
      "https://track.example.com/campaign-hero.jpg",
    );
    expect(parsed.documentElement.innerHTML).toContain(
      "https://track.example.com/campaign-background.jpg",
    );
    expect(parsed.documentElement.innerHTML).toContain(
      "https://track.example.com/campaign-hero.webp",
    );
  });

  it("blocks SVG image trackers and honors the targeted allowlist", () => {
    const svg = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg">
         <image href="https://t.yesware.com/t/message-1.gif" />
         <image href="https://images.example/content.png" />
       </svg>`,
      "image/svg+xml",
    );
    blockTrackingPixels(svg);
    expect(svg.querySelectorAll("image")).toHaveLength(1);
    expect(svg.documentElement.innerHTML).toContain("https://images.example/content.png");

    const allowlisted = buildEmailDocument(
      '<img src="https://permies.com/t/community/a/" width="1" height="600">',
      {},
      true,
    );
    expect(allowlisted).toContain('src="https://permies.com/t/community/a/"');
  });

  it("renders email content with the selected desktop theme", () => {
    const lightDocument = buildEmailDocument("<p>Hello</p>", {}, false);
    const darkDocument = buildEmailDocument("<p>Hello</p>", {}, false, true);
    expect(lightDocument).toContain("background:#ffffff");
    expect(darkDocument).toContain('content="dark"');
    expect(darkDocument).toContain("background:#28292c");
    expect(darkDocument).toContain("color:#eeeeee");
  });

  it("converts sender-defined dark text for a dark reading pane", () => {
    const document = buildEmailDocument(
      `<style>.copy { color: #000000; }</style>
       <table bgcolor="#ffffff"><tr><td class="copy" style="color: rgb(32, 33, 36)">Readable text</td></tr></table>`,
      {},
      false,
      true,
    );

    expect(document).not.toMatch(/color:\s*(?:#000(?:000)?|rgb\(32,\s*33,\s*36\))/i);
    expect(document).not.toContain('bgcolor="#ffffff"');
    expect(document).toContain("Readable text");
  });

  it("removes sender dark-mode overrides when rendering in light mode", () => {
    const document = buildEmailDocument(
      `<style>@media (prefers-color-scheme: dark) { p { color: white; } }</style><p>Hello</p>`,
      {},
      false,
    );

    expect(document).not.toContain("prefers-color-scheme");
  });

  it("does not inline media-scoped stylesheet rules", () => {
    const document = convertEmailToDarkMode(
      `<style media="(max-width: 600px)">.desktop { display: none; }</style>
       <style>.desktop { font-weight: bold; }</style>
       <div class="desktop">Desktop content</div>`,
    );

    expect(document).toContain("font-weight: bold");
    expect(document).not.toContain("display: none");
    expect(document).toContain("Desktop content");
  });

  it("removes inline color-scheme declarations without dropping surrounding content", () => {
    const html = '<div style="color-scheme: light">First</div><p style="color: red">Second</p>';

    for (const darkMode of [false, true]) {
      const document = buildEmailDocument(html, {}, false, darkMode);
      expect(document).toContain("First");
      expect(document).toContain("Second");
      expect(document).not.toContain("color-scheme: light");
    }
  });

  it("transforms fallback and gradient colors in background shorthands", () => {
    const document = buildEmailDocument(
      `<div style="background: #fff url(https://images.example/background.png); color: #000">Image fallback</div>
       <div style="background: linear-gradient(#fff, #eee); color: #000">Gradient</div>`,
      {},
      false,
      true,
    );

    expect(document).toContain("url(https://images.example/background.png)");
    expect(document).not.toMatch(/background:\s*#fff\b/i);
    expect(document).not.toMatch(/linear-gradient\([^)]*#(?:fff|eee)\b/i);
  });

  it("keeps table styles within their own declarations", () => {
    const document = buildEmailDocument(
      '<table><tr><td style="color: #000">First</td><td style="color: #000">Second</td></tr></table>',
      {},
      false,
      true,
    );

    expect(document).not.toContain("#555555eee");
    expect(document.match(/color: #eeeeee !important/g)).toHaveLength(2);
  });

  it("converts inline text colors on every HTML tag", () => {
    const document = buildEmailDocument(
      '<small style="color: rgb(32, 33, 36)">Fine print</small><code style="color: #444444">Code</code><section style="color: #555555">Section</section>',
      {},
      false,
      true,
    );

    expect(document).not.toContain("rgb(32, 33, 36)");
    expect(document).not.toContain("color: #444444");
    expect(document).not.toContain("color: #555555");
  });

  it("uses readable inherited text on medium-light backgrounds", () => {
    const document = buildEmailDocument(
      '<div style="background-color: #b0b0b0"><span>Child text</span></div>',
      {},
      false,
      true,
    );

    expect(document).toContain("background-color: #b0b0b0 !important");
    expect(document).toContain("color: #3b3b3b !important");
    expect(document).toContain("<span>Child text</span>");
  });

  it("preserves explicit table borders and spacing", () => {
    const document = buildEmailDocument(
      '<table border="1" style="border: 2px solid #cccccc; border-collapse: separate; border-spacing: 12px"><tr><td>Box</td></tr></table>',
      {},
      false,
      true,
    );

    expect(document).toContain('border="1"');
    expect(document).toContain("border: 2px solid #555555 !important");
    expect(document).toContain("border-spacing: 12px");
    expect(document).not.toContain("border: none");
  });

  it("preserves layered inline background fallbacks", () => {
    const document = buildEmailDocument(
      '<div style="background: #fff; background: linear-gradient(#fff, #eee); color: #000">Gradient</div>',
      {},
      false,
      true,
    );

    expect(document).toContain("background: #fff");
    expect(document).toMatch(/background: linear-gradient\((?![^)]*#(?:fff|eee)\b)[^)]+\)/i);
  });

  it("lightens translucent dark text while preserving its alpha", () => {
    const document = buildEmailDocument(
      '<p style="color: rgba(0, 0, 0, 0.5)">Secondary text</p>',
      {},
      false,
      true,
    );

    expect(document).toContain("rgba(235, 235, 235, 0.5)");
    expect(document).not.toContain("rgba(0, 0, 0, 0.5)");
  });

  it("preserves semicolons inside inline CSS values", () => {
    const dataUrl = "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E";
    const document = buildEmailDocument(
      `<div style="background-image: url(${dataUrl}); color: #000">Background</div>`,
      {},
      false,
      true,
    );

    expect(document).toContain(`background-image: url(${dataUrl})`);
  });

  it("lets the sandbox opt into HTTPS images without enabling them by default", () => {
    const shell = readFileSync(path.join(process.cwd(), "index.html"), "utf8");
    expect(shell).toContain("img-src 'self' data: blob: https:");
    expect(buildEmailDocument('<img src="https://images.example/photo.jpg">', {}, false)).toContain(
      "img-src data: blob:;",
    );
  });

  it("detects valid remote image attributes before offering to load them", () => {
    expect(hasRemoteImages('<img src = "https://images.example/photo.jpg">')).toBe(true);
    expect(
      hasRemoteImages(
        '<picture><source srcset="https://images.example/photo.webp 2x"><img src="cid:photo"></picture>',
      ),
    ).toBe(true);
    expect(
      hasRemoteImages(
        '<div style="background-image:url(https://images.example/background.png)">Image</div>',
      ),
    ).toBe(true);
    expect(hasRemoteImages('<table background="https://images.example/background.png">')).toBe(
      true,
    );
    expect(
      hasRemoteImages('<svg><image href="https://images.example/vector.png"></image></svg>'),
    ).toBe(false);
    expect(
      hasRemoteImages(
        '<div class="hero">Hero</div><style>.hero { background-image: url(https://images.example/hero.png); }</style>',
      ),
    ).toBe(true);
    expect(
      hasRemoteImages(
        "<style>@font-face { font-family: Mail; src: url(https://fonts.example/mail.woff2); }</style>",
      ),
    ).toBe(false);
    expect(
      hasRemoteImages("<style>/* https://images.example/comment.png */ p { color: red; }</style>"),
    ).toBe(false);
    expect(
      hasRemoteImages(
        '<div style="--hero: url(https://images.example/hero.png); background-image: var(--hero)">Hero</div>',
      ),
    ).toBe(true);
    expect(
      hasRemoteImages(
        '<div class="hero">Hero</div><style>:root { --hero: url(https://images.example/hero.png); } .hero { background-image: var(--hero); }</style>',
      ),
    ).toBe(true);
    expect(hasRemoteImages('<img src="https://t.yesware.com/t/message-1.gif">')).toBe(false);
    expect(hasRemoteImages('<img src="cid:photo">')).toBe(false);
  });

  it("loads remote images automatically when image blocking is off", async () => {
    const message: MailMessage = {
      id: "message-1",
      threadId: "thread-1",
      accountId: "account-1",
      from: { email: "sender@example.com" },
      to: [{ email: "me@example.com" }],
      subject: "Remote image",
      date: "2026-07-18T12:00:00Z",
      body: { html: '<img src="https://images.example/photo.jpg">' },
      flags: { read: true, starred: false, draft: false },
    };
    const rendered = render(createElement(EmailHtml, { message, blockRemoteImages: false }));

    expect(screen.queryByRole("button", { name: "Load remote images" })).toBeNull();
    expect(screen.getByTitle("Email message").getAttribute("srcdoc")).toContain(
      'src="https://images.example/photo.jpg"',
    );

    rendered.rerender(createElement(EmailHtml, { message, blockRemoteImages: true }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Load remote images" })).toBeTruthy(),
    );
    expect(screen.getByTitle("Email message").getAttribute("srcdoc")).toContain(
      'data-remote-src="https://images.example/photo.jpg"',
    );
  });

  it("shows blocked tracking domains when the privacy indicator is hovered", async () => {
    render(
      createElement(TrackingPixelIndicator, {
        trackingPixels: [
          {
            url: "https://t.yesware.com/t/message-1.gif",
            domain: "t.yesware.com",
            reason: "Known tracking service",
          },
          {
            url: "https://eotrx.substackcdn.com/open.gif",
            domain: "eotrx.substackcdn.com",
            reason: "Known tracking service",
          },
        ],
      }),
    );

    const indicator = screen.getByLabelText("Blocked 2 tracking pixels");
    fireEvent.pointerEnter(indicator.parentElement!);

    const tooltip = await screen.findByRole("tooltip", { name: /Blocked 2 tracking pixels/ });
    expect(tooltip.textContent).toContain("t.yesware.com");
    expect(tooltip.textContent).toContain("eotrx.substackcdn.com");
    expect(tooltip.textContent).toContain("Known tracking service");
  });

  it("reports blocked tracking pixels to the message header", async () => {
    const message: MailMessage = {
      id: "message-1",
      threadId: "thread-1",
      accountId: "account-1",
      from: { email: "sender@example.com" },
      to: [{ email: "me@example.com" }],
      subject: "Tracked message",
      date: "2026-07-18T12:00:00Z",
      body: { html: '<img src="https://t.yesware.com/t/message-1.gif">' },
      flags: { read: true, starred: false, draft: false },
    };
    const onTrackingPixelsChange = vi.fn();

    render(
      createElement(EmailHtml, {
        message,
        blockRemoteImages: true,
        onTrackingPixelsChange,
      }),
    );

    await waitFor(() =>
      expect(onTrackingPixelsChange).toHaveBeenCalledWith([
        expect.objectContaining({ domain: "t.yesware.com" }),
      ]),
    );
  });
});
