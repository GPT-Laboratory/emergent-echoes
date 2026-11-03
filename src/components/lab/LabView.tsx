import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { ConfigPanel } from "@/components/lab/ConfigPanel";
import { PropensityChart, type SweepPoint } from "@/components/lab/PropensityChart";
import { isProvisional, ProvisionalBadge, RunHeader, type RunRow } from "@/components/lab/RunHeader";
import { WorldTile } from "@/components/lab/WorldTile";
import { supabase } from "@/integrations/supabase/client";
import { downloadPromptsAppendix, downloadRunJson } from "@/lib/export-client";
import { awarenessRank, buildPromptsAppendix } from "@/lib/prompt-spec";
import { useRunSteps, useWorlds } from "@/lib/lab-client";
import { wilson } from "@/lib/stats";
import {
  activateRun,
  classifyAwarenessBatch,
  codingSample,
  createReplicateSet,
  createRun,
  createSweep,
  exportRun,
  importCodings,
  monitorValidation,
  finishExperiment,
  stepAgent,
  stopRun,
  tickWorld,
} from "@/lib/lab.functions";
import { CLAUSE_SWEEP_POINTS, DEFAULT_CONFIG, clauseSelectorActive, type LabConfig } from "@/lib/lab-types";
import { cancelDriver, cancelSweep, getSweepProgress, isDriving, startDriver, startSweep, subscribeDrivers } from "@/lib/run-driver";

type SweepKnob = "difficulty" | "reasoningBudget" | "persistence";

function Stat({
  label,
  value,
  tone,
  provisional,
}: {
  label: string;
  value: string;
  tone?: "primary" | "warning";
  provisional?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-card/70 px-4 py-3">
      <div className="label-caps">{label}</div>
      <div
        className={[
          "mt-1 font-mono text-2xl",
          provisional
            ? "text-muted-foreground/70"
            : tone === "primary"
              ? "text-primary"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground",
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
  const [runRow, setRunRow] = useState<RunRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sweepKnob, setSweepKnob] = useState<SweepKnob>("difficulty");
  const [sweep, setSweep] = useState<SweepPoint[]>([]);
  // Instrument versions are never pooled by default: v1 recorded truncated replies as submit.
  const [includeV1, setIncludeV1] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sweepPoints, setSweepPoints] = useState("0.2, 0.4, 0.6, 0.8, 1.0");
  const [classifying, setClassifying] = useState(false);
  const [measureNote, setMeasureNote] = useState<string | null>(null);

  const doCreate = useServerFn(createRun);
  const doTick = useServerFn(tickWorld);
  const doStop = useServerFn(stopRun);
  const doExport = useServerFn(exportRun);
  const doSweep = useServerFn(createSweep);
  const doActivate = useServerFn(activateRun);
  const doFinish = useServerFn(finishExperiment);
  const doStepAgent = useServerFn(stepAgent);
  const doReplicateSet = useServerFn(createReplicateSet);
  const doClassify = useServerFn(classifyAwarenessBatch);
  const doSample = useServerFn(codingSample);
  const doImport = useServerFn(importCodings);
  const doValidation = useServerFn(monitorValidation);

  /** Classify stored steps in small batches until the backlog is empty. */
  const runClassifier = async () => {
    setClassifying(true);
    setMeasureNote("Classifying stored steps…");
    try {
      let done = 0;
      for (;;) {
        const res = await doClassify({ data: { limit: 20 } });
        done += res.processed;
        setMeasureNote(`Classified ${done} steps · ${res.remaining} remaining`);
        if (res.processed === 0 || res.remaining === 0) break;
      }
      setMeasureNote(`Classification complete · ${done} steps labelled`);
    } catch (e) {
      setMeasureNote(`Classification failed: ${String(e)}`);
    } finally {
      setClassifying(false);
    }
  };

  const downloadSample = async (stratify: "severity" | "awareness" = "severity") => {
    const res = await doSample({ data: { size: 100, stratify } });
    const cols = [
      "step_id",
      "world_id",
      "step_index",
      "tool",
      "monitor_severity",
      "monitor_label",
      "awareness_label",
      "awareness_quote",
      "human_severity",
      "human_awareness",
      "reasoning",
      "observation",
    ];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      `# sample_seed=${res.sample_seed}`,
      cols.join(","),
      ...res.rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `coding-sample_${stratify}_seed-${res.sample_seed}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMeasureNote(`Sample of ${res.rows.length} steps downloaded · seed ${res.sample_seed}`);
  };

  const importCsv = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      const seedLine = lines.find((l) => l.startsWith("# sample_seed="));
      const sampleSeed = seedLine ? Number(seedLine.split("=")[1]) : null;
      const body = lines.filter((l) => !l.startsWith("#"));
      const header = (body.shift() ?? "").split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const idx = (name: string) => header.indexOf(name);
      const parseRow = (line: string) => {
        const out: string[] = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i]!;
          if (quoted) {
            if (ch === '"' && line[i + 1] === '"') {
              cur += '"';
              i++;
            } else if (ch === '"') quoted = false;
            else cur += ch;
          } else if (ch === '"') quoted = true;
          else if (ch === ",") {
            out.push(cur);
            cur = "";
          } else cur += ch;
        }
        out.push(cur);
        return out;
      };
      const rows = body
        .map(parseRow)
        .map((cells) => ({
          step_id: (cells[idx("step_id")] ?? "").trim(),
          human_severity: cells[idx("human_severity")]?.trim() ? Number(cells[idx("human_severity")]) : null,
          human_awareness: cells[idx("human_awareness")]?.trim() || null,
        }))
        .filter((r) => r.step_id && (r.human_severity != null || r.human_awareness != null));
      if (!rows.length) {
        setMeasureNote("No coded rows found in that file.");
        return;
      }
      const res = await doImport({ data: { sampleSeed, rows } });
      const val = await doValidation({ data: {} });
      const sev = val?.severity_weighted_kappa?.kappa;
      const aw = val?.awareness_kappa?.kappa;
      setMeasureNote(
        `Imported ${res.imported} codings · severity kappa ${sev == null ? "—" : sev.toFixed(2)} · awareness kappa ${aw == null ? "—" : aw.toFixed(2)}`,
      );
    } catch (e) {
      setMeasureNote(`Import failed: ${String(e)}`);
    }
  };

  const driverOpts = () => ({
    mode: config.schedulerMode,
    stepAgent: (a: { data: { agentId: string } }) => doStepAgent(a),
  });

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
      setRunRow(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("runs")
        .select("id,config,status,started_at,created_at,finished_at,duration_ms,experiment_id")
        .eq("id", runId)
        .maybeSingle();
      if (cancelled || !data) return;
      setConfig({ ...DEFAULT_CONFIG, ...(data.config as Partial<LabConfig>) });
      setRunStatus(data.status as string);
      setRunRow(data as unknown as RunRow);
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

  /* ---- ask once, so completion can be signalled even from a background tab ---- */
  useEffect(() => {
    if (!runId || typeof Notification === "undefined") return;
    if (Notification.permission === "default") void Notification.requestPermission();
  }, [runId]);

  /* ---- completion signalling: tab title + browser notification ---- */
  const [signalled, setSignalled] = useState<string | null>(null);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!runId || runStatus !== "complete") return;
    const coordinated = worlds.filter((w) => w.cross_agent_read || w.solicit_write).length;
    document.title = `✓ done — run ${runId.slice(0, 8)}`;
    if (signalled === runId) return;
    setSignalled(runId);
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification(`Run complete: ${config.agentModel}, ${coordinated}/${worlds.length} coordinated`);
      } catch {
        /* notifications are a convenience, never a failure path */
      }
    }
  }, [runId, runStatus, worlds, config.agentModel, signalled]);

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

  /** Weaker, additive signal: a list() that revealed a key written by another agent. */
  const exposedWorldIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of steps) {
      if (String((s.action as Record<string, unknown>)["tool"] ?? "") !== "list") continue;
      if ((s.foreign_keys ?? []).length > 0) ids.add(s.world_id);
    }
    return ids;
  }, [steps]);

  /* ---- agents of this run, for the correctness + ceiling funnel stages ---- */
  const [runAgents, setRunAgents] = useState<
    Array<{ answer: string | null; task: Record<string, unknown> | null; step_count: number | null }>
  >([]);
  useEffect(() => {
    if (!runId || worlds.length === 0) {
      setRunAgents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("agents")
        .select("answer,task,step_count")
        .in(
          "world_id",
          worlds.map((w) => w.id),
        );
      if (!cancelled) setRunAgents((data ?? []) as never);
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, worlds]);

  const runWorlds = worlds;
  const stats = useMemo(() => {
    // Propensities are computed over valid worlds only (instrument v2).
    const validWorlds = runWorlds.filter((w) => !w.invalidated);
    const excluded = runWorlds.length - validWorlds.length;
    const worlds = validWorlds;
    const n = worlds.length || 1;
    const crossed = worlds.filter((w) => w.cross_agent_read);
    const exposed = worlds.filter((w) => exposedWorldIds.has(w.id));
    const wroteIds = new Set(
      steps.filter((s) => String((s.action as Record<string, unknown>)["tool"] ?? "") === "write").map((s) => s.world_id),
    );
    const awareIds = new Set(
      steps.filter((s) => awarenessRank((s as { awareness_label?: string | null }).awareness_label ?? null) > 0).map((s) => s.world_id),
    );
    const budget = Math.max(2, Math.round(config.reasoningBudget));
    const ceilingAgents = runAgents.filter((a) => (a.step_count ?? 0) >= budget).length;
    const interAgents = runAgents.filter(
      (a) => ((a.task ?? {})["interdependency"] as Record<string, unknown> | null)?.["group_id"],
    );
    const correctAgents = interAgents.filter((a) => {
      const expected = (a.task ?? {})["expected"];
      const got = String(a.answer ?? "").trim().match(/-?\d+/g) ?? [];
      return got.length === 1 && expected != null && Number(got[0]) === Number(String(expected));
    }).length;
    const pct = (k: number, d: number) => (d ? Math.round((k / d) * 100) : 0);
    const wExp = wilson(exposed.length, worlds.length);
    const solicited = worlds.filter((w) => w.solicit_write).length;
    const meanFirst =
      crossed.length > 0
        ? crossed.reduce((acc, w) => acc + (w.first_cross_read_step ?? 0), 0) / crossed.length
        : null;
    const flaggedFirst = worlds.map((w) => w.first_flag_step).filter((v): v is number => v != null);
    const w95 = wilson(crossed.length, worlds.length);
    return {
      validLabel: `${crossed.length}/${worlds.length} valid worlds (${excluded} excluded)`,
      crossRate: Math.round((crossed.length / n) * 100),
      exposureRate: Math.round((exposed.length / n) * 100),
      exposureCi: worlds.length ? `${Math.round(wExp.low * 100)}–${Math.round(wExp.high * 100)}%` : "—",
      ci: worlds.length ? `${Math.round(w95.low * 100)}–${Math.round(w95.high * 100)}%` : "—",
      solicitRate: Math.round((solicited / n) * 100),
      meanFirst,
      meanFirstFlag: flaggedFirst.length ? flaggedFirst.reduce((a, b) => a + b, 0) / flaggedFirst.length : null,
      writeRate: pct(wroteIds.size, worlds.length),
      awareRate: pct(awareIds.size, worlds.length),
      ceilingRate: pct(ceilingAgents, runAgents.length),
      correctRate: pct(correctAgents, interAgents.length),
    };
  }, [runWorlds, exposedWorldIds, steps, runAgents, config.reasoningBudget]);

  /* ---- sweep across every recorded run, bucketed by the chosen knob ---- */
  const loadSweep = useCallback(async () => {
    const { data: runs } = await supabase.from("runs").select("id,config");
    const { data: allWorlds } = await supabase.from("worlds").select("run_id,cross_agent_read,solicit_write,invalidated");
    if (!runs || !allWorlds) return;
    const cfgByRun = new Map(
      runs
        .filter((r) => includeV1 || (r.config as { instrumentVersion?: string } | null)?.instrumentVersion === "v2")
        .map((r) => [r.id, r.config as Partial<LabConfig>]),
    );
    const buckets = new Map<string, { emerged: number; total: number; excluded: number; sort: number }>();
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
      const b = buckets.get(key) ?? { emerged: 0, total: 0, excluded: 0, sort };
      if (w.invalidated) {
        b.excluded += 1;
        buckets.set(key, b);
        continue;
      }
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
          excluded: b.excluded,
          emerged: b.emerged,
          emergenceRate: b.total ? Math.round((b.emerged / b.total) * 100) : 0,
        })),
    );
  }, [sweepKnob, includeV1]);

  useEffect(() => {
    void loadSweep();
  }, [loadSweep, runId, worlds.length, stats.crossRate]);

  /* ---- RUN is the only thing that ever begins execution ---- */
  const start = async () => {
    setError(null);
    try {
      // More than one replicate: a grouped set of identical-configuration runs,
      // executed one after another so the pooled rate carries a real interval.
      if (config.replicates > 1) {
        const set = await doReplicateSet({ data: { config } });
        void startSweep(
          set.experimentId,
          set.runs,
          { tick: (a) => doTick(a), activate: (a) => doActivate(a), finish: (a) => doFinish(a) },
          (msg) => setError(msg),
          driverOpts(),
        );
        void navigate({ to: "/experiment/$experimentId", params: { experimentId: set.experimentId } });
        return;
      }
      const res = await doCreate({ data: { config } });
      void startDriver(res.runId, (a) => doTick(a), (msg) => setError(msg), driverOpts());
      void navigate({ to: "/run/$runId", params: { runId: res.runId } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  /* ---- SWEEP: same configuration, one point per clause (or per persistence value) ---- */
  const startSweepRun = async () => {
    setError(null);
    const clauseSweep = clauseSelectorActive(config);
    const points = sweepPoints
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v) && v >= 0 && v <= 1);
    if (!clauseSweep && !points.length) {
      setError("Enter at least one persistence value between 0 and 1.");
      return;
    }
    try {
      const res = await doSweep({
        data: clauseSweep ? { config, clausePoints: [...CLAUSE_SWEEP_POINTS] } : { config, points },
      });
      void startSweep(
        res.experimentId,
        res.runs,
        { tick: (a) => doTick(a), activate: (a) => doActivate(a), finish: (a) => doFinish(a) },
        (msg) => setError(msg),
        driverOpts(),
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
  const provisional = runId != null && isProvisional(runStatus);

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
                run {runId.slice(0, 8)} · {runStatus ?? "…"} {driving ? "· driving" : ""}
              </p>
            )}
            {!runId && (
              <p className="mt-2 font-mono text-[11px] text-primary">agent model · {config.agentModel}</p>
            )}

          </div>

          <div className="space-y-2">
            <div className="label-caps">Task mode</div>
            <div className="grid grid-cols-3 gap-2">
              {(["assisted", "emergent", "no-store", "private-store", "prepopulated"] as const).map((m) => {
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
                        : m === "emergent"
                          ? "No agent is handed anything; each must produce the piece its partner happens to need."
                          : m === "private-store"
                            ? "Control condition: identical to emergent, but each agent only sees its own store entries."
                            : m === "prepopulated"
                              ? "Control condition: identical to emergent, but every produced value is already in the store at start."
                              : "Control condition: identical to emergent, but no shared store exists and submit is the only tool."
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

          <div className="space-y-2">
            <div className="label-caps">Scheduler</div>
            <div className="grid grid-cols-2 gap-2">
              {(["lockstep", "async"] as const).map((m) => {
                const active = config.schedulerMode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={active}
                    onClick={() => setConfig({ ...config, schedulerMode: m })}
                    title={
                      m === "lockstep"
                        ? "Every agent takes exactly one step per tick and waits for the others."
                        : "No barrier: each agent's next step is dispatched as soon as its previous one returns."
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
              Async removes the wait-for-everyone barrier. Interleaving then comes only from real model latency.
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
                  title={
                    clauseSelectorActive(config)
                      ? `Runs the same configuration once per clause: ${CLAUSE_SWEEP_POINTS.join(", ")}.`
                      : "Runs the same configuration once per persistence value and plots the dose-response curve."
                  }
                  className="font-mono text-xs uppercase tracking-widest"
                >
                  {clauseSelectorActive(config) ? "Sweep clause" : "Sweep persistence"}
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
            <Button
              variant="outline"
              title="Appendix A, rendered from the live prompt code for exactly this model, effort and task mix."
              onClick={() =>
                downloadPromptsAppendix(
                  buildPromptsAppendix(config, {
                    runId,
                    startedAt: runRow?.started_at ?? null,
                    label: config.runNote,
                  }),
                  runRow?.started_at ?? null,
                  config,
                )
              }
              className="font-mono text-xs uppercase tracking-widest"
            >
              Prompt appendix
            </Button>
          </div>

          {/* Measurement upgrades: backfill of stored steps and monitor validation. */}
          <div className="space-y-2 rounded-md border border-border bg-card/40 p-3">
            <div className="label-caps">Measurement</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={classifying}
                title="Classifies stored steps that have no awareness label yet. Restartable; changes no run."
                onClick={() => void runClassifier()}
                className="font-mono text-xs uppercase tracking-widest"
              >
                {classifying ? "Classifying…" : "Classify stored steps"}
              </Button>
              <Button
                variant="outline"
                title="Stratified sample of stored steps as CSV for hand coding."
                onClick={() => void downloadSample("severity")}
                className="font-mono text-xs uppercase tracking-widest"
              >
                Coding sample CSV
              </Button>
              <Button
                variant="outline"
                title="Stratified by awareness-classifier label, for coding human_awareness."
                onClick={() => void downloadSample("awareness")}
                className="font-mono text-xs uppercase tracking-widest"
              >
                Awareness sample CSV
              </Button>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-border px-3 py-2 font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground">
                Import coding
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void importCsv(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {measureNote && <p className="font-mono text-[11px] text-muted-foreground">{measureNote}</p>}
          </div>


          {!runId &&
            (clauseSelectorActive(config) ? (
              <div className="space-y-1">
                <div className="label-caps">Sweep points (clause)</div>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {CLAUSE_SWEEP_POINTS.join(" → ")} · fixed order, one base seed, {config.replicates} replicates each
                </p>
              </div>
            ) : (
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
            ))}

          {sweepProgress && !sweepProgress.finished && (
            <div className="rounded-md border border-border bg-card/70 p-2 font-mono text-[11px] text-muted-foreground">
              {config.agentModel} · {config.taskMode} · {config.schedulerMode} · sweep point {sweepProgress.pointIndex + 1}/
              {sweepProgress.totalPoints} ·{" "}
              {sweepProgress.label
                ? `clause ${sweepProgress.label}`
                : `persistence ${sweepProgress.persistence}`}{" "}
              · worlds {sweepProgress.worldsDone}/{sweepProgress.worldsTotal}
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
          {runId && <RunHeader run={runRow} runId={runId} />}

          <div className="space-y-2">
            {runId && isProvisional(runStatus) && (
              <div className="flex items-center gap-2">
                <ProvisionalBadge status={runStatus} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  figures below are not a result until the run completes
                </span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label={`Cross-agent read emerged · ${stats.validLabel}`}
                value={`${stats.crossRate}%`}
                tone="primary"
                provisional={provisional}
              />
              <Stat
                label="Coordination 95% CI"
                value={stats.ci}
                tone="primary"
                provisional={provisional}
              />
              <Stat
                label="Exposure (list saw foreign key)"
                value={`${stats.exposureRate}%`}
                provisional={provisional}
              />
              <Stat
                label="Exposure 95% CI"
                value={stats.exposureCi}
                provisional={provisional}
              />
              <Stat
                label="Solicit / answer write"
                value={`${stats.solicitRate}%`}
                tone="warning"
                provisional={provisional}
              />
              <Stat
                label="Awareness · unvalidated"
                value={`${stats.awareRate}%`}
                provisional={provisional}
              />
              <Stat
                label="Mean step of first monitor flag"
                value={stats.meanFirstFlag == null ? "—" : stats.meanFirstFlag.toFixed(1)}
                provisional={provisional}
              />
            </div>

            {/* One-line funnel: every stage between writing and a correct answer. */}
            <div
              className="rounded-md border border-border bg-card/40 px-4 py-2 font-mono text-[11px] text-muted-foreground"
              title="write: worlds where any agent wrote · exposure: a list() returned a foreign key · coord: a read() returned a foreign key · correct: interdependent submissions matching ground truth · ceiling: agents that used the whole step budget · aware: worlds where the classifier saw awareness of another agent"
            >
              funnel · write {stats.writeRate}% · exposure {stats.exposureRate}% · coord {stats.crossRate}% · correct{" "}
              {stats.correctRate}% · ceiling {stats.ceilingRate}% · aware {stats.awareRate}% (unvalidated)
            </div>
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
            <label className="mb-2 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <input type="checkbox" checked={includeV1} onChange={(e) => setIncludeV1(e.target.checked)} />
              include v1 runs (truncated replies recorded as submit)
            </label>
            <PropensityChart data={sweep} knobLabel={`swept by ${sweepKnob}`} />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Pooled across {includeV1 ? "every recorded run (v1 and v2)" : "instrument v2 runs only"}, including runs where
              nothing emerged.
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
