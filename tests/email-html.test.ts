/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEmailDocument, hasRemoteImages } from "../src/renderer/components/EmailHtml";
import { convertEmailToDarkMode } from "../src/renderer/email/convert-to-dark-mode";

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
    expect(hasRemoteImages('<img src="cid:photo">')).toBe(false);
  });
});
