import { mkdirSync } from "node:fs";
import { app } from "electron";
import {
  createTelemetry,
  isTelemetryEnabled,
  setTelemetryEnabled,
  type Telemetry,
  type TelemetryProperties,
} from "fluxmail";
import { featureEventSchema, type FeatureEvent, type TelemetryStatus } from "../shared/contracts";

export type MailOperation =
  | "list_threads"
  | "search"
  | "get_thread"
  | "modify"
  | "save_draft"
  | "delete_draft"
  | "send"
  | "forward"
  | "download_attachment";

export type SyncTrigger = "startup" | "poll" | "manual" | "resume" | "mutation";
export type PerformanceMetric =
  | "warm_launch"
  | "cached_inbox_paint"
  | "folder_switch"
  | "thread_open";

interface AnalyticsOptions {
  dataDir: string;
  packaged?: boolean;
  createClient?: typeof createTelemetry;
  testClient?: boolean;
}

const MCP_VERSION = "0.3.0";

export class DesktopAnalytics {
  private client: Telemetry;
  private readonly packaged: boolean;
  private readonly createClient: typeof createTelemetry;

  constructor(private readonly options: AnalyticsOptions) {
    mkdirSync(options.dataDir, { recursive: true, mode: 0o700 });
    this.packaged = options.packaged ?? app.isPackaged;
    this.createClient = options.createClient ?? createTelemetry;
    this.client = this.createClient({
      dataDir: options.dataDir,
      env: this.effectiveEnvironment(),
    });
  }

  status(): TelemetryStatus {
    const lockedByEnvironment = environmentForcesOptOut(process.env);
    return {
      enabled:
        !lockedByEnvironment &&
        isTelemetryEnabled(this.options.dataDir, this.preferenceEnvironment()),
      lockedByEnvironment,
    };
  }

  async setEnabled(enabled: boolean): Promise<TelemetryStatus> {
    if (environmentForcesOptOut(process.env)) return this.status();
    const previousClient = this.client;
    setTelemetryEnabled(this.options.dataDir, enabled);
    this.client = this.createClient({
      dataDir: this.options.dataDir,
      env: this.effectiveEnvironment(),
    });
    await previousClient.shutdown().catch(() => undefined);
    return this.status();
  }

  captureStarted(input: { cacheState: "hit" | "miss"; onboardingComplete: boolean }): void {
    this.capture("desktop app started", input);
  }

  captureFeature(event: FeatureEvent): void {
    const safeEvent = featureEventSchema.parse(event);
    this.capture("feature_used", {
      feature: safeEvent.feature,
      action: safeEvent.action,
      source: safeEvent.source,
    });
  }

  captureOperation(input: {
    operation: MailOperation;
    outcome: "success" | "error";
    errorCode?: string;
    durationMs: number;
    cacheStatus?: "hit" | "miss" | "mixed";
  }): void {
    this.capture("desktop mail operation", {
      operation: input.operation,
      outcome: input.outcome,
      error_code: safeErrorCode(input.errorCode),
      duration_ms: roundedDuration(input.durationMs),
      cache_status: input.cacheStatus,
    });
  }

  captureSync(input: {
    trigger: SyncTrigger;
    outcome: "success" | "error";
    durationMs: number;
    itemCount: number;
  }): void {
    this.capture("desktop sync completed", {
      trigger: input.trigger,
      outcome: input.outcome,
      duration_ms: roundedDuration(input.durationMs),
      item_count: Math.max(0, Math.round(input.itemCount)),
    });
  }

  capturePerformance(input: {
    metric: PerformanceMetric;
    durationMs: number;
    cacheHit: boolean;
  }): void {
    this.capture("desktop performance measured", {
      metric: input.metric,
      duration_ms: roundedDuration(input.durationMs),
      cache_hit: input.cacheHit,
    });
  }

  async shutdown(): Promise<void> {
    await this.client.shutdown().catch(() => undefined);
  }

  private capture(event: string, properties: TelemetryProperties): void {
    if (!this.packaged || !this.status().enabled) return;
    try {
      this.client.capture(event, {
        product_surface: "mail_app",
        client_platform: "desktop",
        deployment_environment: "production",
        desktop_app_version: app.getVersion(),
        mcp_version: MCP_VERSION,
        electron_version: process.versions.electron,
        operating_system: process.platform,
        architecture: process.arch,
        ...properties,
      });
    } catch {
      // Analytics is best effort and must never affect mail operations.
    }
  }

  private effectiveEnvironment(): NodeJS.ProcessEnv {
    if (this.options.testClient) return this.preferenceEnvironment();
    if (this.packaged) return process.env;
    return { ...process.env, FLUXMAIL_TELEMETRY: "0" };
  }

  private preferenceEnvironment(): NodeJS.ProcessEnv {
    const environment: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: "production",
    };
    delete environment.VITEST;
    return environment;
  }
}

export function environmentForcesOptOut(env: NodeJS.ProcessEnv): boolean {
  const telemetry = env.FLUXMAIL_TELEMETRY?.trim().toLowerCase();
  const dnt = env.DO_NOT_TRACK?.trim().toLowerCase();
  return (
    ["0", "false", "no", "off"].includes(telemetry ?? "") ||
    !["", "0", "false", "no", "off"].includes(dnt ?? "")
  );
}

function safeErrorCode(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : "unknown_error";
}

function roundedDuration(value: number): number {
  return Math.max(0, Math.round(value));
}
