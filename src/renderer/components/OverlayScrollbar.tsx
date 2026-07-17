import { useEffect, useRef, useState } from "react";
import { calculateScrollEdges } from "../scroll-edges";

interface OverlayScrollbarProps {
  scroller: HTMLElement | null;
  fadeClass: string;
}

export function OverlayScrollbar({ scroller, fadeClass }: OverlayScrollbarProps) {
  const [metrics, setMetrics] = useState({
    visible: false,
    top: 0,
    height: 0,
    canScrollUp: false,
    canScrollDown: false,
  });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<
    | {
        pointerId: number;
        startY: number;
        startScrollTop: number;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    if (!scroller) return;
    const update = () =>
      setMetrics({
        ...calculateScrollThumb(scroller.clientHeight, scroller.scrollHeight, scroller.scrollTop),
        ...calculateScrollEdges(scroller.clientHeight, scroller.scrollHeight, scroller.scrollTop),
      });
    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(scroller);
    for (const child of scroller.children) resizeObserver.observe(child);
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(scroller, {
      childList: true,
      subtree: true,
      attributes: true,
    });
    scroller.addEventListener("scroll", update, { passive: true });
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      scroller.removeEventListener("scroll", update);
    };
  }, [scroller]);

  if (!metrics.visible || !scroller) return null;
  return (
    <>
      {metrics.canScrollUp ? (
        <span className={`scroll-edge-fade ${fadeClass} top`} aria-hidden="true" />
      ) : null}
      {metrics.canScrollDown ? (
        <span className={`scroll-edge-fade ${fadeClass} bottom`} aria-hidden="true" />
      ) : null}
      <div className={`overlay-scrollbar ${dragging ? "dragging" : ""}`} aria-hidden="true">
        <span
          className="overlay-scrollbar-thumb"
          style={{
            height: metrics.height,
            transform: `translateY(${metrics.top}px)`,
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              pointerId: event.pointerId,
              startY: event.clientY,
              startScrollTop: scroller.scrollTop,
            };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const start = drag.current;
            if (!start || start.pointerId !== event.pointerId) return;
            const maximumScroll = scroller.scrollHeight - scroller.clientHeight;
            const maximumTravel = scroller.clientHeight - metrics.height;
            if (maximumScroll <= 0 || maximumTravel <= 0) return;
            scroller.scrollTop = Math.max(
              0,
              Math.min(
                maximumScroll,
                start.startScrollTop +
                  ((event.clientY - start.startY) * maximumScroll) / maximumTravel,
              ),
            );
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
            drag.current = undefined;
            setDragging(false);
          }}
          onPointerCancel={() => {
            drag.current = undefined;
            setDragging(false);
          }}
        />
      </div>
    </>
  );
}

export function calculateScrollThumb(
  viewportHeight: number,
  contentHeight: number,
  scrollTop: number,
): { visible: boolean; top: number; height: number } {
  if (viewportHeight <= 0 || contentHeight <= viewportHeight)
    return { visible: false, top: 0, height: 0 };
  const height = Math.max(28, (viewportHeight * viewportHeight) / contentHeight);
  const maximumTravel = viewportHeight - height;
  const maximumScroll = contentHeight - viewportHeight;
  return {
    visible: true,
    height,
    top: (Math.min(maximumScroll, Math.max(0, scrollTop)) / maximumScroll) * maximumTravel,
  };
}
