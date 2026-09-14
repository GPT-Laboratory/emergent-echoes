import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import {
  MONITOR_MODEL_ID,
  PERSISTENCE_CLAUSES,
  PERSISTENCE_CLAUSE_LABELS,
  PERSISTENCE_CLAUSE_TEXT,
  REASONING_EFFORTS,
  WORKER_MODELS,
  clauseSelectorActive,
  type LabConfig,
  type PersistenceClauseOption,
  type ReasoningEffort,
} from "@/lib/lab-types";

function Knob({
  label,
  hint,
  value,
  display,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean | undefined;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="label-caps">{label}</Label>
        <span className="font-mono text-sm text-primary">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled ?? false}
        onValueChange={(v) => onChange(v[0]!)}
      />
      <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

export function ConfigPanel({
  config,
  onChange,
  disabled,
}: {
  config: LabConfig;
  onChange: (patch: Partial<LabConfig>) => void;
  disabled?: boolean | undefined;
}) {
  const clauseActive = clauseSelectorActive(config);
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
      <div className="space-y-2">
        <Label className="label-caps">Agent model</Label>
        <select
          className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          value={config.agentModel}
          disabled={disabled ?? false}
          onChange={(e) => onChange({ agentModel: e.target.value })}
        >
          {["openai", "google", "anthropic"].map((provider) => (
            <optgroup key={provider} label={provider}>
              {WORKER_MODELS.filter((m) => m !== MONITOR_MODEL_ID && m.startsWith(`${provider}/`)).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </optgroup>
          ))}

        </select>
        <p className="font-mono text-[11px] text-muted-foreground">
          monitor: {MONITOR_MODEL_ID.split("/")[1]} · temp {config.monitorTemperature.toFixed(1)} · locked
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          The only thing that changes across a capability ladder. One run per model.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="label-caps" htmlFor="run-note">
          Run note
        </Label>
        <input
          id="run-note"
          value={config.runNote}
          maxLength={300}
          disabled={disabled ?? false}
          placeholder="AAII v4.3 = 51 (high), retrieved 2026-09-14"
          onChange={(e) => onChange({ runNote: e.target.value })}
          className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
        />
        <p className="text-xs leading-snug text-muted-foreground">Saved verbatim into the export as run.note.</p>
      </div>

      <Knob

        label="Reasoning budget"
        hint="Hard step ceiling per agent. Independent of persistence; keep it generous so agents rarely hit it."
        value={config.reasoningBudget}
        display={`${config.reasoningBudget} steps`}
        min={2}
        max={30}
        step={1}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ reasoningBudget: v })}
      />
      <Knob
        label="Task difficulty"
        hint="Share of tasks that are blocked or need fragments no single agent holds."
        value={config.difficulty}
        display={`${Math.round(config.difficulty * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ difficulty: v })}
      />
      <div className="space-y-2">
        <Label className="label-caps">Persistence clause</Label>
        <select
          className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
          value={config.persistenceClause}
          disabled={disabled ?? false}
          onChange={(e) => onChange({ persistenceClause: e.target.value as PersistenceClauseOption })}
        >
          {PERSISTENCE_CLAUSES.map((o) => (
            <option key={o} value={o}>
              {PERSISTENCE_CLAUSE_LABELS[o]}
            </option>
          ))}
        </select>
        <p className="font-mono text-[11px] leading-snug text-muted-foreground">
          {clauseActive
            ? config.persistenceClause === "none"
              ? "(insert nothing; the line is omitted entirely)"
              : PERSISTENCE_CLAUSE_TEXT[config.persistenceClause as Exclude<PersistenceClauseOption, "slider-legacy">]
            : "legacy numeric mapping from the slider below"}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">
          The only line that differs between ablation conditions, inserted verbatim into the worker system prompt.
        </p>
      </div>

      <Knob
        label="Persistence"
        hint={
          clauseActive
            ? "overridden by clause selector"
            : "How strongly agents are told to keep trying rather than give up."
        }
        value={config.persistence}
        display={clauseActive ? "overridden" : `${Math.round(config.persistence * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        disabled={(disabled ?? false) || clauseActive}
        onChange={(v) => onChange({ persistence: v })}
      />
      <Knob
        label="World count"
        hint="Independent parallel worlds. More worlds, better statistics, more model calls."
        value={config.worldCount}
        display={String(config.worldCount)}
        min={1}
        max={20}
        step={1}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ worldCount: v })}
      />
      <Knob
        label="Agents per world"
        hint="Each agent gets its own task and shares one scratch cache."
        value={config.agentsPerWorld}
        display={String(config.agentsPerWorld)}
        min={2}
        max={8}
        step={1}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ agentsPerWorld: v })}
      />
      <Knob
        label="Replicates"
        hint="Independent repetitions of this exact configuration. Rates are pooled across replicates and reported with a 95% Wilson interval."
        value={config.replicates}
        display={`${config.replicates} × ${config.worldCount} = ${config.replicates * config.worldCount} worlds`}
        min={1}
        max={10}
        step={1}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ replicates: v })}
      />
      <Knob
        label="Alert threshold"
        hint="Monitor severity at or above which a human-review countdown starts."
        value={config.alertThreshold}
        display={`sev ${config.alertThreshold}`}
        min={1}
        max={7}
        step={1}
        disabled={disabled ?? false}
        onChange={(v) => onChange({ alertThreshold: v })}
      />

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-xs leading-snug text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5 accent-[var(--primary)]"
            checked={config.sameTasksAcrossReplicates}
            disabled={disabled ?? false}
            onChange={(e) => onChange({ sameTasksAcrossReplicates: e.target.checked })}
          />
          <span>
            <span className="label-caps block text-foreground">Same tasks across replicates</span>
            Off by default, so replicates draw different task instances and results generalise over tasks. On isolates
            model randomness alone.
          </span>
        </label>
        <p className="font-mono text-[11px] text-muted-foreground">
          temperature · agent {config.agentTemperature.toFixed(1)} · monitor {config.monitorTemperature.toFixed(1)} ·
          fixed and recorded, not tuned
        </p>
      </div>

      <div className="space-y-2">
        <Label className="label-caps">Reasoning effort</Label>
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block font-mono text-[11px] text-muted-foreground">agent</span>
            <select
              className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
              value={config.agentReasoningEffort}
              disabled={disabled ?? false}
              onChange={(e) => onChange({ agentReasoningEffort: e.target.value as ReasoningEffort })}
            >
              {REASONING_EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block font-mono text-[11px] text-muted-foreground">monitor</span>
            <select
              className="w-full rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs text-foreground"
              value={config.monitorReasoningEffort}
              disabled={disabled ?? false}
              onChange={(e) => onChange({ monitorReasoningEffort: e.target.value as ReasoningEffort })}
            >
              {REASONING_EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          Sent explicitly on every model call and held constant across all steps, so the gateway default can never move
          the capability axis. Recorded in every export.
        </p>
      </div>
    </div>
  );
}
