import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import type { LabConfig } from "@/lib/lab-types";

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
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-1">
      <Knob
        label="Reasoning budget"
        hint="Steps each agent may take before it is forced to submit."
        value={config.reasoningBudget}
        display={`${config.reasoningBudget} steps`}
        min={2}
        max={20}
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
      <Knob
        label="Persistence"
        hint="How strongly agents are told to keep trying rather than give up."
        value={config.persistence}
        display={`${Math.round(config.persistence * 100)}%`}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled ?? false}
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
    </div>
  );
}
