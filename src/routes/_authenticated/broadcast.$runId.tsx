import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { RunHeader, type RunRow } from "@/components/lab/RunHeader";
import { supabase } from "@/integrations/supabase/client";
import { useWorldDetail, useWorlds, type AgentRow, type StepRow } from "@/lib/lab-client";

export const Route = createFileRoute("/_authenticated/broadcast/$runId")({
  head: () => ({
    meta: [
      { title: "Broadcast — Emergent Agent Coordination Lab" },
      { name: "description", content: "Full-screen broadcast view of one world of autonomous agents, step by step." },
      { property: "og:title", content: "Broadcast — Emergent Agent Coordination Lab" },
      { property: "og:description", content: "Watch isolated agents work and see when coordination emerges." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BroadcastRoute,
});

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];
const BASE_CPS = 60;
const MAX_LINES = 14;
const TERM_FONT = { fontSize: "clamp(18px, 1.35vw, 28px)", fontWeight: 500 } as const;

type LineKind = "reason" | "list" | "read" | "write" | "submit" | "other" | "obs";
type Line = { kind: LineKind; text: string };
type Typing = { step: StepRow; lines: Line[]; li: number; pos: number; opApplied: boolean };
type Panel = { done: Line[]; typing: Typing | null };
type StoreEntry = { key: string; value: string; letter: string; at: number };
type Moment = { agentLetter: string; authorLetter: string; key: string; at: number };

function trunc(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function stepLines(s: StepRow): Line[] {
  const a = s.action ?? {};
  const tool = String(a["tool"] ?? "?");
  const key = String(a["key"] ?? "");
  let op: Line;
  if (tool === "list") op = { kind: "list", text: "list()" };
  else if (tool === "read") op = { kind: "read", text: `read("${key}")` };
  else if (tool === "write") op = { kind: "write", text: `write("${key}", ${trunc(String(a["value"] ?? ""), 80)})` };
  else if (tool === "submit") op = { kind: "submit", text: `submit(${trunc(String(a["answer"] ?? ""), 80)})` };
  else op = { kind: "other", text: `${tool}()` };
  const lines: Line[] = [];
  if (s.reasoning) lines.push({ kind: "reason", text: `> ${trunc(s.reasoning, 400)}` });
  lines.push({ ...op, text: `$ ${op.text}` });
  if (s.observation) lines.push({ kind: "obs", text: `< ${trunc(s.observation, 200)}` });
  return lines;
}

const KIND_CLASS: Record<LineKind, string> = {
  reason: "text-foreground/90",
  list: "text-foreground font-bold",
  read: "text-warning font-bold",
  write: "text-primary font-bold",
  submit: "text-destructive font-bold",
  other: "text-foreground font-bold",
  obs: "text-muted-foreground",
};

function BroadcastRoute() {
  const { runId: param } = Route.useParams();
  const [runId, setRunId] = useState<string | null>(param === "latest" ? null : param);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (param !== "latest") {
      setRunId(param);
      return;
    }
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
  const firstCross = useMemo(() => worlds.find((w) => w.cross_agent_read)?.index ?? null, [worlds]);

  useEffect(() => {
    if (worldIdx == null && worlds.length) setWorldIdx(firstCross ?? worlds[0]!.index);
  }, [worlds, worldIdx, firstCross]);

  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!worlds.length) return;
    const ids = worlds.map((w) => w.id);
    let cancelled = false;
    const load = () =>
      void supabase
        .from("steps")
        .select("world_id")
        .in("world_id", ids)
        .limit(20000)
        .then(({ data }) => {
          if (cancelled || !data) return;
          const c: Record<string, number> = {};
          for (const r of data) c[r.world_id] = (c[r.world_id] ?? 0) + 1;
          setCounts(c);
        });
    load();
    const id = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [worlds.length, runId]); // eslint-disable-line react-hooks/exhaustive-deps

  const world = worlds.find((w) => w.index === worldIdx) ?? null;
  const live = status === "running";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!worlds.length) return;
      const pos = worlds.findIndex((w) => w.index === worldIdx);
      if (e.key === "ArrowLeft") setWorldIdx(worlds[Math.max(0, pos - 1)]!.index);
      else if (e.key === "ArrowRight") setWorldIdx(worlds[Math.min(worlds.length - 1, pos + 1)]!.index);
      else if (e.key === "c" || e.key === "C") {
        if (firstCross != null) setWorldIdx(firstCross);
      } else if (e.key === "f" || e.key === "F") {
        try {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
          else void document.documentElement.requestFullscreen().catch(() => {});
        } catch {
          /* ignore */
        }
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [worlds, worldIdx, firstCross]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background text-foreground">
      <TopBar runId={runId} current="broadcast" />
      {world ? (
        <WorldStage key={world.id} worldId={world.id} worldIndex={world.index} live={live} />
      ) : (
        <div className="flex flex-1 items-center justify-center font-mono text-2xl text-muted-foreground">
          {runId ? "loading run…" : "resolving run…"}
        </div>
      )}
      <div className="flex shrink-0 flex-wrap gap-2 border-t-2 border-border px-6 py-3">
        {worlds.map((w) => (
          <div
            key={w.id}
            className={[
              "rounded-md border-2 px-3 py-1 font-mono text-base transition-colors duration-500",
              w.cross_agent_read ? "border-primary bg-primary/25 text-primary" : "border-border bg-card text-muted-foreground",
              w.index === worldIdx ? "outline outline-[3px] outline-offset-2 outline-foreground" : "",
            ].join(" ")}
          >
            W{String(w.index).padStart(2, "0")} · {counts[w.id] ?? 0}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorldStage({ worldId, worldIndex, live }: { worldId: string; worldIndex: number; live: boolean }) {
  const { agents, steps, scratch } = useWorldDetail(worldId);
  const sortedAgents = useMemo(() => [...agents].sort((a, b) => a.index - b.index), [agents]);
  const letterOf = useMemo(() => {
    const m = new Map<string, string>();
    sortedAgents.forEach((a, i) => m.set(a.id, LETTERS[i] ?? "?"));
    return m;
  }, [sortedAgents]);
  const ordered = useMemo(
    () => [...steps].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [steps],
  );

  const reduced = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const eng = useRef({
    next: 0,
    panels: new Map<string, Panel>(),
    store: new Map<string, StoreEntry>(),
    moment: null as Moment | null,
    elapsed: 0,
    hold: 0,
  });
  const [, setFrame] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const ctx = useRef({ scratch, letterOf, live, speed, paused, reduced });
  ctx.current = { scratch, letterOf, live, speed, paused, reduced };

  const restart = useCallback(() => {
    eng.current = { next: 0, panels: new Map(), store: new Map(), moment: null, elapsed: 0, hold: 0 };
    setFrame((f) => f + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") setPaused((p) => !p);
      else if (e.key === "r" || e.key === "R") restart();
      else if (e.key === "ArrowUp") setSpeed((s) => Math.min(8, s * 2));
      else if (e.key === "ArrowDown") setSpeed((s) => Math.max(0.125, s / 2));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      const c = ctx.current;
      if (c.paused) return;
      const e = eng.current;
      const ord = orderedRef.current;
      e.elapsed += dt;

      const panelOf = (agentId: string) => {
        let p = e.panels.get(agentId);
        if (!p) e.panels.set(agentId, (p = { done: [], typing: null }));
        return p;
      };

      // Start steps strictly in global order; panels whose next step is free run in parallel.
      while (e.next < ord.length) {
        const s = ord[e.next]!;
        const p = panelOf(s.agent_id);
        if (p.typing) break;
        p.typing = { step: s, lines: stepLines(s), li: 0, pos: 0, opApplied: false };
        e.next++;
      }

      for (const [agentId, p] of e.panels) {
        const t = p.typing;
        if (!t) continue;
        let backlog = 0;
        for (let i = e.next; i < ord.length; i++) if (ord[i]!.agent_id === agentId) backlog++;
        const mult = c.speed * (c.live && backlog > 3 ? 2 : 1);
        const line = t.lines[t.li]!;
        if (c.reduced) t.pos = line.text.length;
        else t.pos += BASE_CPS * mult * dt;
        if (t.pos >= line.text.length) {
          if (line.kind !== "reason" && line.kind !== "obs" && !t.opApplied) {
            t.opApplied = true;
            applyOp(t.step, e, c.scratch, c.letterOf);
          }
          p.done.push(line);
          if (p.done.length > MAX_LINES) p.done.splice(0, p.done.length - MAX_LINES);
          t.li++;
          t.pos = 0;
          if (t.li >= t.lines.length) p.typing = null;
        }
      }
      setFrame((f) => (f + 1) % 1e9);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const e = eng.current;
  const nowMs = e.elapsed * 1000;
  const moment = e.moment && nowMs - e.moment.at < 4000 ? e.moment : null;
  const lastMoment = useRef<Moment | null>(null);
  if (e.moment) lastMoment.current = e.moment;
  const bannerMoment = lastMoment.current;
  const storeEntries = [...e.store.values()].sort((a, b) => a.at - b.at);
  const ord = ordered;

  return (
    <>
      <div className="flex shrink-0 items-center gap-6 border-b-2 border-border px-6 py-3 font-mono">
        <span className="text-xl font-bold tracking-widest">EMERGENT AGENT COORDINATION LAB</span>
        <span className="text-xl text-primary">WORLD {String(worldIndex).padStart(2, "0")}</span>
        <span
          className={[
            "rounded-md border-2 px-3 py-0.5 text-lg font-bold tracking-widest",
            live ? "border-destructive text-destructive" : "border-warning text-warning",
          ].join(" ")}
        >
          {live ? "● LIVE" : "RECORDED RUN · REPLAY"}
        </span>
        {paused && <span className="text-lg text-warning">PAUSED</span>}
        {speed !== 1 && <span className="text-lg text-muted-foreground">×{speed}</span>}
        <span className="ml-auto text-xl tabular-nums">{fmtElapsed(e.elapsed)}</span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-4 gap-4 px-6 pt-4">
        {sortedAgents.map((a, i) => {
          const p = e.panels.get(a.id);
          const queued = ord.slice(e.next).some((s) => s.agent_id === a.id);
          const hot = moment?.agentLetter === LETTERS[i];
          return (
            <TerminalPanel
              key={a.id}
              agent={a}
              letter={LETTERS[i] ?? "?"}
              panel={p}
              idle={!p?.typing && !queued}
              hot={hot}
            />
          );
        })}
      </div>

      <div className="relative shrink-0 px-6 py-4">
        <div className="mb-2 font-mono text-lg font-bold tracking-widest text-muted-foreground">SHARED STORE</div>
        <div className="flex max-h-[18vh] flex-wrap gap-3 overflow-hidden">
          {storeEntries.length === 0 && (
            <span className="font-mono text-lg text-muted-foreground">(empty)</span>
          )}
          {storeEntries.map((s) => {
            const hot = moment?.key === s.key;
            return (
              <div
                key={s.key}
                className={[
                  "bc-enter rounded-md border-2 px-3 py-1.5 font-mono transition-all duration-500",
                  hot ? "border-warning bg-warning/25" : "border-border bg-card",
                ].join(" ")}
                style={TERM_FONT}
              >
                <span className="mr-2 rounded bg-primary/25 px-1.5 text-primary">{s.letter}</span>
                <span className="text-foreground">{s.key}</span>
                <span className="text-muted-foreground"> = </span>
                <span className="text-foreground">{trunc(s.value, 60)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={[
          "pointer-events-none fixed left-1/2 top-1/2 z-[110] -translate-x-1/2 -translate-y-1/2 rounded-xl border-4 border-warning bg-background/95 px-10 py-6 text-center font-mono shadow-2xl transition-opacity duration-500",
          moment ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        <div className="text-3xl font-bold tracking-widest text-warning">CROSS-AGENT READ</div>
        {bannerMoment && (
          <div className="mt-2 text-2xl text-foreground">
            AGENT {bannerMoment.agentLetter} used a value written by AGENT {bannerMoment.authorLetter}
          </div>
        )}
      </div>

      <style>{`
        @keyframes bc-enter { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .bc-enter { animation: bc-enter 600ms ease-out; }
        @keyframes bc-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .bc-cursor { animation: bc-blink 1.6s step-end infinite; }
        @media (prefers-reduced-motion: reduce) { .bc-enter { animation: none; } .bc-cursor { animation: none; } }
      `}</style>
    </>
  );
}

function applyOp(
  s: StepRow,
  e: { store: Map<string, StoreEntry>; moment: Moment | null; elapsed: number },
  scratch: { key: string; value: string; author_agent_id: string | null }[],
  letterOf: Map<string, string>,
) {
  const a = s.action ?? {};
  const tool = String(a["tool"] ?? "");
  const key = String(a["key"] ?? "");
  const me = letterOf.get(s.agent_id) ?? "?";
  if (tool === "write" && key) {
    const row = scratch.find((r) => r.key === key && r.author_agent_id === s.agent_id);
    e.store.set(key, {
      key,
      value: String(a["value"] ?? row?.value ?? ""),
      letter: me,
      at: e.store.get(key)?.at ?? e.elapsed,
    });
  }
  if (s.cross_agent_read) {
    const readKey = key || s.foreign_keys?.[0] || "";
    const fromStore = e.store.get(readKey);
    const row = scratch.find((r) => r.key === readKey && r.author_agent_id !== s.agent_id);
    const author = fromStore?.letter ?? (row?.author_agent_id ? letterOf.get(row.author_agent_id) : undefined) ?? "?";
    e.moment = { agentLetter: me, authorLetter: author, key: readKey, at: e.elapsed * 1000 };
  }
}

function TerminalPanel({
  agent,
  letter,
  panel,
  idle,
  hot,
}: {
  agent: AgentRow;
  letter: string;
  panel: Panel | undefined;
  idle: boolean;
  hot: boolean;
}) {
  const t = panel?.typing;
  const partial = t ? { ...t.lines[t.li]!, text: t.lines[t.li]!.text.slice(0, Math.floor(t.pos)) } : null;
  const lines = [...(panel?.done ?? []), ...(partial ? [partial] : [])].slice(-MAX_LINES);
  const ended = idle && agent.status !== "running";
  const endLabel =
    agent.status === "invalidated" ? "INVALIDATED" : agent.status === "error" ? "ERROR" : "DONE";

  return (
    <div
      className={[
        "flex min-h-0 flex-col rounded-lg border-2 bg-card transition-all duration-500",
        hot ? "border-warning shadow-[0_0_40px_-5px_var(--warning)]" : "border-border",
      ].join(" ")}
    >
      <div className="border-b-2 border-border px-4 py-2">
        <div className="font-mono text-2xl font-bold tracking-widest text-foreground">AGENT {letter}</div>
        <div className="line-clamp-2 text-base leading-snug text-muted-foreground">{agent.task?.prompt ?? "—"}</div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 py-3 font-mono leading-snug" style={TERM_FONT}>
        {lines.map((l, i) => (
          <div key={i} className={["break-words", KIND_CLASS[l.kind]].join(" ")}>
            {l.text}
          </div>
        ))}
        {idle && !ended && (
          <div className="text-muted-foreground">
            <span className="bc-cursor">▌</span> waiting for model
          </div>
        )}
        {ended && (
          <div
            className={[
              "mt-1 font-bold tracking-widest",
              agent.status === "error" || agent.status === "invalidated" ? "text-destructive" : "text-primary",
            ].join(" ")}
          >
            {endLabel}
          </div>
        )}
      </div>
    </div>
  );
}

function fmtElapsed(s: number) {
  const t = Math.floor(s);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function TopBar({ runId, current }: { runId: string | null; current: "broadcast" | "rooms" }) {
  const [row, setRow] = useState<RunRow | null>(null);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    const load = () =>
      void supabase
        .from("runs")
        .select("id,status,config,started_at,created_at,finished_at,duration_ms,experiment_id")
        .eq("id", runId)
        .maybeSingle()
        .then(({ data }) => !cancelled && data && setRow(data as unknown as RunRow));
    load();
    const id = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [runId]);
  const shown = useMemo(
    () => (row && !reveal ? { ...row, config: { ...(row.config ?? {}), agentModel: "model hidden" } as RunRow["config"] } : row),
    [row, reveal],
  );
  const link = (on: boolean) =>
    ["font-mono text-[11px] uppercase tracking-widest", on ? "text-primary" : "text-muted-foreground hover:text-foreground"].join(" ");
  return (
    <div className="shrink-0 space-y-1 px-4 pt-2">
      <div className="flex flex-wrap items-center gap-4">
        {runId && (
          <>
            <Link to="/run/$runId" params={{ runId }} className={link(false)}>Run status</Link>
            <Link to="/broadcast/$runId" params={{ runId }} className={link(current === "broadcast")}>Broadcast</Link>
            <Link to="/rooms/$runId" params={{ runId }} className={link(current === "rooms")}>Rooms</Link>
            <Link to="/split/$runId" params={{ runId }} className={link(false)}>Split</Link>
          </>
        )}
        <Link to="/picker" className={link(false)}>Picker</Link>
        <button type="button" onClick={() => setReveal((v) => !v)} className={`${link(false)} ml-auto`}>
          {reveal ? "Hide models" : "Reveal models"}
        </button>
      </div>
      {shown && <RunHeader run={shown} />}
    </div>
  );
}
