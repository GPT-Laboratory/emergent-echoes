import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useEffect, useState } from "react";

import { isProvisional, ProvisionalBadge, RunHeader, type RunRow } from "@/components/lab/RunHeader";
import { Button } from "@/components/ui/button";
import {
  downloadPromptsAppendix,
  downloadRunJson,
  downloadSweepJson,
  runFileNameFromConfig,
  sweepFileNameFromConfig,
} from "@/lib/export-client";
import { exportExperiment, exportRun } from "@/lib/lab.functions";

import { supabase } from "@/integrations/supabase/client";
import { AGENT_MODEL_ID, DEFAULT_CONFIG, formatDuration, type LabConfig } from "@/lib/lab-types";
import { buildPromptsAppendix } from "@/lib/prompt-spec";
import { wilson } from "@/lib/stats";

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
  worldsDone: number;
  emerged: number;
  excluded: number;
};

/** At-a-glance state: live runs show world progress, finished runs their duration. */
function StatusChip({ run }: { run: Row }) {
  const running = run.status === "running";
  return (
    <span
      className={[
        "ml-2 inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest",
        running
          ? "border-warning/50 bg-warning/10 text-warning"
          : run.status === "complete"
            ? "border-primary/60 bg-primary/15 text-primary"
            : "border-border bg-muted/40 text-muted-foreground",
      ].join(" ")}
    >
      {running ? (
        <>
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
          running {run.worldsDone}/{run.worlds + run.excluded}
        </>
      ) : run.status === "complete" ? (
        <>✓ complete{run.duration_ms != null ? ` · ${formatDuration(run.duration_ms)}` : ""}</>
      ) : (
        run.status
      )}
    </span>
  );
}

type GroupItem =
  | {
      kind: "experiment";
      experimentId: string;
      runs: number;
      mode: string;
      startedAt: string;
      config: LabConfig | null;
    }
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
        startedAt: children[children.length - 1]?.started_at ?? children[children.length - 1]?.created_at ?? "",
        config: children[0]?.config ?? null,
      });
      for (const child of rows.filter((x) => x.experiment_id === exp)) out.push({ kind: "run", run: child });
    } else if (!exp) {
      out.push({ kind: "run", run: r });
    }
  }
  return out;
}

/** Runs are listed under a header for the worker model they were run with. */
function byModel(rows: Row[]): Array<{ model: string; rows: Row[] }> {
  const out: Array<{ model: string; rows: Row[] }> = [];
  for (const r of rows) {
    const model = r.config?.agentModel ?? AGENT_MODEL_ID;
    const bucket = out.find((b) => b.model === model);
    if (bucket) bucket.rows.push(r);
    else out.push({ model, rows: [r] });
  }
  return out;
}

function rateWithCi(emerged: number, worlds: number, excluded = 0): string {
  if (!worlds) return "—";
  const w = wilson(emerged, worlds);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return `${pct(w.rate)} (${emerged}/${worlds} valid worlds, ${excluded} excluded) [${pct(w.low)}–${pct(w.high)}]`;
}

function Runs() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
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

  /** Collect the whole ladder in one go: one JSON file per completed run. */
  const downloadAll = async () => {
    const done = rows.filter((r) => r.status === "complete" || r.status === "stopped");
    for (let i = 0; i < done.length; i++) {
      const r = done[i]!;
      setBulk(`${i + 1}/${done.length}`);
      try {
        const doc = await doExport({ data: { runId: r.id } });
        downloadRunJson(r.id, doc);
      } catch {
        /* one bad run must not abort the collection */
      }
      await new Promise((res) => setTimeout(res, 400));
    }
    setBulk(null);
  };

  useEffect(() => {
    void (async () => {
      const { data: runs } = await supabase
        .from("runs")
        .select("id,created_at,label,status,config,started_at,finished_at,duration_ms,experiment_id,sweep_value")
        .order("created_at", { ascending: false })
        .limit(50);
      const { data: worlds } = await supabase
        .from("worlds")
        .select("run_id,status,cross_agent_read,solicit_write,invalidated");
      setRows(
        (runs ?? []).map((r) => {
          const all = (worlds ?? []).filter((w) => w.run_id === r.id);
          // Coordination propensity is computed over valid worlds only.
          const ws = all.filter((w) => !w.invalidated);
          return {
            ...r,
            config: r.config as LabConfig,
            worlds: ws.length,
            excluded: all.length - ws.length,
            worldsDone: all.filter((w) => w.status !== "running").length,
            emerged: ws.filter((w) => w.cross_agent_read || w.solicit_write).length,
          };
        }),
      );
    })();
  }, []);

  return (
    <main className="mx-auto max-w-[1200px] px-5 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Run archive</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Grouped by worker model. Includes runs where no coordination emerged.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={bulk != null || rows.length === 0}
          onClick={() => void downloadAll()}
          className="font-mono text-xs uppercase tracking-widest"
        >
          {bulk ? `Downloading ${bulk}…` : "Download all"}
        </Button>
      </div>


      <div className="mt-5 overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-xs">
          <thead className="bg-card/70 font-mono uppercase tracking-widest text-[10px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Run</th>
              <th className="px-3 py-2">Started</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Persistence</th>
              <th className="px-3 py-2">Rep × worlds</th>
              <th className="px-3 py-2">Coordination (95% CI)</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No runs recorded yet.
                </td>
              </tr>
            )}
            {byModel(rows).map((group) => (
              <Fragment key={`model-${group.model}`}>
                <tr className="bg-primary/10">
                  <td colSpan={9} className="px-3 py-2 font-mono text-primary">
                    {group.model}
                    <span className="ml-2 text-muted-foreground">{group.rows.length} run(s)</span>
                  </td>
                </tr>
                {groupRows(group.rows).map((item) =>
                  item.kind === "experiment" ? (
                    <tr key={`exp-${item.experimentId}`} className="bg-card/60">
                      <td colSpan={8} className="px-3 py-2 font-mono text-primary">
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
                            className="font-mono text-[10px] lowercase tracking-normal"
                          >
                            {busy === item.experimentId
                              ? "Building…"
                              : sweepFileNameFromConfig(item.startedAt, item.mode, item.config, group.model)}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <Fragment key={item.run.id}>
                    <tr className="bg-background/40">
                      <td className="px-3 py-2 font-mono">
                        <button
                          type="button"
                          onClick={() => setOpenRow(openRow === item.run.id ? null : item.run.id)}
                          className="mr-2 text-muted-foreground hover:text-primary"
                          aria-label="Show full run header"
                        >
                          {openRow === item.run.id ? "▾" : "▸"}
                        </button>
                        {new Date(item.run.created_at).toLocaleString()}
                        <StatusChip run={item.run} />
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {new Date(item.run.started_at ?? item.run.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {item.run.duration_ms != null ? formatDuration(item.run.duration_ms) : "—"}
                      </td>
                      <td className="px-3 py-2 font-mono text-primary">{item.run.config?.taskMode ?? "assisted"}</td>
                      <td className="px-3 py-2 font-mono">
                        {Math.round((item.run.config?.persistence ?? 0) * 100)}%
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {item.run.config?.replicates ?? 1} × {item.run.config?.worldCount ?? item.run.worlds}
                      </td>
                      <td
                        className={[
                          "px-3 py-2 font-mono",
                          isProvisional(item.run.status) ? "text-muted-foreground/70" : "text-primary",
                        ].join(" ")}
                      >
                        {rateWithCi(item.run.emerged, item.run.worlds, item.run.excluded)}
                        {isProvisional(item.run.status) && (
                          <div className="mt-1">
                            <ProvisionalBadge status={item.run.status} />
                          </div>
                        )}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-muted-foreground" title={item.run.config?.runNote ?? ""}>
                        {item.run.config?.runNote || "—"}
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
                            className="font-mono text-[10px] lowercase tracking-normal"
                          >
                            {busy === item.run.id
                              ? "Building…"
                              : runFileNameFromConfig(
                                  item.run.started_at ?? item.run.created_at,
                                  item.run.config,
                                  item.run.config?.agentModel ?? AGENT_MODEL_ID,
                                )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                    {openRow === item.run.id && (
                      <tr className="bg-background/60">
                        <td colSpan={9} className="px-3 py-2">
                          <RunHeader run={item.run as unknown as RunRow} />
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const cfg = { ...DEFAULT_CONFIG, ...(item.run.config ?? {}) } as LabConfig;
                              downloadPromptsAppendix(
                                buildPromptsAppendix(cfg, {
                                  runId: item.run.id,
                                  startedAt: item.run.started_at ?? item.run.created_at,
                                  label: cfg.runNote,
                                }),
                                item.run.started_at ?? item.run.created_at,
                                cfg,
                              );
                            }}
                            className="mt-2 font-mono text-[10px] lowercase tracking-normal"
                          >
                            Prompt appendix (.md)
                          </Button>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  ),
                )}
              </Fragment>
            ))}
          </tbody>

        </table>
      </div>
    </main>
  );
}
