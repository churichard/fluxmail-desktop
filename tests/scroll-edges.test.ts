import { describe, expect, it } from "vitest";
import { calculateScrollEdges } from "../src/renderer/scroll-edges";

describe("scroll edge fades", () => {
  it("shows only the edges that have more content", () => {
    expect(calculateScrollEdges(500, 2_000, 0)).toEqual({
      canScrollUp: false,
      canScrollDown: true,
    });
    expect(calculateScrollEdges(500, 2_000, 750)).toEqual({
      canScrollUp: true,
      canScrollDown: true,
    });
    expect(calculateScrollEdges(500, 2_000, 1_500)).toEqual({
      canScrollUp: true,
      canScrollDown: false,
    });
  });

  it("hides both fades when the content fits", () => {
    expect(calculateScrollEdges(500, 500, 0)).toEqual({
      canScrollUp: false,
      canScrollDown: false,
    });
  });
});
