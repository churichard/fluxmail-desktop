import { useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
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
        <div className="onboarding-icon">
          <Mail size={28} />
        </div>
        <h1>Your inbox, on your Mac</h1>
        <p>
          Connect Gmail to read, search, and send mail from Fluxmail. Your messages go straight from
          this app to Gmail through the local Fluxmail service.
        </p>
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
        <div className="privacy-note">
          <ShieldCheck size={17} />
          <p>
            {telemetry.enabled
              ? "Fluxmail sends anonymous feature and performance counts. It never sends email content, addresses, or search text. You can turn analytics off in Settings."
              : "Anonymous analytics are off for this installation."}
          </p>
        </div>
      </div>
    </main>
  );
}
