import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useWorldDetail, useWorlds, type StepRow } from "@/lib/lab-client";

export const Route = createFileRoute("/_authenticated/rooms/$runId")({
  head: () => ({
    meta: [
      { title: "Rooms — Emergent Agent Coordination Lab" },
      { name: "description", content: "Spatial view: agents in separate rooms walking to a shared whiteboard to read and write." },
      { property: "og:title", content: "Rooms — Emergent Agent Coordination Lab" },
      { property: "og:description", content: "Watch agents visit the shared store as animated figures." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RoomsRoute,
});

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const BASE_MS = 1600;
const ROOM_POS = [
  { x: 15, y: 18 },
  { x: 85, y: 18 },
  { x: 85, y: 82 },
  { x: 15, y: 82 },
  { x: 50, y: 10 },
  { x: 50, y: 90 },
  { x: 8, y: 50 },
  { x: 92, y: 50 },
];

function trunc(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function RoomsRoute() {
  const { runId: param } = Route.useParams();
  const [runId, setRunId] = useState<string | null>(param === "latest" ? null : param);

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

  const worlds = useWorlds(runId);
  const [worldIdx, setWorldIdx] = useState<number | null>(null);
  useEffect(() => {
    if (worldIdx == null && worlds.length)
      setWorldIdx(worlds.find((w) => w.cross_agent_read)?.index ?? worlds[0]!.index);
  }, [worlds, worldIdx]);
  const world = worlds.find((w) => w.index === worldIdx) ?? null;

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      {world ? (
        <RoomsWorld
          key={world.id}
          worldId={world.id}
          worlds={worlds.map((w) => w.index)}
          worldIdx={world.index}
          onWorld={setWorldIdx}
        />
      ) : (
        <p className="font-mono text-sm text-muted-foreground">loading run…</p>
      )}
    </main>
  );
}

function RoomsWorld({
  worldId,
  worlds,
  worldIdx,
  onWorld,
}: {
  worldId: string;
  worlds: number[];
  worldIdx: number;
  onWorld: (i: number) => void;
}) {
  const { agents, steps } = useWorldDetail(worldId);
  const events = useMemo(
    () =>
      [...steps]
        .filter((s) => s.action?.["tool"] === "read" || s.action?.["tool"] === "write")
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [steps],
  );
  const letterOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of agents) m[a.id] = LETTERS[a.index] ?? String(a.index);
    return m;
  }, [agents]);
  const posOf = (agentId: string) => {
    const a = agents.find((x) => x.id === agentId);
    return ROOM_POS[(a?.index ?? 0) % ROOM_POS.length]!;
  };

  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const dur = BASE_MS / speed;

  useEffect(() => {
    if (!playing || cursor >= events.length) return;
    const id = setTimeout(() => setCursor((c) => c + 1), dur);
    return () => clearTimeout(id);
  }, [playing, cursor, events.length, dur]);

  const current: StepRow | null = cursor > 0 ? (events[cursor - 1] ?? null) : null;
  const board = useMemo(() => {
    const m = new Map<string, { value: string; letter: string }>();
    for (const e of events.slice(0, cursor)) {
      if (e.action["tool"] === "write")
        m.set(String(e.action["key"] ?? ""), {
          value: String(e.action["value"] ?? ""),
          letter: letterOf[e.agent_id] ?? "?",
        });
    }
    return [...m.entries()].slice(-8);
  }, [events, cursor, letterOf]);

  // figure position: at board during first half of the event, then back home
  const [atBoard, setAtBoard] = useState(false);
  useEffect(() => {
    if (!current) return;
    setAtBoard(true);
    const id = setTimeout(() => setAtBoard(false), dur * 0.7);
    return () => clearTimeout(id);
  }, [current, dur]);
  const curKey = current ? String(current.action["key"] ?? "") : null;
  const curTool = current ? String(current.action["tool"]) : null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-widest">
        <span className="text-foreground">Rooms · world {String(worldIdx).padStart(2, "0")}</span>
        <select
          className="rounded border border-border bg-card px-2 py-1 text-foreground"
          value={worldIdx}
          onChange={(e) => onWorld(Number(e.target.value))}
        >
          {worlds.map((i) => (
            <option key={i} value={i}>
              world {i}
            </option>
          ))}
        </select>
        <button className="rounded border border-border px-3 py-1 hover:text-primary" onClick={() => setPlaying((p) => !p)}>
          {playing ? "Pause" : "Play"}
        </button>
        <button className="rounded border border-border px-3 py-1 hover:text-primary" onClick={() => setCursor(0)}>
          Restart
        </button>
        <Slider
          className="w-40"
          min={0.25}
          max={4}
          step={0.05}
          value={[speed]}
          onValueChange={(v) => setSpeed(v[0] ?? 1)}
        />
        <span className="w-12 text-primary">×{Number(speed.toFixed(2))}</span>
        <span className="text-muted-foreground">
          event {cursor}/{events.length}
        </span>
      </div>

      <div className="relative h-[75vh] min-h-[520px] overflow-hidden rounded-md border border-border bg-card/40">
        {agents.map((a) => {
          const p = ROOM_POS[a.index % ROOM_POS.length]!;
          return (
            <div
              key={a.id}
              className="absolute h-[26%] w-[24%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-border bg-background/60 p-2"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            >
              <span className="label-caps">Room {LETTERS[a.index]}</span>
            </div>
          );
        })}

        <div className="absolute left-1/2 top-1/2 w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-primary/60 bg-background p-3">
          <div className="label-caps mb-2">Shared whiteboard</div>
          {board.length === 0 && <p className="font-mono text-xs text-muted-foreground">empty</p>}
          <ul className="space-y-1">
            {board.map(([k, v]) => (
              <li
                key={k}
                className={`rounded px-2 py-1 font-mono text-xs transition-colors duration-500 ${
                  k === curKey ? (curTool === "read" ? "bg-warning/25" : "bg-primary/25") : ""
                }`}
              >
                <span className="text-primary">{k}</span>
                <span className="text-muted-foreground"> ({v.letter}) </span>
                <span className="text-foreground">{trunc(v.value, 70)}</span>
              </li>
            ))}
          </ul>
        </div>

        {agents.map((a) => {
          const home = posOf(a.id);
          const moving = atBoard && current?.agent_id === a.id;
          const x = moving ? 50 : home.x;
          const y = moving ? 50 : home.y;
          return (
            <div
              key={a.id}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
              style={{ left: `${x}%`, top: `${y}%`, transition: `left ${dur * 0.3}ms ease-in-out, top ${dur * 0.3}ms ease-in-out` }}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 font-mono text-sm font-bold ${
                  moving ? (curTool === "read" ? "border-warning text-warning" : "border-primary text-primary") : "border-foreground/60 text-foreground"
                } bg-background`}
              >
                {letterOf[a.id]}
              </div>
              <span className="mt-1 font-mono text-[11px] text-foreground">Agent {letterOf[a.id]}</span>
              {moving && (
                <span className="font-mono text-[10px] uppercase text-muted-foreground">{curTool}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
