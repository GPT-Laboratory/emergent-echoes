import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { WorldDetailView } from "@/components/lab/WorldDetailView";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/run/$runId/world/$worldIndex")({
  head: () => ({
    meta: [
      { title: "World detail — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "Live reasoning, tool calls, shared cache and monitor flags for one world of autonomous agents.",
      },
      { property: "og:title", content: "World detail — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "Watch one world's agents reason, write to a shared cache, and be scored by the monitor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorldRoute,
});

function WorldRoute() {
  const { runId, worldIndex } = Route.useParams();
  const [worldId, setWorldId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("worlds")
        .select("id")
        .eq("run_id", runId)
        .eq("index", Number(worldIndex))
        .maybeSingle();
      if (cancelled) return;
      if (data?.id) setWorldId(data.id as string);
      else setMissing(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, worldIndex]);

  if (missing) {
    return (
      <main className="mx-auto max-w-[1200px] px-5 py-10 text-sm text-muted-foreground">
        No such world in this run.
      </main>
    );
  }
  if (!worldId) {
    return <main className="mx-auto max-w-[1200px] px-5 py-10 text-sm text-muted-foreground">Loading world…</main>;
  }
  return <WorldDetailView worldId={worldId} runId={runId} />;
}
