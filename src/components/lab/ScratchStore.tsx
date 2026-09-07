import type { AgentRow, ScratchRow } from "@/lib/lab-client";

export function ScratchStore({ scratch, agents }: { scratch: ScratchRow[]; agents: AgentRow[] }) {
  const label = (id: string | null) => {
    const a = agents.find((x) => x.id === id);
    return a ? `agent ${a.index}` : "unknown";
  };

  return (
    <div className="rounded-md border border-border bg-card/70">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="label-caps">Shared scratch cache</span>
        <span className="font-mono text-[10px] text-muted-foreground">{scratch.length} keys</span>
      </div>
      <div className="max-h-[300px] divide-y divide-border overflow-y-auto">
        {scratch.length === 0 && (
          <p className="px-3 py-4 font-mono text-xs text-muted-foreground">cache is empty</p>
        )}
        {scratch.map((row) => (
          <div key={row.id} className="px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-mono text-xs text-primary">{row.key}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {label(row.author_agent_id)} · {new Date(row.created_at).toLocaleTimeString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-foreground/80">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
