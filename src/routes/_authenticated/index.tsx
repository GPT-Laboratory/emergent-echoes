import { createFileRoute } from "@tanstack/react-router";

import { LabView } from "@/components/lab/LabView";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Lab — Emergent Agent Coordination" },
      {
        name: "description",
        content:
          "Run parallel worlds of autonomous agents and measure how often coordination emerges as pressure rises.",
      },
      { property: "og:title", content: "Lab — Emergent Agent Coordination" },
      {
        property: "og:description",
        content: "A live propensity meter for spontaneous coordination between LLM agents.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LabView runId={null} />,
});
