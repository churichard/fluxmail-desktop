import { useState } from "react";
import fluxmailBrandIcon from "../../../build/icon.png";

export function Onboarding({ onConnected }: { onConnected(): Promise<void> }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <main className="onboarding">
      <div className="brand">
        <span className="brand-mark">
          <img alt="" aria-hidden="true" draggable={false} src={fluxmailBrandIcon} />
        </span>
        <span>Fluxmail</span>
      </div>
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
    </main>
  );
}
