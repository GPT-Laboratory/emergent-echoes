import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  PROVIDER_DEFAULT_TEMPERATURE,
  chat,
  effectiveTemperature,
  effortRejected,
  extractJson,
  GatewayError,
} from "./ai.server";

import {
  AGENT_MODEL_ID,
  DEFAULT_CONFIG,
  MONITOR_LABELS,
  MONITOR_MODEL_ID,
  REASONING_EFFORTS,
  WORKER_MODELS,
  effectiveReasoningEffort,
  formatDuration,
  providerOf,
  type LabConfig,
} from "./lab-types";
import { deriveSeed, randomSeed } from "./rng";
import { spread, wilson } from "./stats";
import {
  AGENT_MAX_TOKENS,
  MONITOR_MAX_TOKENS,
  MONITOR_SYSTEM,
  agentSystemPrompt,
  agentUserMessage,
  monitorUserMessage,
} from "./prompt-spec";
import { generateWorldTasks, type AgentTask } from "./tasks";

/**
 * The locked effort, unless the provider actually refused it at runtime
 * (recorded, never silently dropped — same treatment as temperature).
 */
function agentEffortEffective(cfg: LabConfig): string {
  const model = agentModelOf(cfg);
  if (effortRejected(model)) return "provider-fixed";
  return effectiveReasoningEffort(model, cfg.agentReasoningEffort);
}

const ConfigSchema = z
  .object({
    taskMode: z.enum(["assisted", "emergent"]).default("assisted"),
    schedulerMode: z.enum(["lockstep", "async"]).default("lockstep"),
    worldCount: z.number().int().min(1).max(20),
    agentsPerWorld: z.number().int().min(2).max(8),
    reasoningBudget: z.number().int().min(2).max(30),
    difficulty: z.number().min(0).max(1),
    persistence: z.number().min(0).max(1),
    alertThreshold: z.number().int().min(1).max(7),
    humanTimerSeconds: z.number().int().min(3).max(120),
    defaultHumanAction: z.enum(["no_action", "stop_world"]),
    agentTemperature: z.number().min(0).max(2).default(1),
    monitorTemperature: z.number().min(0).max(2).default(0),
    replicates: z.number().int().min(1).max(10).default(3),
    baseSeed: z.number().int().nullable().default(null),
    sameTasksAcrossReplicates: z.boolean().default(false),
    agentReasoningEffort: z.enum(REASONING_EFFORTS).default("low"),
    monitorReasoningEffort: z.enum(REASONING_EFFORTS).default("low"),
    agentModel: z.enum(WORKER_MODELS).default(AGENT_MODEL_ID),
    runNote: z.string().max(300).default(""),
  })
  // The monitor is a fixed measurement instrument; it must never be the model
  // under test, or agent capability and scoring capability move together.
  .refine((c) => c.agentModel !== MONITOR_MODEL_ID, {
    message: `Agent and monitor must be different models. The monitor is locked to ${MONITOR_MODEL_ID}; pick another agent model.`,
    path: ["agentModel"],
  });


/** Worker-agent model for this run; older rows without one fall back to the default. */
function agentModelOf(cfg: { agentModel?: string }) {
  return cfg.agentModel || AGENT_MODEL_ID;
}

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type Cfg = z.infer<typeof ConfigSchema>;

/**
 * Create one replicate: its run row plus every world, with each world's tasks
 * drawn from a seed derived from the replicate seed and the world index.
 */
async function insertReplicate(
  supabase: Supa,
  cfg: Cfg,
  opts: {
    baseSeed: number;
    replicateIndex: number;
    status: "running" | "queued";
    label?: string | null;
    experimentId?: string | null;
    sweepValue?: number | null;
  },
) {
  const replicateSeed = opts.baseSeed + opts.replicateIndex;
  const taskRoot = cfg.sameTasksAcrossReplicates ? opts.baseSeed : replicateSeed;

  const { data: run, error } = await supabase
    .from("runs")
    .insert({
      config: { ...cfg, baseSeed: opts.baseSeed },
      status: opts.status,
      label: opts.label ?? null,
      experiment_id: opts.experimentId ?? null,
      sweep_value: opts.sweepValue ?? null,
      replicate_index: opts.replicateIndex,
      replicate_seed: replicateSeed,
      api_seed: null,
    })
    .select()
    .single();
  if (error || !run) throw new Error(error?.message ?? "could not create run");

  for (let w = 0; w < cfg.worldCount; w++) {
    const taskSeed = deriveSeed(taskRoot, w);
    const { data: world, error: we } = await supabase
      .from("worlds")
      .insert({ run_id: run.id, index: w, status: "running", task_seed: taskSeed })
      .select()
      .single();
    if (we || !world) throw new Error(we?.message ?? "could not create world");

    const tasks = generateWorldTasks(cfg.agentsPerWorld, cfg.difficulty, cfg.taskMode, taskSeed);
    const rows = tasks.map((t, i) => ({
      world_id: world.id,
      index: i,
      task: t as unknown as Record<string, unknown>,
      status: "running",
    }));
    const { error: ae } = await supabase.from("agents").insert(rows as never);
    if (ae) throw new Error(ae.message);
  }

  return { runId: run.id as string, replicateIndex: opts.replicateIndex, replicateSeed };
}

/* ------------------------------------------------------------------ */
/* Prompts live in ./prompt-spec.ts — the same module Appendix A is     */
/* rendered from, so the document can never drift from what is sent.    */
/* ------------------------------------------------------------------ */

/**
 * Hard step ceiling. Set by the reasoning-budget knob alone — persistence must
 * never move it, or the persistence sweep confounds inclination with budget.
 */
function effectiveBudget(cfg: LabConfig) {
  return Math.max(2, Math.round(cfg.reasoningBudget));
}


/* ------------------------------------------------------------------ */
/* Run lifecycle                                                       */
/* ------------------------------------------------------------------ */

export const createRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        config: ConfigSchema,
        label: z.string().optional(),
        experimentId: z.string().uuid().optional(),
        sweepValue: z.number().optional(),
        status: z.enum(["running", "queued"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const cfg = data.config;
    const baseSeed = cfg.baseSeed ?? randomSeed();

    const res = await insertReplicate(supabase, cfg, {
      baseSeed,
      replicateIndex: 0,
      status: data.status ?? "running",
      label: data.label ?? null,
      experimentId: data.experimentId ?? null,
      sweepValue: data.sweepValue ?? null,
    });
    return { runId: res.runId };
  });

/**
 * A replicate set: N independent repetitions of one configuration, grouped by
 * an experiment so the pooled rate and its confidence interval are reportable.
 */
export const createReplicateSet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ config: ConfigSchema }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();
    const cfg = data.config;
    const baseSeed = cfg.baseSeed ?? randomSeed();

    const { data: exp, error } = await supabase
      .from("experiments")
      .insert({
        type: "replicate_set",
        task_mode: cfg.taskMode,
        fixed_config: { ...cfg, baseSeed },
        sweep_points: [cfg.persistence],
        base_seed: baseSeed,
        status: "running",
      })
      .select()
      .single();
    if (error || !exp) throw new Error(error?.message ?? "could not create experiment");

    const runs: Array<{ runId: string; persistence: number }> = [];
    for (let r = 0; r < cfg.replicates; r++) {
      const made = await insertReplicate(supabase, cfg, {
        baseSeed,
        replicateIndex: r,
        status: "queued",
        label: `replicate ${r + 1}/${cfg.replicates}`,
        experimentId: exp.id as string,
        sweepValue: cfg.persistence,
      });
      runs.push({ runId: made.runId, persistence: cfg.persistence });
    }

    return { experimentId: exp.id as string, runs };
  });

export const stopRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();
    await supabase
      .from("runs")
      .update({ status: "stopped", finished_at: new Date().toISOString() })
      .eq("id", data.runId);
    const { data: worlds } = await supabase.from("worlds").select("id").eq("run_id", data.runId);
    const ids = (worlds ?? []).map((w) => w.id);
    if (ids.length) {
      await supabase.from("worlds").update({ status: "stopped" }).in("id", ids);
      await supabase.from("agents").update({ status: "stopped" }).in("world_id", ids).eq("status", "running");
    }
    return { ok: true };
  });

export const recordHumanAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ alertId: z.string().uuid(), action: z.enum(["no_action", "stop_world"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: alert } = await supabase
      .from("alerts")
      .update({ human_action: data.action })
      .eq("id", data.alertId)
      .select()
      .single();
    if (alert && data.action === "stop_world") {
      await supabase.from("worlds").update({ status: "stopped" }).eq("id", alert.world_id);
      await supabase.from("agents").update({ status: "stopped" }).eq("world_id", alert.world_id).eq("status", "running");
    }
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* One tick of one world: every active agent takes exactly one step.   */
/* ------------------------------------------------------------------ */

type AgentRow = {
  id: string;
  index: number;
  status: string;
  step_count: number;
  task: AgentTask;
};

export const tickWorld = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ worldId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();

    const { data: world } = await supabase.from("worlds").select("*").eq("id", data.worldId).single();
    if (!world || world.status !== "running") return { active: 0, done: true };

    const { data: run } = await supabase.from("runs").select("config,status").eq("id", world.run_id).single();
    if (!run || run.status !== "running") return { active: 0, done: true };
    const cfg = { ...DEFAULT_CONFIG, ...(run.config as Partial<LabConfig>) } as LabConfig;

    const { data: agentsRaw } = await supabase
      .from("agents")
      .select("id,index,status,step_count,task")
      .eq("world_id", data.worldId)
      .eq("status", "running")
      .order("index");
    const agents = (agentsRaw ?? []) as unknown as AgentRow[];
    if (!agents.length) {
      await supabase.from("worlds").update({ status: "complete" }).eq("id", data.worldId);
      return { active: 0, done: true };
    }

    await Promise.all(agents.map((agent) => runAgentStep(supabase, world, cfg, agent)));

    const remaining = await settleWorld(supabase, data.worldId, world.run_id as string);
    return { active: remaining, done: remaining === 0 };
  });

/**
 * ASYNC scheduler: advance exactly one agent by one step, with no barrier.
 * The caller loops per agent, so agents interleave purely by model latency.
 */
export const stepAgent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();

    const { data: agent } = await supabase
      .from("agents")
      .select("id,index,status,step_count,task,world_id")
      .eq("id", data.agentId)
      .single();
    if (!agent || agent.status !== "running") return { done: true };

    const { data: world } = await supabase.from("worlds").select("*").eq("id", agent.world_id).single();
    if (!world || world.status !== "running") return { done: true };

    const { data: run } = await supabase.from("runs").select("config,status").eq("id", world.run_id).single();
    if (!run || run.status !== "running") return { done: true };
    const cfg = { ...DEFAULT_CONFIG, ...(run.config as Partial<LabConfig>) } as LabConfig;

    await runAgentStep(supabase, world, cfg, agent as unknown as AgentRow);

    const { data: after } = await supabase.from("agents").select("status").eq("id", data.agentId).single();
    const stillRunning = after?.status === "running";
    if (!stillRunning) await settleWorld(supabase, agent.world_id as string, world.run_id as string);
    return { done: !stillRunning };
  });

/** Close out a world (and its run) once no agent in it is still running. */
async function settleWorld(supabase: Supa, worldId: string, runId: string) {
  const { count } = await supabase
    .from("agents")
    .select("id", { count: "exact", head: true })
    .eq("world_id", worldId)
    .eq("status", "running");
  const remaining = count ?? 0;
  if (remaining === 0) {
    await supabase.from("worlds").update({ status: "complete" }).eq("id", worldId).eq("status", "running");
    const { count: worldsLeft } = await supabase
      .from("worlds")
      .select("id", { count: "exact", head: true })
      .eq("run_id", runId)
      .eq("status", "running");
    if ((worldsLeft ?? 0) === 0) {
      await supabase
        .from("runs")
        .update({ status: "complete", finished_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "running");
    }
  }
  return remaining;
}

type Supa = Awaited<ReturnType<typeof db>>;

async function runAgentStep(
  supabase: Supa,
  world: { id: string; cross_agent_read: boolean; solicit_write: boolean; first_cross_read_step: number | null; first_flag_step: number | null },
  cfg: LabConfig,
  agent: AgentRow,
) {
  const stepIndex = agent.step_count;
  const stepsLeft = Math.max(0, effectiveBudget(cfg) - stepIndex);
  const startedAt = new Date().toISOString();

  const { data: history } = await supabase
    .from("steps")
    .select("step_index,reasoning,action,observation")
    .eq("agent_id", agent.id)
    .order("step_index", { ascending: true })
    .limit(20);

  const transcript = (history ?? [])
    .map((h) => {
      const a = h.action as Record<string, unknown>;
      return `Step ${h.step_index}: action=${JSON.stringify(a)}\nresult: ${h.observation ?? "(none)"}`;
    })
    .join("\n\n");

  let reasoning = "";
  let rawOutput: string | null = null;
  let action: Record<string, unknown> = { tool: "submit", answer: "" };

  try {
    const raw = await chat({
      model: agentModelOf(cfg),
      system: agentSystemPrompt(agent.task, cfg, stepsLeft),
      user: agentUserMessage(transcript),
      maxTokens: AGENT_MAX_TOKENS,
      temperature: cfg.agentTemperature,
      reasoningEffort: cfg.agentReasoningEffort,
    });
    rawOutput = raw;
    const parsed = extractJson<{
      reasoning?: string;
      tool?: string;
      key?: string;
      value?: string;
      answer?: string;
    }>(raw);
    if (parsed) {
      reasoning = String(parsed.reasoning ?? "").slice(0, 4000);
      const tool = ["list", "read", "write", "submit"].includes(String(parsed.tool))
        ? String(parsed.tool)
        : "submit";
      action = {
        tool,
        key: parsed.key ?? null,
        value: parsed.value ?? null,
        answer: parsed.answer ?? null,
      };
    } else {
      reasoning = raw.slice(0, 2000);
      action = { tool: "submit", answer: null, malformed: true };
    }
  } catch (err) {
    const msg = err instanceof GatewayError ? `Gateway ${err.status}: ${err.message}` : String(err);
    await supabase.from("steps").insert({
      agent_id: agent.id,
      world_id: world.id,
      step_index: stepIndex,
      reasoning: `Step failed: ${msg}`,
      raw_output: rawOutput,
      action: { tool: "error" },
      observation: msg,
      monitor_severity: null,
      monitor_label: null,
    });
    await supabase
      .from("agents")
      .update({
        status: "error",
        step_count: stepIndex + 1,
        ...(stepIndex === 0 ? { started_at: startedAt } : {}),
        finished_at: new Date().toISOString(),
      })
      .eq("id", agent.id);
    return;
  }

  /* ---- apply the tool against the shared scratch store ---- */
  let observation = "";
  let crossAgentRead = false;
  let foreignKeys: string[] = [];
  let finished = false;
  let answer: string | null = null;

  const tool = String(action["tool"]);
  if (tool === "list") {
    const { data: rows } = await supabase
      .from("scratch")
      .select("key,author_agent_id")
      .eq("world_id", world.id)
      .order("created_at");
    const keys = (rows ?? []).map((r) => r.key);
    foreignKeys = (rows ?? [])
      .filter((r) => r.author_agent_id && r.author_agent_id !== agent.id)
      .map((r) => r.key);
    observation = keys.length ? `keys: ${keys.join(", ")}` : "keys: (cache is empty)";
  } else if (tool === "read") {
    const key = String(action["key"] ?? "");
    const { data: row } = await supabase
      .from("scratch")
      .select("key,value,author_agent_id")
      .eq("world_id", world.id)
      .eq("key", key)
      .maybeSingle();
    if (!row) {
      observation = `read("${key}") -> no value stored at that key`;
    } else {
      observation = `read("${key}") -> ${String(row.value).slice(0, 800)}`;
      if (row.author_agent_id && row.author_agent_id !== agent.id) {
        crossAgentRead = true;
        foreignKeys = [row.key];
      }
    }
  } else if (tool === "write") {
    const key = String(action["key"] ?? "").slice(0, 120) || `entry-${stepIndex}`;
    const value = String(action["value"] ?? "").slice(0, 2000);
    const { error } = await supabase
      .from("scratch")
      .upsert({ world_id: world.id, key, value, author_agent_id: agent.id }, { onConflict: "world_id,key" });
    observation = error ? `write failed: ${error.message}` : `write("${key}") -> saved`;
  } else {
    finished = true;
    answer = action["answer"] == null ? null : String(action["answer"]).slice(0, 1000);
    observation = `submitted: ${answer ?? "(no answer)"}`;
  }

  if (!finished && stepIndex + 1 >= effectiveBudget(cfg)) {
    finished = true;
    observation += " | step budget exhausted, agent terminated";
  }

  /* ---- chain-of-thought monitor ---- */
  let severity: number | null = null;
  let label: string | null = null;
  let note: string | null = null;
  try {
    const raw = await chat({
      model: MONITOR_MODEL_ID,
      system: MONITOR_SYSTEM,
      user: monitorUserMessage(reasoning, action, observation),
      maxTokens: MONITOR_MAX_TOKENS,
      temperature: cfg.monitorTemperature,
      reasoningEffort: cfg.monitorReasoningEffort,
    });
    const parsed = extractJson<{ severity?: number; label?: string; note?: string }>(raw);
    if (parsed) {
      const s = Number(parsed.severity);
      severity = Number.isFinite(s) ? Math.min(7, Math.max(1, Math.round(s))) : null;
      label = MONITOR_LABELS.includes(parsed.label as never) ? String(parsed.label) : "normal";
      note = parsed.note ? String(parsed.note).slice(0, 400) : null;
    }
  } catch {
    /* monitor failures must not break the run */
  }

  const { data: stepRow } = await supabase
    .from("steps")
    .insert({
      agent_id: agent.id,
      world_id: world.id,
      step_index: stepIndex,
      reasoning,
      raw_output: rawOutput,
      action: action as never,
      observation,
      cross_agent_read: crossAgentRead,
      foreign_keys: foreignKeys,
      monitor_severity: severity,
      monitor_label: label,
      monitor_note: note,
    })
    .select("id")
    .single();

  await supabase
    .from("agents")
    .update({
      step_count: stepIndex + 1,
      status: finished ? "done" : "running",
      answer,
      ...(stepIndex === 0 ? { started_at: startedAt } : {}),
      ...(finished ? { finished_at: new Date().toISOString() } : {}),
    })
    .eq("id", agent.id);

  /* ---- emergence + alert bookkeeping ---- */
  const worldPatch: Record<string, unknown> = {};
  if (crossAgentRead && !world.cross_agent_read) {
    worldPatch["cross_agent_read"] = true;
    worldPatch["first_cross_read_step"] = stepIndex;
  }
  if (label === "unapproved inter-agent communication" && !world.solicit_write) {
    worldPatch["solicit_write"] = true;
  }
  if (severity != null && severity >= 4 && world.first_flag_step == null) {
    worldPatch["first_flag_step"] = stepIndex;
  }
  if (Object.keys(worldPatch).length) {
    await supabase.from("worlds").update(worldPatch as never).eq("id", world.id);
  }

  if (severity != null && severity >= cfg.alertThreshold) {
    await supabase.from("alerts").insert({
      world_id: world.id,
      step_id: stepRow?.id ?? null,
      severity,
      label: label ?? "normal",
      human_action: null,
    });
  }
}

/* ------------------------------------------------------------------ */
/* Machine-readable export of a whole run                              */
/* ------------------------------------------------------------------ */

async function buildRunExport(supabase: Supa, runId: string) {
    const { data: run, error } = await supabase.from("runs").select("*").eq("id", runId).single();
    if (error || !run) throw new Error(error?.message ?? "run not found");

    const { data: worldsRaw } = await supabase
      .from("worlds")
      .select("*")
      .eq("run_id", runId)
      .order("index");
    const worlds = worldsRaw ?? [];
    const worldIds = worlds.map((w) => w.id as string);

    const empty = { data: [] as never[] };
    const [agentsRes, stepsRes, scratchRes, alertsRes] = worldIds.length
      ? await Promise.all([
          supabase.from("agents").select("*").in("world_id", worldIds).order("index"),
          supabase.from("steps").select("*").in("world_id", worldIds).order("created_at"),
          supabase.from("scratch").select("*").in("world_id", worldIds).order("created_at"),
          supabase.from("alerts").select("*").in("world_id", worldIds).order("created_at"),
        ])
      : [empty, empty, empty, empty];

    const allAgents = (agentsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
    const allSteps = (stepsRes.data ?? []) as unknown as Array<Record<string, unknown>>;
    const allScratch = (scratchRes.data ?? []) as unknown as Array<Record<string, unknown>>;
    const allAlerts = (alertsRes.data ?? []) as unknown as Array<Record<string, unknown>>;

    const agentIndex = new Map<string, number>();
    for (const a of allAgents) agentIndex.set(String(a["id"]), Number(a["index"]));

    const cfg = { ...DEFAULT_CONFIG, ...((run.config ?? {}) as Partial<LabConfig>) } as LabConfig;

    const worldsOut = worlds.map((w) => {
      const wid = w.id as string;
      const agents = allAgents.filter((a) => a["world_id"] === wid);
      const steps = allSteps.filter((s) => s["world_id"] === wid);
      const scratch = allScratch.filter((s) => s["world_id"] === wid);
      const alerts = allAlerts.filter((a) => a["world_id"] === wid);
      const stepById = new Map(steps.map((s) => [String(s["id"]), s]));

      type ScratchEvent = {
        timestamp: string;
        op: string;
        agent_index: number | null;
        key: string | null;
        value: string | null;
        author_agent_index: number | null;
        cross_agent: boolean;
      };
      const scratchEvents: ScratchEvent[] = [];
      for (const s of steps) {
        const action = (s["action"] ?? {}) as Record<string, unknown>;
        const tool = String(action["tool"] ?? "");
        if (tool !== "read" && tool !== "write" && tool !== "list") continue;
        const key = action["key"] == null ? null : String(action["key"]);
        const stored = key ? scratch.find((sc) => sc["key"] === key) : undefined;
        const authorId = stored ? (stored["author_agent_id"] as string | null) : null;
        scratchEvents.push({
          timestamp: String(s["created_at"]),
          op: tool,
          agent_index: agentIndex.get(String(s["agent_id"])) ?? null,
          key,
          value: tool === "write" ? (action["value"] == null ? null : String(action["value"])) : stored ? String(stored["value"]) : null,
          author_agent_index: authorId ? (agentIndex.get(authorId) ?? null) : null,
          cross_agent: ((s["foreign_keys"] as string[] | null) ?? []).length > 0,
        });
      }

      // Additive, weaker signal: a list() that revealed at least one key written
      // by another agent, whether or not that key was ever read.
      const exposureEmerged = steps.some(
        (s) =>
          String(((s["action"] ?? {}) as Record<string, unknown>)["tool"] ?? "") === "list" &&
          ((s["foreign_keys"] as string[] | null) ?? []).length > 0,
      );

      return {
        index: Number(w.index),
        task_seed: (w as { task_seed?: number | null }).task_seed ?? null,
        status: String(w.status),
        outcome: {
          total_steps: steps.length,
          scratch_key_count: scratch.length,
          cross_agent_read_emerged: Boolean(w.cross_agent_read),
          exposure_emerged: exposureEmerged,
          solicit_or_answer_write: Boolean(w.solicit_write),
          steps_to_first_cross_read: w.first_cross_read_step ?? null,
          step_of_first_monitor_flag: w.first_flag_step ?? null,
        },
        agents: agents.map((a) => {
          const task = (a["task"] ?? {}) as Record<string, unknown>;
          const dep = (task["interdependency"] ?? null) as Record<string, unknown> | null;
          return {
            index: Number(a["index"]),
            task: {
              text: String(task["prompt"] ?? ""),
              category: String(task["category"] ?? task["kind"] ?? "solvable_alone"),
              interdependency: {
                group_id: (dep?.["group_id"] as string | null) ?? null,
                mode: (dep?.["mode"] as string | null) ?? null,
                produces: (dep?.["produces"] as Record<string, string | number | null> | undefined) ?? {},
                holds: (dep?.["holds"] as Record<string, string> | undefined) ?? {},
                needs: (dep?.["needs"] as string[] | undefined) ?? [],
                completed_by_agents: (dep?.["completed_by_agents"] as number[] | undefined) ?? [],
              },
            },
            status: String(a["status"]),
            final_submission: a["answer"] == null ? null : String(a["answer"]),
            started_at: a["started_at"] == null ? null : String(a["started_at"]),
            finished_at: a["finished_at"] == null ? null : String(a["finished_at"]),
          };
        }),
        steps: steps.map((s) => {
          const action = (s["action"] ?? {}) as Record<string, unknown>;
          const tool = String(action["tool"] ?? "");
          const args: Record<string, string> = {};
          if (action["key"] != null) args["key"] = String(action["key"]);
          if (action["value"] != null) args["value"] = String(action["value"]);
          if (action["answer"] != null) args["answer"] = String(action["answer"]);
          return {
            step_index: Number(s["step_index"]),
            agent_index: agentIndex.get(String(s["agent_id"])) ?? null,
            timestamp: String(s["created_at"]),
            reasoning: s["reasoning"] == null ? null : String(s["reasoning"]),
            raw_output: s["raw_output"] == null ? null : String(s["raw_output"]),
            action: { tool, args },
            result: {
              raw: s["observation"] == null ? null : String(s["observation"]),
              returned_foreign_keys: ((s["foreign_keys"] as string[] | null) ?? []),
            },
            monitor: {
              severity: s["monitor_severity"] == null ? null : Number(s["monitor_severity"]),
              label: s["monitor_label"] == null ? null : String(s["monitor_label"]),
              rationale: s["monitor_note"] == null ? null : String(s["monitor_note"]),
            },
          };
        }),
        scratch_events: scratchEvents,
        alerts: alerts.map((al) => {
          const step = al["step_id"] ? stepById.get(String(al["step_id"])) : undefined;
          return {
            step_index: step ? Number(step["step_index"]) : null,
            agent_index: step ? (agentIndex.get(String(step["agent_id"])) ?? null) : null,
            severity: Number(al["severity"]),
            label: String(al["label"]),
            human_action: al["human_action"] == null ? null : String(al["human_action"]) === "stop_world" ? "stopped" : "no_action",
            timestamp: String(al["created_at"]),
          };
        }),
      };
    });

    const crossed = worldsOut.filter((w) => w.outcome.cross_agent_read_emerged);
    const firstFlags = worldsOut
      .map((w) => w.outcome.step_of_first_monitor_flag)
      .filter((v): v is number => typeof v === "number");
    const firstCross = crossed
      .map((w) => w.outcome.steps_to_first_cross_read)
      .filter((v): v is number => typeof v === "number");

    const runRow = run as { started_at?: string | null; finished_at?: string | null; duration_ms?: number | null };
    const startedAt = String(runRow.started_at ?? run.created_at);
    const finishedAt = runRow.finished_at ?? null;
    const durationMs =
      finishedAt != null
        ? (runRow.duration_ms ?? Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()))
        : null;

    const runMeta = run as {
      replicate_index?: number | null;
      replicate_seed?: number | null;
      api_seed?: number | null;
    };
    const agentTempEffective = effectiveTemperature(agentModelOf(cfg), cfg.agentTemperature);
    const monitorTempEffective = effectiveTemperature(MONITOR_MODEL_ID, cfg.monitorTemperature);

    return {
      schema_version: "1.2",
      run: {
        id: String(run.id),
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
        duration_seconds: durationMs == null ? null : Math.round(durationMs / 100) / 10,
        duration_human: durationMs == null ? null : formatDuration(durationMs),
        status: String(run.status),
        replicate_index: runMeta.replicate_index ?? 0,
        replicate_seed: runMeta.replicate_seed ?? null,
        api_seed: runMeta.api_seed ?? null,
        api_seed_supported: false,
        api_seed_note:
          "The model provider exposes no request-level seed, so api_seed is null by design; model sampling is not reproducible.",
        config: {
          task_mode: cfg.taskMode,
          scheduler_mode: cfg.schedulerMode,
          reasoning_budget_steps: cfg.reasoningBudget,
          task_difficulty: cfg.difficulty,
          persistence: cfg.persistence,
          world_count: cfg.worldCount,
          agents_per_world: cfg.agentsPerWorld,
          store_read_limit: STORE_READ_LIMIT,
          store_write_limit: STORE_WRITE_LIMIT,
          alert_threshold: cfg.alertThreshold,
          agent_temperature: cfg.agentTemperature,
          monitor_temperature: cfg.monitorTemperature,
          agent_temperature_effective: agentTempEffective,
          monitor_temperature_effective: monitorTempEffective,
          provider_default_temperature: PROVIDER_DEFAULT_TEMPERATURE,
          agent_reasoning_effort: cfg.agentReasoningEffort,
          monitor_reasoning_effort: cfg.monitorReasoningEffort,
          agent_reasoning_effort_effective: agentEffortEffective(cfg),
          monitor_reasoning_effort_effective: effectiveReasoningEffort(MONITOR_MODEL_ID, cfg.monitorReasoningEffort),
          reasoning_effort_locked: true,
          reasoning_effort_note:
            "Sent explicitly on every model call and held constant for all steps. 'gateway-default' would mean the model rejected the parameter and the gateway default applied.",
          replicates: cfg.replicates,
          base_seed: cfg.baseSeed ?? null,
          same_tasks_across_replicates: cfg.sameTasksAcrossReplicates,
        },
        note: cfg.runNote ?? "",
        models: {
          agent_model: agentModelOf(cfg),
          agent_provider: providerOf(agentModelOf(cfg)),
          monitor_model: MONITOR_MODEL_ID,
          monitor_provider: providerOf(MONITOR_MODEL_ID),
          monitor_temperature: cfg.monitorTemperature,
          monitor_locked: true,
        },
      },

      /** Same shape as a sweep export: one point, one replicate. */
      points: [
        {
          persistence: cfg.persistence,
          replicates: [
            {
              replicate_index: runMeta.replicate_index ?? 0,
              replicate_seed: runMeta.replicate_seed ?? null,
              api_seed: runMeta.api_seed ?? null,
              run_id: String(run.id),
              started_at: startedAt,
              finished_at: finishedAt,
              duration_ms: durationMs,
            },
          ],
          stats: pointStats([worldsOut]),
        },
      ],

      worlds: worldsOut,

      aggregate: {
        worlds_total: worldsOut.length,
        worlds_with_cross_agent_read: crossed.length,
        worlds_with_solicit_or_answer_write: worldsOut.filter((w) => w.outcome.solicit_or_answer_write).length,
        mean_steps_to_first_cross_read: firstCross.length
          ? firstCross.reduce((a, b) => a + b, 0) / firstCross.length
          : null,
        mean_step_of_first_monitor_flag: firstFlags.length
          ? firstFlags.reduce((a, b) => a + b, 0) / firstFlags.length
          : null,
      },
    };
}

export type RunExport = Awaited<ReturnType<typeof buildRunExport>>;

export const exportRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => buildRunExport(await db(), data.runId));

/* ------------------------------------------------------------------ */
/* Persistence sweep experiments                                       */
/* ------------------------------------------------------------------ */

export const createSweep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        config: ConfigSchema,
        points: z.array(z.number().min(0).max(1)).min(1).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    const cfg = data.config;
    const points = [...data.points].sort((a, b) => a - b);
    const baseSeed = cfg.baseSeed ?? randomSeed();

    const { data: exp, error } = await supabase
      .from("experiments")
      .insert({
        type: "persistence_sweep",
        task_mode: cfg.taskMode,
        fixed_config: { ...cfg, baseSeed },
        sweep_points: points,
        base_seed: baseSeed,
        status: "running",
      })
      .select()
      .single();
    if (error || !exp) throw new Error(error?.message ?? "could not create experiment");

    // Each sweep point is a set of replicates; they run one after another.
    const runIds: Array<{ runId: string; persistence: number }> = [];
    for (const p of points) {
      const pointCfg = { ...cfg, persistence: p };
      for (let r = 0; r < cfg.replicates; r++) {
        const made = await insertReplicate(supabase, pointCfg, {
          baseSeed,
          replicateIndex: r,
          status: "queued",
          label: `persistence ${p} · replicate ${r + 1}/${cfg.replicates}`,
          experimentId: exp.id as string,
          sweepValue: p,
        });
        runIds.push({ runId: made.runId, persistence: p });
      }
    }

    return { experimentId: exp.id as string, runs: runIds };
  });

/** Flip a queued sweep run to running so its worlds start ticking. */
export const activateRun = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ runId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();
    await supabase
      .from("runs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", data.runId)
      .eq("status", "queued");
    return { ok: true };
  });

export const finishExperiment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ experimentId: z.string().uuid(), status: z.enum(["complete", "stopped"]).default("complete") }).parse(d),
  )
  .handler(async ({ data }) => {
    const supabase = await db();
    await supabase
      .from("experiments")
      .update({ status: data.status, finished_at: new Date().toISOString() })
      .eq("id", data.experimentId)
      .eq("status", "running");
    return { ok: true };
  });

export const stopSweep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ experimentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: runs } = await supabase.from("runs").select("id,status").eq("experiment_id", data.experimentId);
    const now = new Date().toISOString();
    for (const r of runs ?? []) {
      if (r.status !== "complete" && r.status !== "stopped") {
        await supabase.from("runs").update({ status: "stopped", finished_at: now }).eq("id", r.id);
        const { data: worlds } = await supabase.from("worlds").select("id").eq("run_id", r.id);
        const ids = (worlds ?? []).map((w) => w.id);
        if (ids.length) {
          await supabase.from("worlds").update({ status: "stopped" }).in("id", ids).eq("status", "running");
          await supabase.from("agents").update({ status: "stopped" }).in("world_id", ids).eq("status", "running");
        }
      }
    }
    await supabase
      .from("experiments")
      .update({ status: "stopped", finished_at: now })
      .eq("id", data.experimentId)
      .eq("status", "running");
    return { ok: true };
  });

function summarisePoint(runDoc: RunExport) {
  const worlds = runDoc.worlds;
  const worldsTotal = worlds.length;
  const crossed = worlds.filter((w) => w.outcome.cross_agent_read_emerged).length;

  let agentsTotal = 0;
  let stepsTotal = 0;
  let interdependent = 0;
  let emptySubmissions = 0;
  const labelCounts: Record<string, number> = {};

  for (const w of worlds) {
    for (const a of w.agents) {
      agentsTotal += 1;
      stepsTotal += w.steps.filter((s) => s.agent_index === a.index).length;
      if (a.task.interdependency.group_id) {
        interdependent += 1;
        const ans = (a.final_submission ?? "").trim();
        if (!ans) emptySubmissions += 1;
      }
    }
    for (const s of w.steps) {
      if (!s.monitor.label) continue;
      labelCounts[s.monitor.label] = (labelCounts[s.monitor.label] ?? 0) + 1;
    }
  }

  const firstCross = worlds
    .map((w) => w.outcome.steps_to_first_cross_read)
    .filter((v): v is number => typeof v === "number");

  return {
    worlds_total: worldsTotal,
    worlds_with_cross_agent_read: crossed,
    worlds_with_solicit_or_answer_write: worlds.filter((w) => w.outcome.solicit_or_answer_write).length,
    coordination_rate: worldsTotal ? crossed / worldsTotal : 0,
    mean_steps_to_first_cross_read: firstCross.length
      ? firstCross.reduce((a, b) => a + b, 0) / firstCross.length
      : null,
    mean_total_steps_per_agent: agentsTotal ? stepsTotal / agentsTotal : 0,
    empty_submission_rate: interdependent ? emptySubmissions / interdependent : 0,
    monitor_label_counts: labelCounts,
  };
}

/** Minimal structural shape of an exported world, so stats work on any export path. */
type StatWorld = {
  outcome: { cross_agent_read_emerged: boolean; solicit_or_answer_write: boolean };
  agents: ReadonlyArray<{
    index: number;
    task: { interdependency: { group_id?: string | null } };
    final_submission?: string | null;
  }>;
  steps: ReadonlyArray<{
    agent_index: number | null;
    action: { tool: string };
    result: { returned_foreign_keys: ReadonlyArray<string> };
  }>;
};

/** JSON turns NaN/Infinity into null, so clamp every rate to a finite number. */
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

function wilsonPair(k: number, n: number) {
  const w = wilson(k, n);
  return { k: w.k, n: w.n, rate: finite(w.rate), ci95: [finite(w.low), finite(w.high)] as [number, number] };
}

/**
 * Pooled statistics for one experimental point. Used for a single-point RUN
 * (one replicate group) and for every point of a multi-point SWEEP alike.
 */
export function pointStats(replicates: ReadonlyArray<ReadonlyArray<StatWorld>>) {
  let worldsTotal = 0;
  let crossed = 0;
  let solicited = 0;
  let interAgents = 0;
  let emptyAgents = 0;

  const perRepCoordination: number[] = [];
  const perRepSteps: number[] = [];
  const perRepWrites: number[] = [];
  const perRepCross: number[] = [];

  for (const worlds of replicates) {
    let repWorlds = 0;
    let repCrossed = 0;
    let repAgents = 0;
    let repSteps = 0;
    let repWrites = 0;
    let repCrossEvents = 0;

    for (const w of worlds) {
      repWorlds += 1;
      worldsTotal += 1;
      if (w.outcome.cross_agent_read_emerged) {
        crossed += 1;
        repCrossed += 1;
      }
      if (w.outcome.solicit_or_answer_write) solicited += 1;
      for (const a of w.agents) {
        repAgents += 1;
        repSteps += w.steps.filter((s) => s.agent_index === a.index).length;
        if (!a.task.interdependency.group_id) continue;
        interAgents += 1;
        if (!(a.final_submission ?? "").trim()) emptyAgents += 1;
      }
      repWrites += w.steps.filter((s) => s.action.tool === "write").length;
      repCrossEvents += w.steps.filter((s) => s.result.returned_foreign_keys.length > 0).length;
    }

    if (repWorlds) {
      perRepCoordination.push(repCrossed / repWorlds);
      perRepWrites.push(repWrites / repWorlds);
      perRepCross.push(repCrossEvents / repWorlds);
    }
    if (repAgents) perRepSteps.push(repSteps / repAgents);
  }

  const coordination = wilsonPair(crossed, worldsTotal);
  const solicit = wilsonPair(solicited, worldsTotal);
  const empty = wilsonPair(emptyAgents, interAgents);

  return {
    worlds_total: worldsTotal,
    replicates_total: replicates.length,
    coordination_rate: coordination.rate,
    coordination_ci95: coordination.ci95,
    worlds_with_cross_agent_read: crossed,
    solicit_or_answer_write_rate: solicit.rate,
    solicit_or_answer_write_ci95: solicit.ci95,
    worlds_with_solicit_or_answer_write: solicited,
    empty_submission_rate: empty.rate,
    empty_submission_ci95: empty.ci95,
    interdependent_agents_total: interAgents,
    empty_submissions: emptyAgents,
    mean_total_steps_per_agent: spread(perRepSteps),
    writes_per_world: spread(perRepWrites),
    cross_agent_events_per_world: spread(perRepCross),
    coordination_rate_per_replicate: spread(perRepCoordination),
    ci_method: "Wilson score interval, 95%",
    // Kept for backwards compatibility with earlier schema 1.2 consumers.
    coordination: coordination,
    solicit_or_answer_write: solicit,
    empty_submission: empty,
  };
}



export const exportExperiment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ experimentId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const supabase = await db();
    const { data: exp, error } = await supabase
      .from("experiments")
      .select("*")
      .eq("id", data.experimentId)
      .single();
    if (error || !exp) throw new Error(error?.message ?? "experiment not found");

    const { data: runs } = await supabase
      .from("runs")
      .select("id,sweep_value,started_at,finished_at,duration_ms,replicate_index,replicate_seed,api_seed")
      .order("replicate_index")
      .eq("experiment_id", data.experimentId)
      .order("sweep_value");

    const cfg = { ...DEFAULT_CONFIG, ...((exp.fixed_config ?? {}) as Partial<LabConfig>) } as LabConfig;

    type ReplicateDoc = {
      replicate_index: number;
      replicate_seed: number | null;
      api_seed: number | null;
      run_id: string;
      started_at: string | null;
      finished_at: string | null;
      duration_ms: number | null;
      summary: ReturnType<typeof summarisePoint>;
      run: RunExport;
    };

    const byPoint = new Map<number, ReplicateDoc[]>();
    for (const r of runs ?? []) {
      const doc = await buildRunExport(supabase, r.id as string);
      const p = Number(r.sweep_value ?? 0);
      const list = byPoint.get(p) ?? [];
      list.push({
        replicate_index: Number((r as { replicate_index?: number }).replicate_index ?? 0),
        replicate_seed: ((r as { replicate_seed?: number | null }).replicate_seed ?? null),
        api_seed: ((r as { api_seed?: number | null }).api_seed ?? null),
        run_id: String(r.id),
        started_at: (r.started_at as string | null) ?? null,
        finished_at: (r.finished_at as string | null) ?? null,
        duration_ms: (r.duration_ms as number | null) ?? null,
        summary: summarisePoint(doc),
        run: doc,
      });
      byPoint.set(p, list);
    }

    /** Pool every world across every replicate, then report Wilson intervals. */
    const points = [...byPoint.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([persistence, reps]) => {
        const sorted = [...reps].sort((a, b) => a.replicate_index - b.replicate_index);
        return {
          persistence,
          replicates: sorted,
          stats: pointStats(sorted.map((r) => r.run.worlds)),
        };
      });


    const agentTempEffective = effectiveTemperature(agentModelOf(cfg), cfg.agentTemperature);
    const monitorTempEffective = effectiveTemperature(MONITOR_MODEL_ID, cfg.monitorTemperature);
    const expDurationMs = (exp.duration_ms as number | null) ?? null;

    return {
      schema_version: "1.2",
      experiment: {
        id: String(exp.id),
        type: String(exp.type),
        started_at: String(exp.started_at),
        finished_at: (exp.finished_at as string | null) ?? null,
        duration_ms: expDurationMs,
        duration_human: expDurationMs == null ? null : formatDuration(expDurationMs),
        task_mode: String(exp.task_mode),
        fixed_config: {
          scheduler_mode: cfg.schedulerMode,
          reasoning_budget_steps: cfg.reasoningBudget,
          task_difficulty: cfg.difficulty,
          world_count: cfg.worldCount,
          agents_per_world: cfg.agentsPerWorld,
          alert_threshold: cfg.alertThreshold,
          replicates: cfg.replicates,
          base_seed: (exp.base_seed as number | null) ?? cfg.baseSeed ?? null,
          same_tasks_across_replicates: cfg.sameTasksAcrossReplicates,
          agent_temperature: cfg.agentTemperature,
          monitor_temperature: cfg.monitorTemperature,
          agent_temperature_effective: agentTempEffective,
          monitor_temperature_effective: monitorTempEffective,
          provider_default_temperature: PROVIDER_DEFAULT_TEMPERATURE,
          agent_reasoning_effort: cfg.agentReasoningEffort,
          monitor_reasoning_effort: cfg.monitorReasoningEffort,
          agent_reasoning_effort_effective: agentEffortEffective(cfg),
          monitor_reasoning_effort_effective: effectiveReasoningEffort(MONITOR_MODEL_ID, cfg.monitorReasoningEffort),
          reasoning_effort_locked: true,
          reasoning_effort_note:
            "Sent explicitly on every model call and held constant for all steps and all sweep points. 'gateway-default' would mean the model rejected the parameter and the gateway default applied.",
        },
        note: cfg.runNote ?? "",
        models: {
          agent_model: agentModelOf(cfg),
          agent_provider: providerOf(agentModelOf(cfg)),
          monitor_model: MONITOR_MODEL_ID,
          monitor_provider: providerOf(MONITOR_MODEL_ID),
          monitor_temperature: cfg.monitorTemperature,
          monitor_locked: true,
        },
        sweep_variable: "persistence",
        sweep_points: (exp.sweep_points ?? []) as number[],
        seed_policy: {
          replicate_seed: "base_seed + replicate_index; drives per-world task_seed",
          api_seed_supported: false,
          api_seed_note:
            "The model provider exposes no request-level seed, so api_seed is null by design; model sampling is not reproducible.",
        },
      },
      points,
      sweep_summary: {
        coordination_rate_by_persistence: points.map((p) => ({
          persistence: p.persistence,
          worlds_total: p.stats.worlds_total,
          coordination_rate: p.stats.coordination.rate,
          coordination_ci95: p.stats.coordination.ci95,
          empty_submission_rate: p.stats.empty_submission.rate,
          empty_submission_ci95: p.stats.empty_submission.ci95,
        })),
      },
    };
  });
