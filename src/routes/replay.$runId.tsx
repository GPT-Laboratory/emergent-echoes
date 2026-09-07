import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentPanel } from "@/components/lab/AgentPanel";
import { ScratchStore } from "@/components/lab/ScratchStore";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { AgentRow, ScratchRow, StepRow, WorldRow } from "@/lib/lab-client";

export const Route = createFileRoute("/replay/$runId")({
  head: () => ({
    meta: [
      { title: "Replay — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Step through a recording of a real prior run, exactly as the agents played it out.",
      },
      { property: "og:title", content: "Replay — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "A frame-by-frame recording of a recorded agent coordination run.",
      },
    ],
  }),
  component: Replay,
});

function Replay() {
  const { runId } = Route.useParams();
  const [worlds, setWorlds] = useState<WorldRow[]>([]);
  const [worldId, setWorldId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [scratch, setScratch] = useState<ScratchRow[]>([]);
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("worlds").select("*").eq("run_id", runId).order("index");
      const ws = (data ?? []) as WorldRow[];
      setWorlds(ws);
      setWorldId((prev) => prev ?? ws.find((w) => w.cross_agent_read)?.id ?? ws[0]?.id ?? null);
    })();
  }, [runId]);

  useEffect(() => {
    if (!worldId) return;
    setPlaying(false);
    setCursor(0);
    void (async () => {
      const [a, s, c] = await Promise.all([
        supabase.from("agents").select("*").eq("world_id", worldId).order("index"),
        supabase.from("steps").select("*").eq("world_id", worldId).order("created_at"),
        supabase.from("scratch").select("*").eq("world_id", worldId).order("created_at"),
      ]);
      setAgents((a.data ?? []) as AgentRow[]);
      setSteps((s.data ?? []) as StepRow[]);
      setScratch((c.data ?? []) as ScratchRow[]);
    })();
  }, [worldId]);

  useEffect(() => {
    if (!playing) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => {
      setCursor((c) => {
        if (c >= steps.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 700);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, steps.length]);

  const visibleSteps = useMemo(() => steps.slice(0, cursor), [steps, cursor]);
  const visibleScratch = useMemo(() => {
    const cutoff = visibleSteps[visibleSteps.length - 1]?.created_at;
    if (!cutoff) return [];
    return scratch.filter((s) => s.created_at <= cutoff);
  }, [scratch, visibleSteps]);

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link
          to="/runs"
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          ← Archive
        </Link>
        <span className="rounded-sm bg-warning/15 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-warning">
          Replay · recording of a real prior run
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-card/70 p-3">
        <select
          value={worldId ?? ""}
          onChange={(e) => setWorldId(e.target.value)}
          className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
        >
          {worlds.map((w) => (
            <option key={w.id} value={w.id}>
              World {String(w.index).padStart(2, "0")}
              {w.cross_agent_read ? " · coordination emerged" : ""}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          className="font-mono text-xs uppercase tracking-widest"
          onClick={() => setPlaying((p) => !p)}
          disabled={!steps.length}
        >
          {playing ? "Pause" : "Play"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="font-mono text-xs uppercase tracking-widest"
          onClick={() => {
            setPlaying(false);
            setCursor(0);
          }}
        >
          Restart
        </Button>
        <input
          type="range"
          min={0}
          max={steps.length}
          value={cursor}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
          className="h-1 flex-1 accent-[var(--primary)]"
        />
        <span className="font-mono text-xs text-muted-foreground">
          {cursor}/{steps.length}
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <AgentPanel key={a.id} agent={a} steps={visibleSteps} />
          ))}
        </div>
        <ScratchStore scratch={visibleScratch} agents={agents} />
      </div>
    </main>
  );
}
