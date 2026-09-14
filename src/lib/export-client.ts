/** Filename helpers + downloads for run / sweep exports. */

/** UTC YYYYMMDD-HHMM so alphabetical order equals chronological order. */
function stamp(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  const t = isNaN(d.getTime()) ? new Date() : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}-${p(t.getUTCHours())}${p(t.getUTCMinutes())}`;
}

/** "openai/gpt-6-astra" -> "astra"; "anthropic/claude-sonnet-5" -> "sonnet" */
function modelShort(id: unknown): string {
  const raw = typeof id === "string" ? id : "";
  const last = (raw.split("/").pop() ?? "").toLowerCase();
  for (const family of ["haiku", "sonnet", "opus", "fable"]) {
    if (last.includes(family)) return family;
  }
  const seg = last.split(/[-_.]/).filter(Boolean).pop() ?? "model";
  return seg.toLowerCase();
}


/** 0.5 -> "05", 0.45 -> "045", 1 -> "1" */
function persistenceTag(v: unknown): string {
  const n = typeof v === "number" ? v : 0;
  return String(n).replace(".", "");
}

type AnyDoc = Record<string, any>;

/** "recheck-only" -> "c-recheck-only"; legacy slider -> "p05" */
function persistenceSegment(clause: unknown, persistence: unknown): string {
  const c = typeof clause === "string" ? clause : "slider-legacy";
  if (c && c !== "slider-legacy") return `c-${c}`;
  return `p${persistenceTag(persistence ?? 0)}`;
}

export function runFileName(doc: unknown): string {
  const d = (doc ?? {}) as AnyDoc;
  const run = d['run'] ?? {};
  const cfg = run.config ?? {};
  return [
    stamp(run.started_at),
    "run",
    String(cfg.task_mode ?? "assisted"),
    String(cfg.scheduler_mode ?? "lockstep"),
    modelShort(run.models?.agent_model),
    persistenceSegment(cfg.persistence_clause, cfg.persistence),
    `b${cfg.reasoning_budget_steps ?? 0}`,
    `w${cfg.world_count ?? 0}`,
  ].join("_") + ".json";
}

export function sweepFileName(doc: unknown): string {
  const d = (doc ?? {}) as AnyDoc;
  const exp = d['experiment'] ?? {};
  const cfg = exp.fixed_config ?? {};
  const variable = String(exp.sweep_variable ?? "persistence");
  return [
    stamp(exp.started_at),
    `sweep-${variable === "persistence_clause" ? "clause" : variable}`,
    String(exp.task_mode ?? cfg.task_mode ?? "assisted"),
    String(cfg.scheduler_mode ?? "lockstep"),
    modelShort(exp.models?.agent_model),
    `b${cfg.reasoning_budget_steps ?? 0}`,
    `w${cfg.world_count ?? 0}`,
  ].join("_") + ".json";
}

function save(name: string, doc: unknown) {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Turns a run export object into a downloaded, pretty-printed JSON file. */
export function downloadRunJson(_runId: string, doc: unknown) {
  save(runFileName(doc), doc);
}

/** Same, for a whole sweep experiment. */
export function downloadSweepJson(_experimentId: string, doc: unknown) {
  save(sweepFileName(doc), doc);
}

/** Filename built from list-row data (no export document loaded yet). */
export function runFileNameFromConfig(
  startedAt: string | null | undefined,
  cfg: {
    taskMode?: string;
    schedulerMode?: string;
    persistence?: number;
    persistenceClause?: string;
    reasoningBudget?: number;
    worldCount?: number;
  } | null,
  agentModelId: string,
): string {
  const c = cfg ?? {};
  return [
    stamp(startedAt),
    "run",
    String(c.taskMode ?? "assisted"),
    String(c.schedulerMode ?? "lockstep"),
    modelShort(agentModelId),
    persistenceSegment(c.persistenceClause, c.persistence ?? 0),
    `b${c.reasoningBudget ?? 0}`,
    `w${c.worldCount ?? 0}`,
  ].join("_") + ".json";
}

export function sweepFileNameFromConfig(
  startedAt: string | null | undefined,
  taskMode: string,
  cfg: { schedulerMode?: string; reasoningBudget?: number; worldCount?: number } | null,
  agentModelId: string,
  sweepVariable = "persistence",
): string {
  const c = cfg ?? {};
  return [
    stamp(startedAt),
    `sweep-${sweepVariable === "persistence_clause" ? "clause" : sweepVariable}`,
    taskMode || "assisted",
    String(c.schedulerMode ?? "lockstep"),
    modelShort(agentModelId),
    `b${c.reasoningBudget ?? 0}`,
    `w${c.worldCount ?? 0}`,
  ].join("_") + ".json";
}

/** Appendix A filename, mirroring the run naming so it sorts alongside it. */
export function appendixFileName(
  startedAt: string | null | undefined,
  cfg: { taskMode?: string; agentModel?: string; agentReasoningEffort?: string; persistence?: number },
): string {
  return [
    stamp(startedAt),
    "prompts-appendix-a",
    String(cfg.taskMode ?? "assisted"),
    modelShort(cfg.agentModel),
    `e${String(cfg.agentReasoningEffort ?? "low")}`,
    `p${persistenceTag(cfg.persistence ?? 0)}`,
  ].join("_") + ".md";
}

/** Renders Appendix A from the live prompt code for this config and downloads it. */
export function downloadPromptsAppendix(
  markdown: string,
  startedAt: string | null | undefined,
  cfg: { taskMode?: string; agentModel?: string; agentReasoningEffort?: string; persistence?: number },
) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = appendixFileName(startedAt, cfg);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
