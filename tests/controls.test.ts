/** @vitest-environment jsdom */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateTooltipPosition, MenuButton } from "../src/renderer/components/Controls";

afterEach(cleanup);

const viewport = { width: 320, height: 240 };
const bubble = { width: 100, height: 28 };

describe("tooltip positioning", () => {
  it("keeps tooltips inside the left and top window edges", () => {
    expect(
      calculateTooltipPosition(
        { left: 2, right: 32, top: 2, bottom: 32, width: 30, height: 30 },
        bubble,
        "top",
        viewport,
      ),
    ).toEqual({ left: 6, top: 39, ready: true });
  });

  it("keeps tooltips inside the right and bottom window edges", () => {
    expect(
      calculateTooltipPosition(
        { left: 288, right: 318, top: 208, bottom: 238, width: 30, height: 30 },
        bubble,
        "bottom",
        viewport,
      ),
    ).toEqual({ left: 214, top: 173, ready: true });
  });

  it("places a right-side tooltip beyond a narrow sidebar", () => {
    expect(
      calculateTooltipPosition(
        { left: 14, right: 45, top: 100, bottom: 131, width: 31, height: 31 },
        bubble,
        "right",
        viewport,
      ),
    ).toEqual({ left: 60, top: 101.5, ready: true });
  });
});

describe("popup menu keyboard navigation", () => {
  it("focuses menu items, supports arrows, and returns focus on Escape", async () => {
    render(
      createElement(MenuButton, {
        label: "Choose account",
        children: "Open",
        tooltip: false,
        options: [
          { id: "one", label: "First", onSelect: vi.fn() },
          { id: "two", label: "Second", onSelect: vi.fn() },
        ],
      }),
    );
    const trigger = screen.getByRole("button", { name: "Choose account" });
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu");
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "First" })),
    );
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Second" }));
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
