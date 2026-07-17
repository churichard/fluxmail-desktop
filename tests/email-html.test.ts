/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildEmailDocument, hasRemoteImages } from "../src/renderer/components/EmailHtml";

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
