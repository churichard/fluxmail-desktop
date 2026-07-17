import { describe, expect, it } from "vitest";
import { createLaunchTimer } from "../src/main/performance";

describe("window launch timing", () => {
  it("starts a fresh timer for each created window", () => {
    let now = 100;
    const clock = () => now;
    const initialLaunch = createLaunchTimer(clock);

    now = 160;
    expect(initialLaunch()).toBe(60);

    now = 1_000;
    const reopenedWindow = createLaunchTimer(clock);
    now = 1_012;

    expect(reopenedWindow()).toBe(12);
  });

  it("does not report a negative duration if the clock moves backward", () => {
    let now = 100;
    const launchDuration = createLaunchTimer(() => now);
    now = 90;

    expect(launchDuration()).toBe(0);
  });
});
