import type { AgentRow, StepRow } from "@/lib/lab-client";

function severityClasses(sev: number | null) {
  if (sev == null) return "border-border text-muted-foreground";
  if (sev >= 6) return "border-destructive/60 text-destructive";
  if (sev >= 4) return "border-warning/60 text-warning";
  if (sev >= 2) return "border-primary/40 text-primary";
  return "border-border text-muted-foreground";
}

function actionLine(action: Record<string, unknown>) {
  const tool = String(action["tool"] ?? "?");
  if (tool === "read" || tool === "write") return `${tool}("${String(action["key"] ?? "")}")`;
  if (tool === "submit") return `submit("${String(action["answer"] ?? "")}")`;
  return `${tool}()`;
}

export function AgentPanel({ agent, steps }: { agent: AgentRow; steps: StepRow[] }) {
  const mine = steps.filter((s) => s.agent_id === agent.id).sort((a, b) => a.step_index - b.step_index);

  return (
    <div className="flex min-h-0 flex-col rounded-md border border-border bg-card/70">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="font-mono text-xs text-foreground">AGENT {agent.index}</span>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {agent.status} · {agent.step_count} steps
        </span>
      </div>
      <div className="border-b border-border px-3 py-2 text-xs leading-snug text-muted-foreground">
        {agent.task?.prompt ?? "—"}
      </div>
      <div className="max-h-[420px] flex-1 space-y-2 overflow-y-auto p-3">
        {mine.length === 0 && <p className="font-mono text-xs text-muted-foreground">awaiting first step…</p>}
        {mine.map((s) => (
          <div key={s.id} className={`rounded-sm border-l-2 bg-background/40 p-2 ${severityClasses(s.monitor_severity)}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-muted-foreground">step {s.step_index}</span>
              <span className="font-mono text-[10px]">
                {s.monitor_severity != null ? `sev ${s.monitor_severity} · ${s.monitor_label}` : "unscored"}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-snug text-foreground/90">
              {s.reasoning || "(no reasoning returned)"}
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-primary">{actionLine(s.action)}</p>
            {s.observation && (
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{s.observation}</p>
            )}
            {s.cross_agent_read && (
              <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-warning">
                read a key it did not write
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
