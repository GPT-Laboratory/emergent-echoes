import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ConfigPanel } from "@/components/lab/ConfigPanel";
import { PropensityChart, type SweepPoint } from "@/components/lab/PropensityChart";
import { WorldTile } from "@/components/lab/WorldTile";
import { supabase } from "@/integrations/supabase/client";
import { downloadRunJson } from "@/lib/export-client";
import { useRunSteps, useWorlds } from "@/lib/lab-client";
import { activateRun, createRun, createSweep, exportRun, finishExperiment, stopRun, tickWorld } from "@/lib/lab.functions";
import { DEFAULT_CONFIG, type LabConfig } from "@/lib/lab-types";
import { cancelDriver, cancelSweep, getSweepProgress, isDriving, startDriver, startSweep, subscribeDrivers } from "@/lib/run-driver";

type SweepKnob = "difficulty" | "reasoningBudget" | "persistence";

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "warning" }) {
  return (
    <div className="rounded-md border border-border bg-card/70 px-4 py-3">
      <div className="label-caps">{label}</div>
      <div
        className={[
          "mt-1 font-mono text-2xl",
          tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

export function LabView({ runId }: { runId: string | null }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<LabConfig>(DEFAULT_CONFIG);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweepKnob, setSweepKnob] = useState<SweepKnob>("difficulty");
  const [sweep, setSweep] = useState<SweepPoint[]>([]);
  const [exporting, setExporting] = useState(false);
  const [sweepPoints, setSweepPoints] = useState("0.2, 0.4, 0.6, 0.8, 1.0");

  const doCreate = useServerFn(createRun);
  const doTick = useServerFn(tickWorld);
  const doStop = useServerFn(stopRun);
  const doExport = useServerFn(exportRun);
  const doSweep = useServerFn(createSweep);
  const doActivate = useServerFn(activateRun);
  const doFinish = useServerFn(finishExperiment);

  const driving = useSyncExternalStore(
    subscribeDrivers,
    () => isDriving(runId),
    () => false,
  );

  const sweepProgress = useSyncExternalStore(
    subscribeDrivers,
    () => getSweepProgress(),
    () => null,
  );

  const worlds = useWorlds(runId);
  const steps = useRunSteps(runId);

  /* ---- hydrate the run row (config + status) straight from the database ---- */
  useEffect(() => {
    if (!runId) {
      setRunStatus(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("runs").select("config,status").eq("id", runId).maybeSingle();
      if (cancelled || !data) return;
      setConfig({ ...DEFAULT_CONFIG, ...(data.config as Partial<LabConfig>) });
      setRunStatus(data.status as string);
    };
    void load();
    const channel = supabase
      .channel(`run-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "runs" }, () => void load())
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  const stepsByWorld = useMemo(() => {
    const m = new Map<string, { count: number; maxSev: number | null }>();
    for (const s of steps) {
      const cur = m.get(s.world_id) ?? { count: 0, maxSev: null };
      cur.count += 1;
      if (s.monitor_severity != null) cur.maxSev = Math.max(cur.maxSev ?? 0, s.monitor_severity);
      m.set(s.world_id, cur);
    }
    return m;
  }, [steps]);

  const stats = useMemo(() => {
    const n = worlds.length || 1;
    const crossed = worlds.filter((w) => w.cross_agent_read);
    const solicited = worlds.filter((w) => w.solicit_write).length;
    const meanFirst =
      crossed.length > 0
        ? crossed.reduce((acc, w) => acc + (w.first_cross_read_step ?? 0), 0) / crossed.length
        : null;
    const flaggedFirst = worlds.map((w) => w.first_flag_step).filter((v): v is number => v != null);
    return {
      crossRate: Math.round((crossed.length / n) * 100),
      solicitRate: Math.round((solicited / n) * 100),
      meanFirst,
      meanFirstFlag: flaggedFirst.length ? flaggedFirst.reduce((a, b) => a + b, 0) / flaggedFirst.length : null,
    };
  }, [worlds]);

  /* ---- sweep across every recorded run, bucketed by the chosen knob ---- */
  const loadSweep = useCallback(async () => {
    const { data: runs } = await supabase.from("runs").select("id,config");
    const { data: allWorlds } = await supabase.from("worlds").select("run_id,cross_agent_read,solicit_write");
    if (!runs || !allWorlds) return;
    const cfgByRun = new Map(runs.map((r) => [r.id, r.config as Partial<LabConfig>]));
    const buckets = new Map<string, { emerged: number; total: number; sort: number }>();
    for (const w of allWorlds) {
      const cfg = cfgByRun.get(w.run_id);
      if (!cfg) continue;
      let key: string;
      let sort: number;
      if (sweepKnob === "reasoningBudget") {
        sort = Number(cfg.reasoningBudget ?? 0);
        key = `${sort}`;
      } else {
        const raw = Number(cfg[sweepKnob] ?? 0);
        sort = Math.round(raw * 10) / 10;
        key = `${Math.round(sort * 100)}%`;
      }
      const b = buckets.get(key) ?? { emerged: 0, total: 0, sort };
      b.total += 1;
      if (w.cross_agent_read || w.solicit_write) b.emerged += 1;
      buckets.set(key, b);
    }
    setSweep(
      [...buckets.entries()]
        .sort((a, b) => a[1].sort - b[1].sort)
        .map(([bucket, b]) => ({
          bucket,
          worlds: b.total,
          emergenceRate: Math.round((b.emerged / b.total) * 100),
        })),
    );
  }, [sweepKnob]);

  useEffect(() => {
    void loadSweep();
  }, [loadSweep, runId, worlds.length, stats.crossRate]);

  /* ---- RUN is the only thing that ever begins execution ---- */
  const start = async () => {
    setError(null);
    try {
      const res = await doCreate({ data: { config } });
      void startDriver(res.runId, (a) => doTick(a), (msg) => setError(msg));
      void navigate({ to: "/run/$runId", params: { runId: res.runId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---- SWEEP: same configuration, persistence varied point by point ---- */
  const startSweepRun = async () => {
    setError(null);
    const points = sweepPoints
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    if (!points.length) {
      setError("Enter at least one persistence value between 0 and 1.");
      return;
    }
    try {
      const res = await doSweep({ data: { config, points } });
      void startSweep(
        res.experimentId,
        res.runs,
        { tick: (a) => doTick(a), activate: (a) => doActivate(a), finish: (a) => doFinish(a) },
        (msg) => setError(msg),
      );
      void navigate({ to: "/experiment/$experimentId", params: { experimentId: res.experimentId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const singleTick = async () => {
    if (!runId) return;
    const { data: active } = await supabase.from("worlds").select("id").eq("run_id", runId).eq("status", "running");
    await Promise.all((active ?? []).map((w) => doTick({ data: { worldId: w.id } }).catch(() => null)));
  };

  const stop = async () => {
    if (!runId) return;
    cancelDriver(runId);
    await doStop({ data: { runId } });
  };

  const download = async () => {
    if (!runId) return;
    setExporting(true);
    try {
      const doc = await doExport({ data: { runId } });
      downloadRunJson(runId, doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  };

  const readOnly = runId != null;

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
        <aside className="space-y-5">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Pressure knobs</h1>
            <p className="mt-1 text-xs leading-snug text-muted-foreground">
              Agents are never told that other agents exist. Every knob changes pressure, not instructions.
            </p>
            {runId && (
              <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                run {runId.slice(0, 8)} · {config.taskMode} · {runStatus ?? "…"} {driving ? "· driving" : ""}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="label-caps">Task mode</div>
            <div className="grid grid-cols-2 gap-2">
              {(["assisted", "emergent"] as const).map((m) => {
                const active = config.taskMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={active}
                    onClick={() => setConfig({ ...config, taskMode: m })}
                    title={
                      m === "assisted"
                        ? "Each agent is handed one half of its answer and told the other half is missing."
                        : "No agent is handed anything; each must produce the piece its partner happens to need."
                    }
                    className={[
                      "rounded-md border px-2 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors",
                      active
                        ? "border-primary bg-primary/20 text-primary"
                        : "border-border text-muted-foreground hover:text-foreground",
                      readOnly ? "cursor-not-allowed opacity-60" : "",
                    ].join(" ")}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
            <p className="text-xs leading-snug text-muted-foreground">
              Selecting a mode changes nothing until you press Run or Sweep persistence.
            </p>
          </div>

          <ConfigPanel config={config} onChange={(p) => setConfig({ ...config, ...p })} disabled={readOnly} />

          <div className="flex flex-wrap gap-2">
            {runId ? (
              <Link to="/" className="inline-flex">
                <Button className="font-mono text-xs uppercase tracking-widest">New run</Button>
              </Link>
            ) : (
              <>
                <Button
                  onClick={() => void start()}
                  title={`Starts one run in ${config.taskMode} mode.`}
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  Run
                </Button>
                <Button
                  onClick={() => void startSweepRun()}
                  variant="outline"
                  title="Runs the same configuration once per persistence value and plots the dose-response curve."
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  Sweep persistence
                </Button>
              </>
            )}
            <Button
              variant="secondary"
              onClick={singleTick}
              disabled={driving || !runId || runStatus !== "running"}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Step
            </Button>
            <Button
              variant="destructive"
              onClick={stop}
              disabled={!runId || runStatus !== "running"}
              className="font-mono text-xs uppercase tracking-widest"
            >
              Stop
            </Button>
            {runId && (
              <Button
                variant="secondary"
                onClick={download}
                disabled={exporting}
                className="font-mono text-xs uppercase tracking-widest"
              >
                {exporting ? "Building…" : "Download JSON"}
              </Button>
            )}
          </div>

          {!runId && (
            <div className="space-y-1">
              <label className="label-caps" htmlFor="sweep-points">
                Sweep points (persistence)
              </label>
              <input
                id="sweep-points"
                value={sweepPoints}
                onChange={(e) => setSweepPoints(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
              />
            </div>
          )}

          {sweepProgress && !sweepProgress.finished && (
            <div className="rounded-md border border-border bg-card/70 p-2 font-mono text-[11px] text-muted-foreground">
              sweep point {sweepProgress.pointIndex + 1}/{sweepProgress.totalPoints} · persistence{" "}
              {sweepProgress.persistence} · worlds {sweepProgress.worldsDone}/{sweepProgress.worldsTotal}
              <button
                onClick={() => cancelSweep(sweepProgress.experimentId)}
                className="ml-2 uppercase tracking-widest text-destructive hover:underline"
              >
                stop sweep
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
              {error}
            </p>
          )}
        </aside>

        <section className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Cross-agent read emerged" value={`${stats.crossRate}%`} tone="primary" />
            <Stat label="Solicit / answer write" value={`${stats.solicitRate}%`} tone="warning" />
            <Stat
              label="Mean steps to first cross-read"
              value={stats.meanFirst == null ? "—" : stats.meanFirst.toFixed(1)}
            />
            <Stat
              label="Mean step of first monitor flag"
              value={stats.meanFirstFlag == null ? "—" : stats.meanFirstFlag.toFixed(1)}
            />
          </div>

          <div className="rounded-md border border-border bg-card/70 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-mono text-sm text-foreground">Coordination emergence rate</h2>
              <div className="flex gap-1">
                {(["difficulty", "reasoningBudget", "persistence"] as SweepKnob[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSweepKnob(k)}
                    className={[
                      "rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
                      sweepKnob === k ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {k === "reasoningBudget" ? "reasoning" : k}
                  </button>
                ))}
              </div>
            </div>
            <PropensityChart data={sweep} knobLabel={`swept by ${sweepKnob}`} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pooled across every recorded run, including runs where nothing emerged.
            </p>
          </div>

          <div>
            <h2 className="mb-3 font-mono text-sm text-foreground">
              Worlds {worlds.length > 0 && <span className="text-muted-foreground">({worlds.length})</span>}
            </h2>
            {worlds.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {runId ? "Loading this run…" : "No worlds yet. Set the knobs and start a run."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {worlds.map((w) => (
                  <WorldTile
                    key={w.id}
                    world={w}
                    steps={stepsByWorld.get(w.id)?.count ?? 0}
                    maxSeverity={stepsByWorld.get(w.id)?.maxSev ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
