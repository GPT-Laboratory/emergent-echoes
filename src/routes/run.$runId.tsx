import { createFileRoute } from "@tanstack/react-router";

import { LabView } from "@/components/lab/LabView";

export const Route = createFileRoute("/run/$runId")({
  head: () => ({
    meta: [
      { title: "Run — Emergent Agent Coordination Lab" },
      {
        name: "description",
        content: "A recorded run: its pressure settings, every world, and how often coordination emerged.",
      },
      { property: "og:title", content: "Run — Emergent Agent Coordination Lab" },
      {
        property: "og:description",
        content: "Persisted results for one run of the agent coordination experiment.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RunLab,
});

function RunLab() {
  const { runId } = Route.useParams();
  return <LabView runId={runId} />;
}
