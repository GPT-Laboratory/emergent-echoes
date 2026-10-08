import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/picker")({
  head: () => ({
    meta: [
      { title: "Filming picker — Runaway Agents" },
      { name: "description", content: "Find the liveliest coordinating worlds to replay on camera." },
      { property: "og:title", content: "Filming picker — Runaway Agents" },
      { property: "og:description", content: "Find the liveliest coordinating worlds to replay on camera." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PickerPage,
});

type Row = { runId: string; worldIndex: number; reads: number; writes: number; total: number; model: string; created: string };

function PickerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: worlds } = await supabase
        .from("worlds")
        .select("id,run_id,index,created_at")
        .neq("status", "running")
        .eq("invalidated", false)
        .eq("cross_agent_read", true)
        .limit(1000);
      if (!worlds?.length) {
        if (!cancelled) setRows([]);
        return;
      }
      const runIds = [...new Set(worlds.map((w) => w.run_id))];
      const { data: runs } = await supabase.from("runs").select("id,config").in("id", runIds);
      const modelOf = new Map((runs ?? []).map((r) => [r.id, String((r.config as { agentModel?: string })?.agentModel ?? "—")]));
      const counts = new Map<string, { reads: number; writes: number; total: number }>();
      const ids = worlds.map((w) => w.id);
      for (let i = 0; i < ids.length; i += 50) {
        let from = 0;
        for (;;) {
          const { data: steps } = await supabase
            .from("steps")
            .select("world_id,action")
            .in("world_id", ids.slice(i, i + 50))
            .range(from, from + 999);
          if (!steps?.length) break;
          for (const s of steps) {
            const c = counts.get(s.world_id) ?? { reads: 0, writes: 0, total: 0 };
            const tool = (s.action as { tool?: string })?.tool;
            c.total++;
            if (tool === "read") c.reads++;
            if (tool === "write") c.writes++;
            counts.set(s.world_id, c);
          }
          if (steps.length < 1000) break;
          from += 1000;
        }
      }
      const out = worlds.map((w) => ({
        runId: w.run_id,
        worldIndex: w.index,
        model: modelOf.get(w.run_id) ?? "—",
        created: w.created_at,
        ...(counts.get(w.id) ?? { reads: 0, writes: 0, total: 0 }),
      }));
      out.sort((a, b) => b.reads - a.reads || b.writes - a.writes || b.created.localeCompare(a.created));
      if (!cancelled) setRows(out);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-foreground">Filming picker</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Finished, valid worlds where coordination emerged, ranked by reads then writes. Open Rooms and select the world shown.
      </p>
      {rows == null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No qualifying worlds yet.</p>
      ) : (
        <table className="w-full font-mono text-sm">
          <thead className="text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2">Run</th>
              <th>World</th>
              <th className="text-right">Reads</th>
              <th className="text-right">Writes</th>
              <th className="text-right">Steps</th>
              <th className="pl-4">Model</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.runId}-${r.worldIndex}`} className="border-b border-border/50 text-foreground">
                <td className="py-1.5">{r.runId.slice(0, 8)}</td>
                <td>World {r.worldIndex}</td>
                <td className="text-right">{r.reads}</td>
                <td className="text-right">{r.writes}</td>
                <td className="text-right">{r.total}</td>
                <td className="pl-4 text-muted-foreground">{r.model}</td>
                <td className="text-right">
                  <Link to="/rooms/$runId" params={{ runId: r.runId }} className="text-primary hover:underline">
                    Rooms →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
