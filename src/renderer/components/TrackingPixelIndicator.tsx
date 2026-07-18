import { ShieldCheck } from "lucide-react";
import type { TrackingPixelDetail } from "../email/tracking-pixels";
import { TooltipLabel } from "./Controls";

export function TrackingPixelIndicator({
  trackingPixels,
}: {
  trackingPixels: TrackingPixelDetail[];
}) {
  const count = trackingPixels.length;
  const label = `Blocked ${count} tracking pixel${count === 1 ? "" : "s"}`;
  const domains = new Map<string, { count: number; reasons: Set<string> }>();
  for (const pixel of trackingPixels) {
    const current = domains.get(pixel.domain) ?? { count: 0, reasons: new Set<string>() };
    current.count += 1;
    current.reasons.add(pixel.reason);
    domains.set(pixel.domain, current);
  }
  return (
    <TooltipLabel
      label={label}
      className="tracking-pixel-indicator"
      tooltipSide="top"
      tooltipClassName="tracking-pixel-tooltip"
      tooltipContent={
        <div className="tracking-pixel-details">
          <strong>{label}</strong>
          <span>Fluxmail removed these images before they could load.</span>
          <ul>
            {[...domains].map(([domain, details]) => (
              <li key={domain}>
                <span>{domain}</span>
                <small>
                  {details.count > 1 ? `${details.count} pixels, ` : ""}
                  {[...details.reasons].join(", ")}
                </small>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <ShieldCheck size={13} />
      <span>{count}</span>
    </TooltipLabel>
  );
}
