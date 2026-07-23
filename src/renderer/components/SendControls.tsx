import { useState } from "react";
import { CalendarClock, ChevronDown, Send } from "lucide-react";

interface SendControlsProps {
  sending: boolean;
  deliveryKind: "sent" | "undo" | "scheduled";
  disabled?: boolean;
  onSend(): void;
  onSchedule(sendAt: string): void;
  onError(message: string): void;
}

export function SendControls({
  sending,
  deliveryKind,
  disabled = false,
  onSend,
  onSchedule,
  onError,
}: SendControlsProps) {
  const [sendOptionsOpen, setSendOptionsOpen] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => defaultScheduleTime());
  const controlsDisabled = sending || disabled;

  const schedule = () => {
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      onError("Choose a send time in the future.");
      return;
    }
    setSendOptionsOpen(false);
    onSchedule(date.toISOString());
  };

  return (
    <div className="send-controls">
      <button className="primary-button send-button" disabled={controlsDisabled} onClick={onSend}>
        <Send size={16} />
        {sending ? (deliveryKind === "scheduled" ? "Scheduling..." : "Sending...") : "Send"}
      </button>
      <button
        type="button"
        className="primary-button send-options-button"
        disabled={controlsDisabled}
        aria-label="More send options"
        aria-expanded={sendOptionsOpen}
        onClick={() => setSendOptionsOpen((value) => !value)}
      >
        <ChevronDown size={15} />
      </button>
      {sendOptionsOpen ? (
        <div className="send-options-popover" role="dialog" aria-label="Schedule send">
          <label>
            <span>Send at</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={localDateTimeValue(new Date(Date.now() + 60_000))}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <button type="button" className="secondary-button" onClick={schedule}>
            <CalendarClock size={15} />
            Schedule
          </button>
        </div>
      ) : null}
    </div>
  );
}

function defaultScheduleTime(): string {
  const date = new Date(Date.now() + 60 * 60 * 1_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return localDateTimeValue(date);
}

function localDateTimeValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
