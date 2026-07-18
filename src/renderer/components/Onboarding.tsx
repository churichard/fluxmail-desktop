import { useState } from "react";
import type { TelemetryStatus } from "../../shared/contracts";
import { FluxmailLogoMark } from "./FluxmailLogoMark";

export function Onboarding({
  telemetry,
  onConnected,
}: {
  telemetry: TelemetryStatus;
  onConnected(): Promise<void>;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <main className="onboarding">
      <div className="onboarding-card">
        <div className="brand">
          <span className="brand-mark">
            <FluxmailLogoMark />
          </span>
          <span>Fluxmail</span>
        </div>
        <h1>Your inbox, on your Mac</h1>
        <button
          className="primary-button connect-button"
          disabled={connecting}
          onClick={() => {
            setConnecting(true);
            setError(undefined);
            void window.fluxmail.accounts
              .connectGmail()
              .then(onConnected)
              .catch((caught) =>
                setError(
                  caught instanceof Error ? caught.message : "Fluxmail could not connect Gmail.",
                ),
              )
              .finally(() => setConnecting(false));
          }}
        >
          {connecting ? "Waiting for Google..." : "Connect Gmail"}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <p className="privacy-note">
          {telemetry.enabled
            ? "Fluxmail sends anonymous usage and performance data. It never includes email content, addresses, or search terms. Turn it off in Settings."
            : "Anonymous analytics are off."}
        </p>
      </div>
    </main>
  );
}
