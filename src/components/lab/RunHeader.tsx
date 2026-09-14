import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_CONFIG,
  effectiveReasoningEffort,
  formatDuration,
  PROVIDER_FIXED_TEMPERATURE,
  temperatureSupported,
  type LabConfig,
} from "@/lib/lab-types";

export type RunRow = {
  id: string;
  status: string;
  config: LabConfig;
  started_at: string | null;
  created_at?: string | null;
  finished_at?: string | null;
  duration_ms: number | null;
  experiment_id?: string | null;
};

/** A run only stops being provisional once it has actually finished. */
export function isProvisional(status: string | null | undefined): boolean {
  return status !== "complete";
}

export function ProvisionalBadge({ status }: { status: string | null | undefined }) {
  if (!isProvisional(status)) return null;
  return (
    <span className="rounded-sm border border-warning/50 bg-warning/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-warning">
      Provisional, run in progress
    </span>
  );
}

function tempLabel(cfg: LabConfig): string {
  return temperatureSupported(cfg.agentModel)
    ? cfg.agentTemperature.toFixed(2)
    : `${PROVIDER_FIXED_TEMPERATURE.toFixed(2)} provider-fixed`;
}

/**
 * Self-documenting run header: everything needed to identify the experiment
 * from a single screenshot, on every screen that shows run data.
 */
export function RunHeader({
  run,
  runId,
  sweepPoints,
  className,
}: {
  run?: RunRow | null;
  runId?: string | null;
  sweepPoints?: number | null;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<RunRow | null>(null);
  const [points, setPoints] = useState<number | null>(sweepPoints ?? null);

  useEffect(() => {
    if (run || !runId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("runs")
        .select("id,status,config,started_at,created_at,finished_at,duration_ms,experiment_id")
        .eq("id", runId)
        .maybeSingle();
      if (!cancelled && data) setLoaded(data as unknown as RunRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [run, runId]);

  const row = run ?? loaded;
  const experimentId = row?.experiment_id ?? null;

  useEffect(() => {
    if (sweepPoints != null || !experimentId) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("runs").select("id").eq("experiment_id", experimentId);
      if (!cancelled) setPoints(data?.length ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [experimentId, sweepPoints]);

  /** A running run has no recorded duration yet — tick it live. */
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!row || row.duration_ms != null || row.status !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [row?.duration_ms, row?.status, row]);

  if (!row) return null;

  const cfg: LabConfig = { ...DEFAULT_CONFIG, ...(row.config ?? {}) };
  const started = row.started_at ?? row.created_at ?? null;
  const durationMs =
    row.duration_ms ?? (started && row.status === "running" ? now - new Date(started).getTime() : null);

  const pressure =
    points != null && points > 1
      ? `sweep ${points} points`
      : `persistence ${cfg.persistence.toFixed(2)}`;

  const line1 = [
    cfg.agentModel,
    cfg.taskMode,
    cfg.schedulerMode,
    `effort ${effectiveReasoningEffort(cfg.agentModel, cfg.agentReasoningEffort)}/${effectiveReasoningEffort(
      cfg.agentModel,
      cfg.monitorReasoningEffort,
    )}`,
    `temp ${tempLabel(cfg)}`,
    `budget ${cfg.reasoningBudget}`,
    pressure,
    `${cfg.replicates}×${cfg.worldCount} worlds`,
  ].join(" · ");

  const line2 = [
    row.status,
    `started ${started ? new Date(started).toLocaleString() : "—"}`,
    `duration ${durationMs != null ? formatDuration(durationMs) : "—"}`,
    `base seed ${cfg.baseSeed ?? "—"}`,
  ].join(" · ");

  return (
    <div className={["rounded-md border border-border bg-card/70 px-3 py-2", className ?? ""].join(" ")}>
      <p className="font-mono text-[11px] leading-relaxed text-foreground">{line1}</p>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{line2}</p>
      <p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {cfg.runNote?.trim() ? cfg.runNote : "no run note"}
      </p>
    </div>
  );
}
