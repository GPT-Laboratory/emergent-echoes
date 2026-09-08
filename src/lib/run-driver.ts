import { supabase } from "@/integrations/supabase/client";

/**
 * The tick loop lives outside React so that navigating between screens never
 * starts, stops, or restarts a run. Only the START RUN button starts a driver.
 */

type Tick = (args: { data: { worldId: string } }) => Promise<unknown>;

const driving = new Set<string>();
const cancelled = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeDrivers(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isDriving(runId: string | null) {
  return runId != null && driving.has(runId);
}

export function cancelDriver(runId: string) {
  cancelled.add(runId);
}

export async function startDriver(runId: string, tick: Tick, onError?: (msg: string) => void) {
  if (driving.has(runId)) return;
  driving.add(runId);
  cancelled.delete(runId);
  emit();

  try {
    for (;;) {
      if (cancelled.has(runId)) break;
      const { data: active } = await supabase
        .from("worlds")
        .select("id")
        .eq("run_id", runId)
        .eq("status", "running");
      const ids = (active ?? []).map((w) => w.id as string);
      if (!ids.length) break;

      const concurrency = 2;
      for (let i = 0; i < ids.length; i += concurrency) {
        if (cancelled.has(runId)) break;
        await Promise.all(
          ids.slice(i, i + concurrency).map(async (worldId) => {
            // Transient connection drops are common with long model calls;
            // retry a few times before surfacing anything to the operator.
            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                await tick({ data: { worldId } });
                return;
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                const transient = /network|fetch|load failed|timeout|abort|502|503|504|429/i.test(msg);
                if (!transient || attempt === 2) {
                  onError?.(msg);
                  return;
                }
                await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              }
            }
          }),
        );
      }
    }
    if (!cancelled.has(runId)) {
      await supabase
        .from("runs")
        .update({ status: "complete", finished_at: new Date().toISOString() })
        .eq("id", runId)
        .eq("status", "running");
    }
  } finally {
    driving.delete(runId);
    cancelled.delete(runId);
    emit();
  }
}

/* ------------------------------------------------------------------ */
/* Sweep batches: several runs, one after another, one per knob point. */
/* ------------------------------------------------------------------ */

export type SweepProgress = {
  experimentId: string;
  pointIndex: number;
  totalPoints: number;
  persistence: number;
  worldsDone: number;
  worldsTotal: number;
  finished: boolean;
};

let sweepProgress: SweepProgress | null = null;
const sweepCancelled = new Set<string>();

export function getSweepProgress() {
  return sweepProgress;
}

export function cancelSweep(experimentId: string) {
  sweepCancelled.add(experimentId);
  if (sweepProgress?.experimentId === experimentId) sweepProgress = { ...sweepProgress, finished: true };
  emit();
}

export async function startSweep(
  experimentId: string,
  points: Array<{ runId: string; persistence: number }>,
  deps: {
    tick: Tick;
    activate: (args: { data: { runId: string } }) => Promise<unknown>;
    finish: (args: { data: { experimentId: string; status: "complete" | "stopped" } }) => Promise<unknown>;
  },
  onError?: (msg: string) => void,
) {
  sweepCancelled.delete(experimentId);

  for (let i = 0; i < points.length; i++) {
    if (sweepCancelled.has(experimentId)) break;
    const point = points[i]!;
    sweepProgress = {
      experimentId,
      pointIndex: i,
      totalPoints: points.length,
      persistence: point.persistence,
      worldsDone: 0,
      worldsTotal: 0,
      finished: false,
    };
    emit();

    await deps.activate({ data: { runId: point.runId } });

    let polling = true;
    const poll = (async () => {
      while (polling) {
        const { data } = await supabase.from("worlds").select("status").eq("run_id", point.runId);
        const rows = data ?? [];
        const done = rows.filter((w) => w.status !== "running").length;
        if (sweepProgress?.experimentId === experimentId) {
          sweepProgress = { ...sweepProgress, worldsDone: done, worldsTotal: rows.length };
          emit();
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
    })();

    await startDriver(point.runId, deps.tick, onError);
    polling = false;
    await poll.catch(() => null);
  }

  const stopped = sweepCancelled.has(experimentId);
  await deps.finish({ data: { experimentId, status: stopped ? "stopped" : "complete" } }).catch(() => null);
  sweepCancelled.delete(experimentId);
  if (sweepProgress?.experimentId === experimentId) sweepProgress = { ...sweepProgress, finished: true };
  emit();
}
