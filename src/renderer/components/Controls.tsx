import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { Check, Minus } from "lucide-react";
import type { KeyboardShortcutHint } from "../shortcuts";

type TooltipSide = "top" | "right" | "bottom";
export type SelectionState = "unchecked" | "mixed" | "checked";

export function SelectionCheckbox({
  state,
  label,
  className = "",
  disabled,
  onClick,
}: {
  state: SelectionState;
  label: string;
  className?: string;
  disabled?: boolean;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "mixed" ? "mixed" : state === "checked"}
      aria-label={label}
      className={`selection-checkbox ${className} ${state}`}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="selection-indicator">
        {state === "checked" ? <Check size={12} strokeWidth={2.8} /> : null}
        {state === "mixed" ? <Minus size={12} strokeWidth={2.8} /> : null}
      </span>
    </button>
  );
}

export interface MenuOption {
  id: string;
  label: string;
  icon?: ReactNode;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect(): void;
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  children: ReactNode;
  tooltipSide?: TooltipSide;
  shortcut?: KeyboardShortcutHint;
}

export function IconButton({
  label,
  children,
  className = "icon-button",
  tooltipSide = "bottom",
  shortcut,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tooltipId = useId();
  const tooltip = useTooltipVisibility();
  return (
    <span
      className="tooltip-control"
      onPointerEnter={tooltip.showLater}
      onPointerLeave={tooltip.hide}
      onFocusCapture={tooltip.showLater}
      onBlurCapture={tooltip.hide}
    >
      <button
        {...buttonProps}
        ref={buttonRef}
        type={type}
        className={className}
        aria-label={label}
        aria-keyshortcuts={shortcut?.keys}
        aria-describedby={tooltip.visible ? tooltipId : undefined}
      >
        {children}
      </button>
      {tooltip.visible ? (
        <TooltipBubble
          id={tooltipId}
          anchorRef={buttonRef}
          label={label}
          shortcut={shortcut}
          side={tooltipSide}
        />
      ) : null}
    </span>
  );
}

export function TooltipLabel({
  label,
  children,
  className = "",
  tooltipContent,
  tooltipClassName,
  tooltipSide = "top",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tooltipContent?: ReactNode;
  tooltipClassName?: string;
  tooltipSide?: TooltipSide;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();
  const tooltip = useTooltipVisibility();
  return (
    <span
      className="tooltip-control"
      onPointerEnter={tooltip.showLater}
      onPointerLeave={tooltip.hide}
      onFocusCapture={tooltip.showLater}
      onBlurCapture={tooltip.hide}
    >
      <span
        ref={anchorRef}
        tabIndex={0}
        className={className}
        aria-label={label}
        aria-describedby={tooltip.visible ? tooltipId : undefined}
      >
        {children}
      </span>
      {tooltip.visible ? (
        <TooltipBubble
          id={tooltipId}
          anchorRef={anchorRef}
          label={label}
          content={tooltipContent}
          className={tooltipClassName}
          side={tooltipSide}
        />
      ) : null}
    </span>
  );
}

export function MenuButton({
  label,
  children,
  options,
  className = "",
  triggerClassName = "icon-button",
  menuClassName = "",
  align = "left",
  tooltip: tooltipEnabled = true,
  disabled = false,
  shortcut,
}: {
  label: string;
  children: ReactNode;
  options: MenuOption[];
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  align?: "left" | "right";
  tooltip?: boolean;
  disabled?: boolean;
  shortcut?: KeyboardShortcutHint;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tooltipId = useId();
  const menuId = useId();
  const tooltip = useTooltipVisibility(tooltipEnabled && !open);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus(),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !rootRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("iframe-pointerdown", closeIfOutside as EventListener);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("iframe-pointerdown", closeIfOutside as EventListener);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`popup-control ${className}`}
      onPointerEnter={tooltip.showLater}
      onPointerLeave={tooltip.hide}
      onFocusCapture={tooltip.showLater}
      onBlurCapture={tooltip.hide}
    >
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-keyshortcuts={shortcut?.keys}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-describedby={tooltip.visible ? tooltipId : undefined}
        disabled={disabled}
        onClick={() => {
          tooltip.hide();
          setOpen((value) => !value);
        }}
      >
        {children}
      </button>
      {tooltip.visible ? (
        <TooltipBubble
          id={tooltipId}
          anchorRef={triggerRef}
          label={label}
          shortcut={shortcut}
          side="bottom"
        />
      ) : null}
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          className={`popup-menu popup-${align} ${menuClassName}`}
          role="menu"
          onKeyDown={(event) => {
            const items = [
              ...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ??
                []),
            ];
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              triggerRef.current?.focus();
              return;
            }
            if (event.key === "Tab") {
              setOpen(false);
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const current = items.indexOf(document.activeElement as HTMLButtonElement);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowDown"
                    ? (current + 1) % items.length
                    : (current - 1 + items.length) % items.length;
            items[next]?.focus();
          }}
        >
          {options.map((option) => (
            <button
              type="button"
              role="menuitem"
              key={option.id}
              className={option.danger ? "danger" : ""}
              disabled={option.disabled}
              onClick={() => {
                setOpen(false);
                option.onSelect();
              }}
            >
              <span className="popup-item-icon">
                {option.selected ? <Check size={14} /> : option.icon}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TooltipBubble({
  id,
  anchorRef,
  label,
  content,
  className = "",
  shortcut,
  side,
}: {
  id: string;
  anchorRef: RefObject<HTMLElement | null>;
  label: string;
  content?: ReactNode;
  className?: string;
  shortcut?: KeyboardShortcutHint;
  side: TooltipSide;
}) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });
  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const bubble = bubbleRef.current;
    if (!anchor || !bubble) return;
    setPosition(
      calculateTooltipPosition(
        anchor.getBoundingClientRect(),
        bubble.getBoundingClientRect(),
        side,
      ),
    );
  }, [anchorRef, side]);

  useLayoutEffect(place, [place]);
  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, place]);

  return createPortal(
    <div
      ref={bubbleRef}
      id={id}
      className={`tooltip-bubble ${className} ${position.ready ? "" : "measuring"}`}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
    >
      {content ?? <span>{label}</span>}
      {shortcut ? (
        <kbd className="tooltip-shortcut" aria-hidden="true">
          {shortcut.display}
        </kbd>
      ) : null}
    </div>,
    document.body,
  );
}

export function calculateTooltipPosition(
  anchor: Pick<DOMRect, "top" | "right" | "bottom" | "left" | "width" | "height">,
  bubble: Pick<DOMRect, "width" | "height">,
  preferredSide: TooltipSide,
  viewport = { width: window.innerWidth, height: window.innerHeight },
): { left: number; top: number; ready: boolean } {
  const defaultGap = 7;
  const rightGap = 15;
  const margin = 6;
  let side = preferredSide;
  if (side === "top" && anchor.top - bubble.height - defaultGap < margin) side = "bottom";
  else if (side === "bottom" && anchor.bottom + bubble.height + defaultGap > viewport.height)
    side = "top";
  else if (side === "right" && anchor.right + bubble.width + rightGap > viewport.width)
    side = "top";

  let left = anchor.left + (anchor.width - bubble.width) / 2;
  let top = side === "top" ? anchor.top - bubble.height - defaultGap : anchor.bottom + defaultGap;
  if (side === "right") {
    left = anchor.right + rightGap;
    top = anchor.top + (anchor.height - bubble.height) / 2;
  }
  left = Math.min(viewport.width - bubble.width - margin, Math.max(margin, left));
  top = Math.min(viewport.height - bubble.height - margin, Math.max(margin, top));
  return { left, top, ready: true };
}

function useTooltipVisibility(enabled = true): {
  visible: boolean;
  showLater(): void;
  hide(): void;
} {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hide = () => {
    window.clearTimeout(timer.current);
    setVisible(false);
  };
  const showLater = () => {
    if (!enabled) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(true), 320);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (enabled) return;
    window.clearTimeout(timer.current);
    setVisible(false);
  }, [enabled]);
  return { visible, showLater, hide };
}
