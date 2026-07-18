import { useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { Image as ImageIcon } from "lucide-react";
import type { MailMessage } from "../../shared/contracts";
import { parseExternalUrl } from "../../shared/external-url";
import { convertEmailToDarkMode, removeSenderDarkModeCSS } from "../email/convert-to-dark-mode";

export function EmailHtml({
  message,
  blockRemoteImages = true,
  onError,
}: {
  message: MailMessage;
  blockRemoteImages?: boolean;
  onError?(message: string): void;
}) {
  const [loadImages, setLoadImages] = useState(!blockRemoteImages);
  const [cidUrls, setCidUrls] = useState<Record<string, string>>({});
  const [height, setHeight] = useState(120);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const clickCleanupRef = useRef<(() => void) | undefined>(undefined);
  const frameResizeObserverRef = useRef<ResizeObserver | undefined>(undefined);
  const darkMode = useResolvedDarkTheme();

  useEffect(() => setLoadImages(!blockRemoteImages), [blockRemoteImages]);

  useEffect(
    () => () => {
      resizeObserverRef.current?.disconnect();
      frameResizeObserverRef.current?.disconnect();
      clickCleanupRef.current?.();
    },
    [],
  );

  useEffect(() => {
    const inline = (message.attachments ?? []).filter((attachment) => attachment.contentId);
    setCidUrls({});
    if (!inline.length) return;
    let canceled = false;
    void Promise.allSettled(
      inline.map(async (attachment) => {
        const data = await window.fluxmail.attachments.inlineData({
          accountId: message.accountId,
          messageId: message.id,
          attachmentId: attachment.id,
          mimeType: attachment.mimeType,
        });
        return [attachment.contentId!, data] as const;
      }),
    ).then((results) => {
      if (!canceled)
        setCidUrls(
          Object.fromEntries(
            results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : [])),
          ),
        );
    });
    return () => {
      canceled = true;
    };
  }, [message.accountId, message.attachments, message.id]);

  const source = useMemo(
    () =>
      buildEmailDocument(
        message.body?.html || textToHtml(message.body?.text || ""),
        cidUrls,
        loadImages,
        darkMode,
      ),
    [cidUrls, darkMode, loadImages, message.body?.html, message.body?.text],
  );

  return (
    <div className="email-html-wrap">
      {!loadImages && hasRemoteImages(message.body?.html || "") ? (
        <button className="load-images" onClick={() => setLoadImages(true)}>
          <ImageIcon size={14} />
          Load remote images
        </button>
      ) : null}
      <iframe
        ref={iframeRef}
        title="Email message"
        className="email-frame"
        sandbox="allow-same-origin"
        srcDoc={source}
        style={{ height }}
        onLoad={() => {
          resizeObserverRef.current?.disconnect();
          frameResizeObserverRef.current?.disconnect();
          clickCleanupRef.current?.();
          const frame = iframeRef.current;
          const document = frame?.contentDocument;
          if (!document) return;
          const resize = () => {
            const scale = applyContentScaling(document, frame?.clientWidth ?? 0);
            const root = document.getElementById("email-root");
            const contentHeight = root
              ? Math.max(root.scrollHeight, root.offsetHeight) * scale
              : Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
            setHeight(Math.max(80, Math.ceil(contentHeight)));
          };
          resize();
          const observer = new ResizeObserver(resize);
          observer.observe(document.body);
          observer.observe(document.documentElement);
          resizeObserverRef.current = observer;
          const frameObserver = new ResizeObserver(resize);
          frameObserver.observe(frame);
          frameResizeObserverRef.current = frameObserver;
          const forwardKeyboard = (event: KeyboardEvent) => {
            const forwarded = new KeyboardEvent(event.type, {
              key: event.key,
              code: event.code,
              altKey: event.altKey,
              ctrlKey: event.ctrlKey,
              metaKey: event.metaKey,
              shiftKey: event.shiftKey,
              bubbles: true,
              cancelable: true,
            });
            window.dispatchEvent(forwarded);
            if (forwarded.defaultPrevented) event.preventDefault();
          };
          const forwardPointer = () => window.dispatchEvent(new CustomEvent("iframe-pointerdown"));
          document.addEventListener("keydown", forwardKeyboard);
          document.addEventListener("pointerdown", forwardPointer);
          const openLink = (event: MouseEvent) => {
            const link = (event.target as Element | null)?.closest("a");
            if (!link) return;
            event.preventDefault();
            const href = link.getAttribute("href");
            if (href)
              void window.fluxmail.system
                .openExternal(href)
                .catch((error) =>
                  onError?.(
                    error instanceof Error ? error.message : "Fluxmail could not open this link.",
                  ),
                );
          };
          document.addEventListener("click", openLink);
          clickCleanupRef.current = () => {
            document.removeEventListener("click", openLink);
            document.removeEventListener("keydown", forwardKeyboard);
            document.removeEventListener("pointerdown", forwardPointer);
          };
        }}
      />
    </div>
  );
}

export function buildEmailDocument(
  rawHtml: string,
  cidUrls: Record<string, string>,
  loadImages: boolean,
  darkMode = false,
): string {
  const clean = DOMPurify.sanitize(rawHtml, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
      "video",
      "audio",
    ],
    FORBID_ATTR: ["srcdoc"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|tel|cid|data|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
  const themedHtml = darkMode
    ? convertEmailToDarkMode(clean, {
        preserveBrands: true,
        minContrast: 4.5,
        darkBackground: "#28292c",
        lightText: "#eeeeee",
        linkColor: "#9eb7ff",
      })
    : removeSenderDarkModeCSS(clean);
  const document = new DOMParser().parseFromString(themedHtml, "text/html");
  normalizeNonWrappingText(document);
  for (const image of document.querySelectorAll("img")) {
    const source = image.getAttribute("src") || "";
    if (source.startsWith("cid:")) {
      const cid = source.slice(4).replace(/^<|>$/g, "");
      if (cidUrls[cid]) image.setAttribute("src", cidUrls[cid]);
      else image.removeAttribute("src");
      continue;
    }
    const width = Number(image.getAttribute("width") || image.style.width.replace("px", "") || 0);
    const height = Number(
      image.getAttribute("height") || image.style.height.replace("px", "") || 0,
    );
    if ((width > 0 && width <= 2) || (height > 0 && height <= 2)) {
      image.remove();
      continue;
    }
    if (/^https?:/i.test(source) && !loadImages) {
      image.setAttribute("data-remote-src", source);
      image.removeAttribute("src");
      image.removeAttribute("srcset");
    }
  }
  for (const link of document.querySelectorAll("a")) {
    const href = link.getAttribute("href") || "";
    if (!parseExternalUrl(href)) link.removeAttribute("href");
  }
  const imageSources = loadImages ? "data: blob: https:" : "data: blob:";
  const csp = `default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; style-src 'unsafe-inline'; img-src ${imageSources}; font-src data:; connect-src 'none'`;
  const palette = darkMode
    ? {
        background: "#28292c",
        color: "#eeeeee",
        quote: "#555555",
        muted: "#bbbbbb",
        link: "#9eb7ff",
      }
    : {
        background: "#ffffff",
        color: "#2a2a2a",
        quote: "#dddddd",
        muted: "#666666",
        link: "#315ecc",
      };
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="referrer" content="no-referrer"><meta name="color-scheme" content="${darkMode ? "dark" : "light"}"><style>html,body{width:100%;min-width:0;height:auto!important;margin:0!important;padding:0!important;background:${palette.background};color:${palette.color};font:14px/1.6 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden!important;overflow-wrap:anywhere;box-sizing:border-box}#email-root{display:flow-root;width:100%;min-width:0;max-width:100%;box-sizing:border-box;transform-origin:top left;overflow-wrap:anywhere}#email-root>:first-child{margin-block-start:0!important}#email-root>:last-child{margin-block-end:0!important}a{color:${palette.link};cursor:pointer;overflow-wrap:anywhere;word-break:break-word}table{max-width:100%;overflow-wrap:break-word}td{overflow-wrap:break-word}img{border:0;max-width:100%!important;height:auto!important;object-fit:contain!important}blockquote{border-left:2px solid ${palette.quote};margin-left:4px;padding-left:12px;color:${palette.muted}}pre,pre code{max-width:100%;overflow-x:auto;white-space:pre-wrap;overflow-wrap:anywhere}</style></head><body><div id="email-root">${document.body.innerHTML}</div></body></html>`;
}

function useResolvedDarkTheme(): boolean {
  const [darkMode, setDarkMode] = useState(() => document.documentElement.dataset.theme === "dark");
  useEffect(() => {
    const root = document.documentElement;
    const update = () => setDarkMode(root.dataset.theme === "dark");
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  return darkMode;
}

export function applyContentScaling(document: Document, containerWidth: number): number {
  const root = document.getElementById("email-root");
  if (!root || containerWidth <= 0) return 1;
  root.style.transform = "none";
  void root.offsetWidth;
  const naturalWidth = root.scrollWidth;
  if (naturalWidth <= containerWidth) return 1;
  const scale = containerWidth / naturalWidth;
  root.style.transform = `scale(${scale})`;
  return scale;
}

function normalizeNonWrappingText(document: Document): void {
  for (const element of document.querySelectorAll<HTMLElement>("[style]")) {
    if (element.closest("pre, code")) continue;
    const whiteSpace = element.style.whiteSpace.toLowerCase();
    if (whiteSpace === "pre") element.style.whiteSpace = "pre-wrap";
    if (whiteSpace === "nowrap") element.style.whiteSpace = "normal";
  }
}

function textToHtml(value: string): string {
  const escaped = value.replace(
    /[&<>]/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
  );
  return `<div style="white-space:pre-wrap">${escaped}</div>`;
}

export function hasRemoteImages(value: string): boolean {
  const document = new DOMParser().parseFromString(value, "text/html");
  return [...document.querySelectorAll("img, source")].some((element) =>
    [element.getAttribute("src"), element.getAttribute("srcset")].some(
      (source) => source && /(?:^|[\s,])https?:\/\//i.test(source),
    ),
  );
}
