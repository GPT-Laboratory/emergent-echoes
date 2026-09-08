import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { DoseResponseChart, type DosePoint } from "@/components/lab/DoseResponseChart";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { downloadSweepJson } from "@/lib/export-client";
import { exportExperiment } from "@/lib/lab.functions";
import { formatDuration } from "@/lib/lab-types";

export const Route = createFileRoute("/_authenticated/experiment/$experimentId")({
  head: () => ({
    meta: [
      { title: "Persistence sweep — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Dose-response curve of coordination emergence against agent persistence.",
      },
      { property: "og:title", content: "Persistence sweep — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "How often coordination emerges as agent persistence is turned up, point by point.",
      },
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
  sweep_points: number[];
};

type PointRow = DosePoint & {
  runId: string;
  status: string;
  worlds: number;
  crossed: number;
};

function ExperimentDetail() {
  const { experimentId } = Route.useParams();
  const [exp, setExp] = useState<Exp | null>(null);
  const [points, setPoints] = useState<PointRow[]>([]);
  const [busy, setBusy] = useState(false);
  const doExport = useServerFn(exportExperiment);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: e } = await supabase.from("experiments").select("*").eq("id", experimentId).maybeSingle();
      const { data: runs } = await supabase
        .from("runs")
        .select("id,status,sweep_value")
        .eq("experiment_id", experimentId)
        .order("sweep_value");
      const runIds = (runs ?? []).map((r) => r.id);
      const { data: worlds } = runIds.length
        ? await supabase.from("worlds").select("id,run_id,cross_agent_read").in("run_id", runIds)
        : { data: [] };
      const worldIds = (worlds ?? []).map((w) => w.id);
      const { data: agents } = worldIds.length
        ? await supabase.from("agents").select("world_id,answer,task").in("world_id", worldIds)
        : { data: [] };
      if (cancelled) return;

      const runOfWorld = new Map((worlds ?? []).map((w) => [w.id as string, w.run_id as string]));
      setExp(e ? ({ ...e, sweep_points: (e.sweep_points ?? []) as number[] } as Exp) : null);
      setPoints(
        (runs ?? []).map((r) => {
          const ws = (worlds ?? []).filter((w) => w.run_id === r.id);
          const crossed = ws.filter((w) => w.cross_agent_read).length;
          const as = (agents ?? []).filter((a) => runOfWorld.get(a.world_id as string) === r.id);
          const inter = as.filter(
            (a) => ((a.task as { interdependency?: { group_id?: string | null } } | null)?.interdependency?.group_id ?? null) != null,
          );
          const empty = inter.filter((a) => !String(a.answer ?? "").trim()).length;
          return {
            runId: r.id as string,
            status: r.status as string,
            persistence: Number(r.sweep_value ?? 0),
            worlds: ws.length,
            crossed,
            coordination_rate: ws.length ? crossed / ws.length : 0,
            empty_submission_rate: inter.length ? empty / inter.length : 0,
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

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Persistence sweep</h1>
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
            {exp
              ? `${exp.task_mode} · ${exp.status} · started ${new Date(exp.started_at).toLocaleString()}${
                  exp.duration_ms != null ? ` · ${formatDuration(exp.duration_ms)}` : ""
                }`
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

      <div className="mt-5 rounded-md border border-border bg-card/70 p-4">
        <h2 className="mb-3 font-mono text-sm text-foreground">Coordination rate by persistence</h2>
        <DoseResponseChart data={points} />
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-card/70 font-mono uppercase tracking-widest text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Persistence</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Worlds</th>
              <th className="px-3 py-2">Coordination</th>
              <th className="px-3 py-2">Empty submissions</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {points.map((p) => (
              <tr key={p.runId} className="bg-background/40">
                <td className="px-3 py-2 font-mono text-primary">{p.persistence.toFixed(2)}</td>
                <td className="px-3 py-2 font-mono">{p.status}</td>
                <td className="px-3 py-2 font-mono">{p.worlds}</td>
                <td className="px-3 py-2 font-mono text-primary">
                  {Math.round(p.coordination_rate * 100)}%
                  <span className="ml-1 text-muted-foreground">
                    ({p.crossed}/{p.worlds})
                  </span>
                </td>
                <td className="px-3 py-2 font-mono">{Math.round(p.empty_submission_rate * 100)}%</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to="/run/$runId"
                    params={{ runId: p.runId }}
                    className="font-mono uppercase tracking-widest text-primary hover:underline"
                  >
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
