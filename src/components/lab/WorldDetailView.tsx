import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { AgentPanel } from "@/components/lab/AgentPanel";
import { ScratchStore } from "@/components/lab/ScratchStore";
import { Button } from "@/components/ui/button";
import { useWorldDetail } from "@/lib/lab-client";
import { recordHumanAction, stopRun } from "@/lib/lab.functions";
import { supabase } from "@/integrations/supabase/client";

export function WorldDetailView({ worldId, runId }: { worldId: string; runId: string }) {

  const { world, agents, steps, scratch, alerts } = useWorldDetail(worldId);
  const doHuman = useServerFn(recordHumanAction);
  const doStop = useServerFn(stopRun);

  const openAlert = alerts.find((a) => a.human_action == null) ?? null;
  const [remaining, setRemaining] = useState<number | null>(null);
  const [hesitationBase, setHesitationBase] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(20);
  const [defaultAction, setDefaultAction] = useState<"no_action" | "stop_world">("no_action");

  useEffect(() => {
    if (!world) return;
    void supabase
      .from("runs")
      .select("config")
      .eq("id", world.run_id)
      .maybeSingle()
      .then(({ data }) => {
        const cfg = (data?.config ?? {}) as { humanTimerSeconds?: number; defaultHumanAction?: string };
        if (cfg.humanTimerSeconds) setTimerSeconds(cfg.humanTimerSeconds);
        if (cfg.defaultHumanAction === "stop_world") setDefaultAction("stop_world");
      });
  }, [world]);

  useEffect(() => {
    if (!openAlert) {
      setRemaining(null);
      setHesitationBase(null);
      return;
    }
    setHesitationBase(steps.length);
    setRemaining(timerSeconds);
    const started = Date.now();
    const id = setInterval(() => {
      const left = timerSeconds - Math.floor((Date.now() - started) / 1000);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(id);
        void doHuman({ data: { alertId: openAlert.id, action: defaultAction } });
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openAlert?.id, timerSeconds, defaultAction]);

  const hesitationSteps = hesitationBase == null ? 0 : Math.max(0, steps.length - hesitationBase);

  const headline = useMemo(() => {
    const firstFlag = steps.find((s) => (s.monitor_severity ?? 0) >= 4);
    const firstCross = steps.find((s) => s.cross_agent_read);
    return {
      flag: firstFlag ? firstFlag.step_index : null,
      cross: firstCross ? firstCross.step_index : null,
    };
  }, [steps]);

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Link
          to="/run/$runId"
          params={{ runId }}
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
        >
          ← Back to this run
        </Link>
        <h1 className="font-mono text-sm text-foreground">
          WORLD {world ? String(world.index).padStart(2, "0") : "…"}
          <span className="ml-3 text-muted-foreground">{world?.status}</span>
        </h1>
        <p className="font-mono text-xs text-muted-foreground">
          first monitor flag at step {headline.flag ?? "—"} · first cross-agent read at step{" "}
          <span className="text-primary">{headline.cross ?? "—"}</span>
        </p>
        {world && (
          <Button
            variant="destructive"
            className="ml-auto font-mono text-xs uppercase tracking-widest"
            onClick={() => doStop({ data: { runId: world.run_id } })}
          >
            Stop run now
          </Button>
        )}
      </div>

      {openAlert && (
        <div className="mb-5 rounded-md border border-destructive/60 bg-destructive/10 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-mono text-sm text-destructive">
              ALERT · severity {openAlert.severity} · {openAlert.label}
            </span>
            <span className="font-mono text-xs text-foreground">
              human review closes in {Math.max(0, remaining ?? 0)}s
            </span>
            <span className="font-mono text-xs text-warning">
              collective advanced {hesitationSteps} step(s) while waiting
            </span>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="font-mono text-xs"
                onClick={() => doHuman({ data: { alertId: openAlert.id, action: "no_action" } })}
              >
                No action
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="font-mono text-xs"
                onClick={() => doHuman({ data: { alertId: openAlert.id, action: "stop_world" } })}
              >
                Stop this world
              </Button>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Default on expiry: {defaultAction === "no_action" ? "no action, let it run" : "stop this world"}.
          </p>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <AgentPanel key={a.id} agent={a} steps={steps} />
          ))}
        </div>

        <div className="space-y-4">
          <ScratchStore scratch={scratch} agents={agents} />

          <div className="rounded-md border border-border bg-card/70">
            <div className="border-b border-border px-3 py-2">
              <span className="label-caps">Monitor feed</span>
            </div>
            <div className="max-h-[380px] divide-y divide-border overflow-y-auto">
              {steps.length === 0 && (
                <p className="px-3 py-4 font-mono text-xs text-muted-foreground">no steps yet</p>
              )}
              {[...steps]
                .reverse()
                .slice(0, 60)
                .map((s) => (
                  <div key={s.id} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        agent {agents.find((a) => a.id === s.agent_id)?.index ?? "?"} · step {s.step_index}
                      </span>
                      <span
                        className={[
                          "font-mono text-[11px]",
                          (s.monitor_severity ?? 0) >= 6
                            ? "text-destructive"
                            : (s.monitor_severity ?? 0) >= 4
                              ? "text-warning"
                              : "text-muted-foreground",
                        ].join(" ")}
                      >
                        sev {s.monitor_severity ?? "—"}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/85">{s.monitor_label ?? "unscored"}</p>
                    {s.monitor_note && <p className="text-[11px] text-muted-foreground">{s.monitor_note}</p>}
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
