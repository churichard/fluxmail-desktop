export interface ScrollEdges {
  canScrollUp: boolean;
  canScrollDown: boolean;
}

export function calculateScrollEdges(
  viewportSize: number,
  contentSize: number,
  scrollPosition: number,
): ScrollEdges {
  const maximumScroll = Math.max(0, contentSize - viewportSize);
  const position = Math.min(maximumScroll, Math.max(0, scrollPosition));
  return {
    canScrollUp: position > 1,
    canScrollDown: position < maximumScroll - 1,
  };
}
