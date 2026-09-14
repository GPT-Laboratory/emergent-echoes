import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useEffect, useState } from "react";

import { DoseResponseChart, type DosePoint } from "@/components/lab/DoseResponseChart";
import { CompleteBadge, ProvisionalBadge, RunHeader } from "@/components/lab/RunHeader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { downloadSweepJson } from "@/lib/export-client";
import { exportExperiment } from "@/lib/lab.functions";
import { formatDuration } from "@/lib/lab-types";
import { wilson } from "@/lib/stats";

export const Route = createFileRoute("/_authenticated/experiment/$experimentId")({
  head: () => ({
    meta: [
      { title: "Persistence sweep — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Dose-response curve of coordination emergence against agent persistence, with 95% Wilson intervals.",
      },
      { property: "og:title", content: "Persistence sweep — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "How often coordination emerges as agent persistence is turned up, pooled over seeded replicates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExperimentDetail,
});

type Exp = {
  id: string;
  type: string;
  task_mode: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  base_seed: number | null;
  sweep_points: Array<number | string>;
};

type Replicate = {
  runId: string;
  replicateIndex: number;
  replicateSeed: number | null;
  status: string;
  worlds: number;
  crossed: number;
  rate: number;
};

type PointRow = DosePoint & {
  worlds: number;
  crossed: number;
  low: number;
  high: number;
  replicates: Replicate[];
};

type ExpProgress = {
  runsDone: number;
  runsTotal: number;
  worldsDone: number;
  worldsTotal: number;
  activeRunId: string | null;
};

function formatEta(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function ExperimentDetail() {
  const { experimentId } = Route.useParams();
  const [exp, setExp] = useState<Exp | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [progress, setProgress] = useState<ExpProgress | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const doExport = useServerFn(exportExperiment);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: e } = await supabase.from("experiments").select("*").eq("id", experimentId).maybeSingle();
      const { data: runs } = await supabase
        .from("runs")
        .select("id,status,sweep_value,replicate_index,replicate_seed")
        .eq("experiment_id", experimentId)
        .order("sweep_value");
      const runIds = (runs ?? []).map((r) => r.id);
      const { data: worlds } = runIds.length
        ? await supabase.from("worlds").select("id,run_id,cross_agent_read,status").in("run_id", runIds)
        : { data: [] };
      const worldIds = (worlds ?? []).map((w) => w.id);
      const { data: agents } = worldIds.length
        ? await supabase.from("agents").select("world_id,answer,task").in("world_id", worldIds)
        : { data: [] };
      if (cancelled) return;

      const runOfWorld = new Map((worlds ?? []).map((w) => [w.id as string, w.run_id as string]));
      setExp(e ? ({ ...e, sweep_points: (e.sweep_points ?? []) as number[] } as Exp) : null);

      const allRuns = runs ?? [];
      const allWorlds = (worlds ?? []) as Array<{ run_id: string; status: string }>;
      setProgress({
        runsDone: allRuns.filter((r) => r.status === "complete").length,
        runsTotal: allRuns.length,
        worldsDone: allWorlds.filter((w) => w.status !== "running").length,
        worldsTotal: allWorlds.length,
        activeRunId: (allRuns.find((r) => r.status === "running")?.id as string | undefined) ?? null,
      });

      const byPoint = new Map<number, typeof runs>();
      for (const r of runs ?? []) {
        const p = Number(r.sweep_value ?? 0);
        byPoint.set(p, [...(byPoint.get(p) ?? []), r] as typeof runs);
      }

      setPoints(
        [...byPoint.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([persistence, reps]) => {
            const list = [...(reps ?? [])].sort(
              (a, b) => Number(a.replicate_index ?? 0) - Number(b.replicate_index ?? 0),
            );
            const replicates: Replicate[] = list.map((r) => {
              const ws = (worlds ?? []).filter((w) => w.run_id === r.id);
              const crossed = ws.filter((w) => w.cross_agent_read).length;
              return {
                runId: r.id as string,
                replicateIndex: Number(r.replicate_index ?? 0),
                replicateSeed: (r.replicate_seed as number | null) ?? null,
                status: r.status as string,
                worlds: ws.length,
                crossed,
                rate: ws.length ? crossed / ws.length : 0,
              };
            });

            const worldsTotal = replicates.reduce((a, r) => a + r.worlds, 0);
            const crossedTotal = replicates.reduce((a, r) => a + r.crossed, 0);
            const ci = wilson(crossedTotal, worldsTotal);

            const runIdSet = new Set(list.map((r) => r.id as string));
            const as = (agents ?? []).filter((a) => runIdSet.has(runOfWorld.get(a.world_id as string) ?? ""));
            const inter = as.filter(
              (a) =>
                ((a.task as { interdependency?: { group_id?: string | null } } | null)?.interdependency?.group_id ??
                  null) != null,
            );
            const empty = inter.filter((a) => !String(a.answer ?? "").trim()).length;

            return {
              persistence,
              worlds: worldsTotal,
              crossed: crossedTotal,
              coordination_rate: ci.rate,
              low: ci.low,
              high: ci.high,
              coordination_err: [ci.rate - ci.low, ci.high - ci.rate] as [number, number],
              empty_submission_rate: inter.length ? empty / inter.length : 0,
              replicates,
            };
          }),
      );
    };
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [experimentId]);

  const download = async () => {
    setBusy(true);
    try {
      const doc = await doExport({ data: { experimentId } });
      downloadSweepJson(experimentId, doc);
    } finally {
      setBusy(false);
    }
  };

  const title = exp?.type === "replicate_set" ? "Replicate set" : "Persistence sweep";
  const running = exp != null && exp.status !== "complete";

  let etaMs: number | null = null;
  if (running && exp && progress && progress.worldsDone >= 2 && progress.worldsDone < progress.worldsTotal) {
    const elapsed = Date.now() - new Date(exp.started_at).getTime();
    etaMs = Math.max(0, (elapsed / progress.worldsDone) * (progress.worldsTotal - progress.worldsDone));
  }
  const pct =
    progress && progress.worldsTotal ? Math.round((progress.worldsDone / progress.worldsTotal) * 100) : 0;

  // Clause sweeps store the clause index in sweep_value; names live on the experiment.
  const isClauseSweep = exp?.type === "persistence_clause_sweep";
  const clauseNames = (exp?.sweep_points ?? []).map((v) => String(v));

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {exp
              ? `${exp.task_mode} · ${exp.status} · started ${new Date(exp.started_at).toLocaleString()}${
                  exp.duration_ms != null ? ` · ${formatDuration(exp.duration_ms)}` : ""
                }${exp.base_seed != null ? ` · base seed ${exp.base_seed}` : ""}`
              : "loading…"}
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void download()}
          className="font-mono text-xs uppercase tracking-widest"
        >
          {busy ? "Building…" : "Download sweep JSON"}
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {running ? <ProvisionalBadge status="running" /> : <CompleteBadge />}
      </div>

      {(progress?.activeRunId || points[0]?.replicates[0]?.runId) && (
        <RunHeader runId={progress?.activeRunId ?? points[0]!.replicates[0]!.runId} sweepPoints={points.length} className="mt-3" />
      )}

      {running && progress && progress.worldsTotal > 0 && (
        <div className="mt-3 rounded-md border border-border bg-card/70 px-3 py-2">
          <div className="h-1.5 w-full overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {progress.worldsDone} / {progress.worldsTotal} worlds · replicate {Math.min(progress.runsDone + 1, progress.runsTotal)} of{" "}
            {progress.runsTotal} · {etaMs == null ? "estimating…" : `~${formatEta(etaMs)} left`}
          </p>
        </div>
      )}


      <div className="mt-5 rounded-md border border-border bg-card/70 p-4">
        <h2 className="mb-3 font-mono text-sm text-foreground">
          Coordination rate by {isClauseSweep ? "persistence clause" : "persistence"}
        </h2>
        <DoseResponseChart data={points} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Points pool every world across all replicates. Error bars are 95% Wilson score intervals.
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-card/70 font-mono uppercase tracking-widest text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{isClauseSweep ? "Clause" : "Persistence"}</th>
              <th className="px-3 py-2">Replicates</th>
              <th className="px-3 py-2">Worlds</th>
              <th className="px-3 py-2">Coordination (95% CI)</th>
              <th className="px-3 py-2">Empty submissions</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map((p) => (
              <Fragment key={p.persistence}>
                <tr className="bg-background/40">
                  <td className="px-3 py-2 font-mono text-primary">
                    {isClauseSweep ? (clauseNames[p.persistence] ?? String(p.persistence)) : p.persistence.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-mono">{p.replicates.length}</td>
                  <td className="px-3 py-2 font-mono">{p.worlds}</td>
                  <td className="px-3 py-2 font-mono text-primary">
                    {p.crossed}/{p.worlds}
                    <span className="ml-1 text-muted-foreground">
                      [{p.low.toFixed(2)}–{p.high.toFixed(2)}]
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{Math.round(p.empty_submission_rate * 100)}%</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setOpen(open === p.persistence ? null : p.persistence)}
                      className="font-mono uppercase tracking-widest text-primary hover:underline"
                    >
                      {open === p.persistence ? "Hide" : "Replicates"}
                    </button>
                  </td>
                </tr>
                {open === p.persistence &&
                  p.replicates.map((r) => (
                    <tr key={r.runId} className="bg-card/40">
                      <td className="px-3 py-1.5 pl-6 font-mono text-muted-foreground">#{r.replicateIndex + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">seed {r.replicateSeed ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{r.worlds}</td>
                      <td className="px-3 py-1.5 font-mono">
                        {r.crossed}/{r.worlds} ({Math.round(r.rate * 100)}%)
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{r.status}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Link
                          to="/run/$runId"
                          params={{ runId: r.runId }}
                          className="font-mono uppercase tracking-widest text-primary hover:underline"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
