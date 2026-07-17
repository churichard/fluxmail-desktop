import { useState, type Dispatch, type SetStateAction } from "react";
import { ExternalLink, Monitor, Moon, RefreshCw, Sun, Trash2, X } from "lucide-react";
import type { AppearancePreference, BootstrapState } from "../../shared/contracts";
import { IconButton, SelectionCheckbox } from "./Controls";

interface Props {
  state: BootstrapState;
  onState: Dispatch<SetStateAction<BootstrapState | null>>;
  onClose(): void;
  onError(message: string): void;
}

export function SettingsDialog({ state, onState, onClose, onError }: Props) {
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [appearanceBusy, setAppearanceBusy] = useState(false);
  const [dockBadgeBusy, setDockBadgeBusy] = useState(false);
  const updateTelemetry = async (enabled: boolean) => {
    const previous = state.telemetry;
    setBusy(true);
    onState((current) =>
      current ? { ...current, telemetry: { ...current.telemetry, enabled } } : current,
    );
    try {
      const telemetry = await window.fluxmail.telemetry.setEnabled(enabled);
      onState((current) => (current ? { ...current, telemetry } : current));
      void window.fluxmail.analytics
        .trackFeature({
          feature: "settings",
          action: enabled ? "enabled" : "disabled",
          source: "settings",
        })
        .catch(() => undefined);
    } catch (error) {
      onState((current) => (current ? { ...current, telemetry: previous } : current));
      onError(
        error instanceof Error ? error.message : "Fluxmail could not update analytics settings.",
      );
    } finally {
      setBusy(false);
    }
  };
  const connectAccount = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await window.fluxmail.accounts.connectGmail();
      onState(await window.fluxmail.bootstrap());
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not connect Gmail.");
    } finally {
      setConnecting(false);
    }
  };
  const updateAppearance = async (appearance: AppearancePreference) => {
    if (appearanceBusy || appearance === state.preferences.appearance) return;
    setAppearanceBusy(true);
    try {
      const value = await window.fluxmail.preferences.setAppearance(appearance);
      onState((current) =>
        current
          ? {
              ...current,
              preferences: { ...current.preferences, appearance: value },
            }
          : current,
      );
      void window.fluxmail.analytics
        .trackFeature({
          feature: "settings",
          action: "updated",
          source: "settings",
        })
        .catch(() => undefined);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not change the appearance.");
    } finally {
      setAppearanceBusy(false);
    }
  };
  const updateDockBadge = async (enabled: boolean) => {
    if (dockBadgeBusy || enabled === state.preferences.dockBadge) return;
    const previous = state.preferences.dockBadge;
    setDockBadgeBusy(true);
    onState((current) =>
      current
        ? {
            ...current,
            preferences: { ...current.preferences, dockBadge: enabled },
          }
        : current,
    );
    try {
      const value = await window.fluxmail.preferences.setDockBadge(enabled);
      onState((current) =>
        current
          ? {
              ...current,
              preferences: { ...current.preferences, dockBadge: value },
            }
          : current,
      );
      void window.fluxmail.analytics
        .trackFeature({
          feature: "settings",
          action: "updated",
          source: "settings",
        })
        .catch(() => undefined);
    } catch (error) {
      onState((current) =>
        current
          ? {
              ...current,
              preferences: { ...current.preferences, dockBadge: previous },
            }
          : current,
      );
      onError(error instanceof Error ? error.message : "Could not change the Dock badge setting.");
    } finally {
      setDockBadgeBusy(false);
    }
  };
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Settings">
        <header>
          <h1>Settings</h1>
          <IconButton label="Close settings" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </header>
        <div className="settings-content">
          <section>
            <h2>Plan</h2>
            <div className="plan-row">
              <span>
                <strong>{formatPlan(state.license.plan)}</strong>
                <small>
                  {formatPlanOffer(state.license.maxMembers, state.license.maxAccounts)}
                </small>
              </span>
              <button
                className="secondary-button"
                onClick={() =>
                  void window.fluxmail.system
                    .openExternal("https://fluxmail.ai/pricing")
                    .catch((error) =>
                      onError(
                        error instanceof Error ? error.message : "Could not open the plans page.",
                      ),
                    )
                }
              >
                View plans
                <ExternalLink size={13} />
              </button>
            </div>
            {state.license.warning ? <p className="form-error">{state.license.warning}</p> : null}
          </section>
          <section>
            <h2>Accounts</h2>
            <p className="settings-help">
              Fluxmail uses the same connected accounts as the local Fluxmail MCP server.
            </p>
            <div className="settings-accounts">
              {state.accounts.map((account) => (
                <div key={account.id}>
                  <span className="account-identity">
                    <strong>{account.displayName || account.email}</strong>
                    <small>{account.email}</small>
                  </span>
                  <span className="account-actions">
                    <IconButton
                      label="Reconnect account"
                      onClick={() =>
                        void window.fluxmail.accounts
                          .reconnect(account.id)
                          .catch((error) =>
                            onError(
                              error instanceof Error ? error.message : "Could not reconnect.",
                            ),
                          )
                      }
                    >
                      <RefreshCw size={16} />
                    </IconButton>
                    <IconButton
                      label="Remove account"
                      className="icon-button danger"
                      onClick={() => {
                        if (!window.confirm(`Remove ${account.email} from Fluxmail?`)) return;
                        void window.fluxmail.accounts
                          .remove(account.id)
                          .then(() =>
                            onState((current) =>
                              current
                                ? {
                                    ...current,
                                    accounts: current.accounts.filter(
                                      (item) => item.id !== account.id,
                                    ),
                                  }
                                : current,
                            ),
                          )
                          .catch((error) =>
                            onError(
                              error instanceof Error
                                ? error.message
                                : "Could not remove the account.",
                            ),
                          );
                      }}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </span>
                </div>
              ))}
            </div>
            <button
              className="secondary-button"
              disabled={connecting}
              onClick={() => void connectAccount()}
            >
              {connecting ? "Waiting for Google..." : "Add Gmail account"}
            </button>
          </section>
          <section>
            <h2>Appearance</h2>
            <p className="settings-help">Choose a theme, or follow your Mac setting.</p>
            <div className="appearance-options" role="radiogroup" aria-label="Appearance">
              {(
                [
                  { value: "system", label: "System", icon: Monitor },
                  { value: "light", label: "Light", icon: Sun },
                  { value: "dark", label: "Dark", icon: Moon },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const selected = state.preferences.appearance === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={selected ? "active" : ""}
                    disabled={appearanceBusy}
                    onClick={() => void updateAppearance(option.value)}
                  >
                    <Icon size={16} />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="toggle-row">
              <span>
                <strong>Dock badge</strong>
                <small>Show the unread count on the Fluxmail icon in the Dock.</small>
              </span>
              <SelectionCheckbox
                state={state.preferences.dockBadge ? "checked" : "unchecked"}
                label="Dock badge"
                className="settings-checkbox"
                disabled={dockBadgeBusy}
                onClick={() => void updateDockBadge(!state.preferences.dockBadge)}
              />
            </div>
          </section>
          <section>
            <h2>Privacy</h2>
            <div className="toggle-row">
              <span>
                <strong>Anonymous analytics</strong>
                <small>
                  Send anonymized analytics to help us improve our features, performance, and
                  reliability. Your email content is never included.
                </small>
              </span>
              <SelectionCheckbox
                state={state.telemetry.enabled ? "checked" : "unchecked"}
                label="Anonymous analytics"
                className="settings-checkbox"
                disabled={busy || state.telemetry.lockedByEnvironment}
                onClick={() => void updateTelemetry(!state.telemetry.enabled)}
              />
            </div>
            {state.telemetry.lockedByEnvironment ? (
              <p className="settings-help">
                Your environment has disabled analytics with DO_NOT_TRACK or FLUXMAIL_TELEMETRY.
              </p>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}

function formatPlan(value: string): string {
  const names: Record<string, string> = {
    free: "Free",
    personal: "Personal",
    pro: "Pro",
    professional: "Professional",
    team: "Team",
    business: "Business",
    enterprise: "Enterprise",
  };
  return (
    names[value.toLowerCase()] ??
    value.replaceAll(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function formatPlanOffer(maxMembers: number, maxAccounts: number): string {
  const members = maxMembers === 1 ? "one member" : `${maxMembers} members`;
  const mailboxes =
    maxAccounts === 1 ? "one connected mailbox" : `${maxAccounts} connected mailboxes`;
  return `Includes up to ${mailboxes} for ${members}.`;
}
