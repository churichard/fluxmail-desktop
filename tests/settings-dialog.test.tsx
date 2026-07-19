/** @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "../src/renderer/components/SettingsDialog";
import type { BootstrapState, FluxmailDesktopApi } from "../src/shared/contracts";

afterEach(cleanup);

describe("SettingsDialog license activation", () => {
  it("activates a key, clears the input, and updates the displayed plan", async () => {
    const activate = vi.fn(async () => ({
      outcome: "activated" as const,
      license: { plan: "pro", maxMembers: 1, maxAccounts: 5 },
    }));
    installApi(activate);
    render(<SettingsHarness />);

    expect(screen.queryByLabelText("License key")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate license key" }));
    const input = screen.getByLabelText("License key");
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: "fluxmail_lic_valid-key" } });
    fireEvent.click(screen.getByRole("button", { name: /^Activate$/ }));

    expect(await screen.findByRole("status")).toHaveTextContent("License activated.");
    expect(activate).toHaveBeenCalledWith("fluxmail_lic_valid-key");
    expect(screen.queryByLabelText("License key")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activate license key" })).toBeVisible();
    expect(screen.getByText("Pro", { exact: true })).toBeVisible();
    expect(screen.getByText("Includes up to 5 connected mailboxes for one member.")).toBeVisible();
  });

  it("keeps the key in the input when activation fails", async () => {
    const activate = vi.fn(async () => {
      throw new Error("That license key is invalid. Check it for typos.");
    });
    installApi(activate);
    render(<SettingsHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Activate license key" }));
    const input = screen.getByLabelText("License key");
    fireEvent.change(input, { target: { value: "fluxmail_lic_typo" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That license key is invalid. Check it for typos.",
    );
    expect(input).toHaveValue("fluxmail_lic_typo");
    await waitFor(() => expect(screen.getByRole("button", { name: "Activate" })).toBeEnabled());
  });
});

function SettingsHarness() {
  const [state, setState] = useState<BootstrapState | null>(bootstrapState());
  if (!state) return null;
  return <SettingsDialog state={state} onState={setState} onClose={vi.fn()} onError={vi.fn()} />;
}

function installApi(
  activate: (key: string) => Promise<{
    outcome: "activated" | "saved_for_retry";
    license: BootstrapState["license"];
  }>,
): void {
  Object.defineProperty(window, "fluxmail", {
    configurable: true,
    value: {
      license: { activate },
      analytics: { trackFeature: vi.fn(async () => undefined) },
      system: { openExternal: vi.fn(async () => undefined) },
    } as unknown as FluxmailDesktopApi,
  });
}

function bootstrapState(): BootstrapState {
  return {
    engine: {
      version: "0.5.0",
      storeFormat: 1,
      minimumSupportedFormat: 1,
      maximumSupportedFormat: 1,
    },
    accounts: [],
    folders: [],
    unreadCount: 0,
    draftCount: 0,
    countsByAccount: {},
    sync: { status: "idle" },
    telemetry: { enabled: false, lockedByEnvironment: false },
    preferences: { appearance: "system", dockBadge: true, blockRemoteImages: true },
    license: { plan: "personal", maxMembers: 1, maxAccounts: 3 },
  };
}
