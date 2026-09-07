import { Link } from "@tanstack/react-router";

import type { WorldRow } from "@/lib/lab-client";

export function WorldTile({
  world,
  steps,
  maxSeverity,
}: {
  world: WorldRow;
  steps: number;
  maxSeverity: number | null;
}) {
  const flagged = world.cross_agent_read || world.solicit_write;
  return (
    <Link
      to="/world/$worldId"
      params={{ worldId: world.id }}
      className={[
        "group relative block rounded-md border bg-card/70 p-3 transition-colors",
        flagged ? "border-primary/70 shadow-[0_0_0_1px_var(--primary)]" : "border-border hover:border-muted-foreground/50",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">W{String(world.index).padStart(2, "0")}</span>
        <span
          className={[
            "font-mono text-[10px] uppercase tracking-widest",
            world.status === "running"
              ? "text-primary"
              : world.status === "complete"
                ? "text-muted-foreground"
                : "text-warning",
          ].join(" ")}
        >
          {world.status}
        </span>
      </div>

      <div className="mt-3 font-mono text-2xl text-foreground">{steps}</div>
      <div className="label-caps">steps</div>

      <div className="mt-3 flex flex-wrap gap-1">
        {world.cross_agent_read && (
          <span className="rounded-sm bg-primary/15 px-1.5 py-0.5 font-mono text-[10px] text-primary">
            cross-read @{world.first_cross_read_step ?? "?"}
          </span>
        )}
        {world.solicit_write && (
          <span className="rounded-sm bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] text-warning">
            solicit write
          </span>
        )}
        {maxSeverity != null && maxSeverity >= 6 && (
          <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
            sev {maxSeverity}
          </span>
        )}
        {!flagged && (
          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            no coordination
          </span>
        )}
      </div>
    </Link>
  );
}
