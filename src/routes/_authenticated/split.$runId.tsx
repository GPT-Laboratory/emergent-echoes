import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useWorlds } from "@/lib/lab-client";
import { WorldStage } from "./broadcast.$runId";
import { RoomsWorld, TopBar } from "./rooms.$runId";

export const Route = createFileRoute("/_authenticated/split/$runId")({
  head: () => ({
    meta: [
      { title: "Split view — Emergent Agent Coordination Lab" },
      { name: "description", content: "Broadcast terminals and Rooms animation side by side for the same world." },
      { property: "og:title", content: "Split view — Emergent Agent Coordination Lab" },
      { property: "og:description", content: "Terminal text and spatial animation of one world, side by side." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SplitRoute,
});

function SplitRoute() {
  const { runId: param } = Route.useParams();
  const [runId, setRunId] = useState<string | null>(param === "latest" ? null : param);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (param !== "latest") return setRunId(param);
    void supabase
      .from("runs")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setRunId(data?.id ?? null));
  }, [param]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = () =>
      void supabase
        .from("runs")
        .select("status")
        .eq("id", runId)
        .maybeSingle()
        .then(({ data }) => !cancelled && setStatus(data?.status ?? null));
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId]);

  const worlds = useWorlds(runId);
  const [worldIdx, setWorldIdx] = useState<number | null>(null);
  useEffect(() => {
    if (worldIdx == null && worlds.length)
      setWorldIdx(worlds.find((w) => w.cross_agent_read)?.index ?? worlds[0]!.index);
  }, [worlds, worldIdx]);
  const world = worlds.find((w) => w.index === worldIdx) ?? null;

  return (
    <main className="w-full px-4 py-4">
      <TopBar runId={runId} current="split" />
      <div className="my-3 flex items-center gap-3 px-4 font-mono text-xs uppercase tracking-widest">
        <span className="text-foreground">World</span>
        <select
          className="rounded border border-border bg-card px-2 py-1 text-foreground"
          value={worldIdx ?? ""}
          onChange={(e) => setWorldIdx(Number(e.target.value))}
        >
          {worlds.map((w) => (
            <option key={w.id} value={w.index}>
              world {w.index}
              {w.cross_agent_read ? " · cross-read" : ""}
            </option>
          ))}
        </select>
      </div>
      {world ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex h-[80vh] min-h-0 flex-col overflow-hidden rounded-md border border-border bg-background">
            <WorldStage key={world.id} worldId={world.id} worldIndex={world.index} live={status === "running"} />
          </div>
          <div className="h-[80vh] overflow-hidden">
            <RoomsWorld
              key={world.id}
              worldId={world.id}
              worlds={worlds.map((w) => w.index)}
              worldIdx={world.index}
              onWorld={setWorldIdx}
            />
          </div>
        </div>
      ) : (
        <p className="px-4 font-mono text-sm text-muted-foreground">loading run…</p>
      )}
    </main>
  );
}
