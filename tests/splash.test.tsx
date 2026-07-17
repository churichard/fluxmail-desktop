/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Splash } from "../src/renderer/App";

describe("startup error state", () => {
  it("explains the error and restarts the full app", () => {
    const restart = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window, "fluxmail", {
      configurable: true,
      value: { system: { restart } },
    });

    render(<Splash error="Fluxmail could not open your mail." />);

    expect(screen.getByRole("heading", { name: "An error occurred" })).toBeTruthy();
    expect(screen.getByText("Fluxmail could not open your mail.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Restart Fluxmail" }));
    expect(restart).toHaveBeenCalledOnce();
  });
});
