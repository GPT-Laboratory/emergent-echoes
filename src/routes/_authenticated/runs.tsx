import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { downloadRunJson } from "@/lib/export-client";
import { exportRun } from "@/lib/lab.functions";

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
  worlds: number;
  emerged: number;
};

function Runs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const doExport = useServerFn(exportRun);

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
        .select("id,created_at,label,status,config,started_at,finished_at,duration_ms")
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
            {rows.map((r) => (
              <tr key={r.id} className="bg-background/40">
                <td className="px-3 py-2 font-mono">
                  {new Date(r.created_at).toLocaleString()}
                  <span className="ml-2 text-muted-foreground">{r.status}</span>
                </td>
                <td className="px-3 py-2 font-mono">
                  {new Date(r.started_at ?? r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono">
                  {r.duration_ms != null ? formatDuration(r.duration_ms) : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-primary">{r.config?.taskMode ?? "assisted"}</td>
                <td className="px-3 py-2 font-mono">{Math.round((r.config?.difficulty ?? 0) * 100)}%</td>
                <td className="px-3 py-2 font-mono">{r.config?.reasoningBudget ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{Math.round((r.config?.persistence ?? 0) * 100)}%</td>
                <td className="px-3 py-2 font-mono">{r.worlds}</td>
                <td className="px-3 py-2 font-mono text-primary">
                  {r.worlds ? Math.round((r.emerged / r.worlds) * 100) : 0}%
                  <span className="ml-1 text-muted-foreground">
                    ({r.emerged}/{r.worlds})
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to="/run/$runId"
                      params={{ runId: r.id }}
                      className="font-mono uppercase tracking-widest text-primary hover:underline"
                    >
                      Open
                    </Link>
                    <Link
                      to="/replay/$runId"
                      params={{ runId: r.id }}
                      className="font-mono uppercase tracking-widest text-primary hover:underline"
                    >
                      Replay
                    </Link>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === r.id}
                      onClick={() => void download(r.id)}
                      className="font-mono text-[10px] uppercase tracking-widest"
                    >
                      {busy === r.id ? "Building…" : "Download JSON"}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
