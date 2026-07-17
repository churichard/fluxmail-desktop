/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { getSelectionReadAction } from "../src/renderer/components/ThreadListPane";
import { calculateScrollThumb } from "../src/renderer/components/OverlayScrollbar";

describe("thread list overlay scrollbar", () => {
  it("maps scroll position onto an overlaid thumb", () => {
    expect(calculateScrollThumb(500, 2_000, 0)).toEqual({
      visible: true,
      top: 0,
      height: 125,
    });
    expect(calculateScrollThumb(500, 2_000, 750)).toEqual({
      visible: true,
      top: 187.5,
      height: 125,
    });
    expect(calculateScrollThumb(500, 2_000, 1_500)).toEqual({
      visible: true,
      top: 375,
      height: 125,
    });
  });

  it("hides the thumb when the list fits", () => {
    expect(calculateScrollThumb(500, 500, 0)).toEqual({
      visible: false,
      top: 0,
      height: 0,
    });
  });
});

describe("bulk read action", () => {
  it("marks a mixed selection read", () => {
    expect(getSelectionReadAction([{ unread: false }, { unread: true }])).toBe("markRead");
  });

  it("marks a fully read selection unread", () => {
    expect(getSelectionReadAction([{ unread: false }, { unread: false }])).toBe("markUnread");
  });
});
