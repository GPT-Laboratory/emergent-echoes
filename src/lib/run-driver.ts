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

      const concurrency = 4;
      for (let i = 0; i < ids.length; i += concurrency) {
        if (cancelled.has(runId)) break;
        await Promise.all(
          ids.slice(i, i + concurrency).map(async (worldId) => {
            try {
              await tick({ data: { worldId } });
            } catch (e) {
              onError?.(e instanceof Error ? e.message : String(e));
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
