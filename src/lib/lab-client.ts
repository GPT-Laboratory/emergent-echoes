import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import type { AgentTask } from "./tasks";

export type WorldRow = {
  id: string;
  run_id: string;
  index: number;
  status: string;
  cross_agent_read: boolean;
  solicit_write: boolean;
  first_cross_read_step: number | null;
  first_flag_step: number | null;
};

export type AgentRow = {
  id: string;
  world_id: string;
  index: number;
  status: string;
  step_count: number;
  answer: string | null;
  task: AgentTask;
};

export type StepRow = {
  id: string;
  agent_id: string;
  world_id: string;
  step_index: number;
  reasoning: string | null;
  action: Record<string, unknown>;
  observation: string | null;
  cross_agent_read: boolean;
  foreign_keys: string[] | null;
  monitor_severity: number | null;
  monitor_label: string | null;
  monitor_note: string | null;
  created_at: string;
};

export type ScratchRow = {
  id: string;
  world_id: string;
  key: string;
  value: string;
  author_agent_id: string | null;
  created_at: string;
};

export type AlertRow = {
  id: string;
  world_id: string;
  step_id: string | null;
  severity: number;
  label: string;
  human_action: string | null;
  created_at: string;
};

/** Live worlds for a run. */
export function useWorlds(runId: string | null) {
  const [worlds, setWorlds] = useState<WorldRow[]>([]);

  useEffect(() => {
    if (!runId) {
      setWorlds([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("worlds").select("*").eq("run_id", runId).order("index");
      if (!cancelled) setWorlds((data ?? []) as unknown as WorldRow[]);
    };
    void load();

    const channel = supabase
      .channel(`worlds-${runId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "worlds" }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  return worlds;
}

/** Live aggregate step count + alerts for a run (used by the Lab headline stats). */
export function useRunSteps(runId: string | null) {
  const [steps, setSteps] = useState<StepRow[]>([]);

  useEffect(() => {
    if (!runId) {
      setSteps([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data: worlds } = await supabase.from("worlds").select("id").eq("run_id", runId);
      const ids = (worlds ?? []).map((w) => w.id);
      if (!ids.length) {
        if (!cancelled) setSteps([]);
        return;
      }
      const { data } = await supabase
        .from("steps")
        .select("*")
        .in("world_id", ids)
        .order("created_at", { ascending: true });
      if (!cancelled) setSteps((data ?? []) as unknown as StepRow[]);
    };
    void load();

    const channel = supabase
      .channel(`steps-${runId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "steps" }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [runId]);

  return steps;
}

/** Everything inside one world, live. */
export function useWorldDetail(worldId: string) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [scratch, setScratch] = useState<ScratchRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [world, setWorld] = useState<WorldRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [w, a, s, sc, al] = await Promise.all([
        supabase.from("worlds").select("*").eq("id", worldId).maybeSingle(),
        supabase.from("agents").select("*").eq("world_id", worldId).order("index"),
        supabase.from("steps").select("*").eq("world_id", worldId).order("created_at"),
        supabase.from("scratch").select("*").eq("world_id", worldId).order("created_at"),
        supabase.from("alerts").select("*").eq("world_id", worldId).order("created_at"),
      ]);
      if (cancelled) return;
      setWorld((w.data ?? null) as unknown as WorldRow | null);
      setAgents((a.data ?? []) as unknown as AgentRow[]);
      setSteps((s.data ?? []) as unknown as StepRow[]);
      setScratch((sc.data ?? []) as unknown as ScratchRow[]);
      setAlerts((al.data ?? []) as unknown as AlertRow[]);
    };
    void load();

    const channel = supabase
      .channel(`world-${worldId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "steps" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "scratch" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "agents" }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [worldId]);

  return { world, agents, steps, scratch, alerts };
}
