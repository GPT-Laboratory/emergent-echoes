/** Turns a run export object into a downloaded, pretty-printed JSON file. */
export function downloadRunJson(runId: string, doc: unknown) {
  const stamp = new Date().toISOString();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `run-${runId}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Same, for a whole sweep experiment. */
export function downloadSweepJson(experimentId: string, doc: unknown) {
  const stamp = new Date().toISOString();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sweep-${experimentId}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
