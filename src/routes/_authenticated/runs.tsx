import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadRunJson, downloadSweepJson } from "@/lib/export-client";
import { exportExperiment, exportRun } from "@/lib/lab.functions";

import { supabase } from "@/integrations/supabase/client";
import { formatDuration, type LabConfig } from "@/lib/lab-types";

export const Route = createFileRoute("/_authenticated/runs")({
  head: () => ({
    meta: [
      { title: "Run archive — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Every recorded run with its pressure settings and how often coordination emerged.",
      },
      { property: "og:title", content: "Run archive — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "Browse and replay recorded runs of the agent coordination experiment.",
      },
    ],
  }),
  component: Runs,
});

type Row = {
  id: string;
  created_at: string;
  label: string | null;
  status: string;
  config: LabConfig;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  experiment_id: string | null;
  sweep_value: number | null;
  worlds: number;
  emerged: number;
};

type GroupItem =
  | { kind: "experiment"; experimentId: string; runs: number; mode: string }
  | { kind: "run"; run: Row };

/** Sweep runs are listed under a header row for their parent experiment. */
function groupRows(rows: Row[]): GroupItem[] {
  const out: GroupItem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const exp = r.experiment_id;
    if (exp && !seen.has(exp)) {
      seen.add(exp);
      const children = rows.filter((x) => x.experiment_id === exp);
      out.push({
        kind: "experiment",
        experimentId: exp,
        runs: children.length,
        mode: children[0]?.config?.taskMode ?? "assisted",
      });
      for (const child of rows.filter((x) => x.experiment_id === exp)) out.push({ kind: "run", run: child });
    } else if (!exp) {
      out.push({ kind: "run", run: r });
    }
  }
  return out;
}

function Runs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const doExport = useServerFn(exportRun);
  const doExportSweep = useServerFn(exportExperiment);

  const downloadSweep = async (experimentId: string) => {
    setBusy(experimentId);
    try {
      const doc = await doExportSweep({ data: { experimentId } });
      downloadSweepJson(experimentId, doc);
    } finally {
      setBusy(null);
    }
  };

  const download = async (runId: string) => {
    setBusy(runId);
    try {
      const doc = await doExport({ data: { runId } });
      downloadRunJson(runId, doc);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void (async () => {
      const { data: runs } = await supabase
        .from("runs")
        .select("id,created_at,label,status,config,started_at,finished_at,duration_ms,experiment_id,sweep_value")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data: worlds } = await supabase.from("worlds").select("run_id,cross_agent_read,solicit_write");
      setRows(
        (runs ?? []).map((r) => {
          const ws = (worlds ?? []).filter((w) => w.run_id === r.id);
          return {
            ...r,
            config: r.config as LabConfig,
            worlds: ws.length,
            emerged: ws.filter((w) => w.cross_agent_read || w.solicit_write).length,
          };
        }),
      );
    })();
  }, []);

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6">
      <h1 className="text-lg font-semibold text-foreground">Run archive</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Recorded outcomes, including runs where no coordination emerged.
      </p>

      <div className="mt-5 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-card/70 font-mono uppercase tracking-widest text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Difficulty</th>
              <th className="px-3 py-2">Reasoning</th>
              <th className="px-3 py-2">Persistence</th>
              <th className="px-3 py-2">Worlds</th>
              <th className="px-3 py-2">Emergence</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-muted-foreground">
                  No runs recorded yet.
                </td>
              </tr>
            )}
            {groupRows(rows).map((item) =>
              item.kind === "experiment" ? (
                <tr key={`exp-${item.experimentId}`} className="bg-card/60">
                  <td colSpan={9} className="px-3 py-2 font-mono text-primary">
                    Persistence sweep {item.experimentId.slice(0, 8)}
                    <span className="ml-2 text-muted-foreground">
                      {item.mode} · {item.runs} points
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        to="/experiment/$experimentId"
                        params={{ experimentId: item.experimentId }}
                        className="font-mono uppercase tracking-widest text-primary hover:underline"
                      >
                        Open sweep
                      </Link>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy === item.experimentId}
                        onClick={() => void downloadSweep(item.experimentId)}
                        className="font-mono text-[10px] uppercase tracking-widest"
                      >
                        {busy === item.experimentId ? "Building…" : "Download sweep"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : (
              <tr key={item.run.id} className="bg-background/40">
                <td className="px-3 py-2 font-mono">
                  {new Date(item.run.created_at).toLocaleString()}
                  <span className="ml-2 text-muted-foreground">{item.run.status}</span>
                </td>
                <td className="px-3 py-2 font-mono">
                  {new Date(item.run.started_at ?? item.run.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono">
                  {item.run.duration_ms != null ? formatDuration(item.run.duration_ms) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-primary">{item.run.config?.taskMode ?? "assisted"}</td>
                <td className="px-3 py-2 font-mono">{Math.round((item.run.config?.difficulty ?? 0) * 100)}%</td>
                <td className="px-3 py-2 font-mono">{item.run.config?.reasoningBudget ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{Math.round((item.run.config?.persistence ?? 0) * 100)}%</td>
                <td className="px-3 py-2 font-mono">{item.run.worlds}</td>
                <td className="px-3 py-2 font-mono text-primary">
                  {item.run.worlds ? Math.round((item.run.emerged / item.run.worlds) * 100) : 0}%
                  <span className="ml-1 text-muted-foreground">
                    ({item.run.emerged}/{item.run.worlds})
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to="/run/$runId"
                      params={{ runId: item.run.id }}
                      className="font-mono uppercase tracking-widest text-primary hover:underline"
                    >
                      Open
                    </Link>
                    <Link
                      to="/replay/$runId"
                      params={{ runId: item.run.id }}
                      className="font-mono uppercase tracking-widest text-primary hover:underline"
                    >
                      Replay
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === item.run.id}
                      onClick={() => void download(item.run.id)}
                      className="font-mono text-[10px] uppercase tracking-widest"
                    >
                      {busy === item.run.id ? "Building…" : "Download JSON"}
                    </Button>
                  </div>
                </td>
              </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
