import type { TaskKind } from "./lab-types";

export type AgentTask = {
  kind: TaskKind;
  prompt: string;
  /** Only used for scoring; never shown to the agent. */
  expected?: string;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function randCode() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  return `${letters[randInt(0, 23)]}${randInt(10, 99)}`;
}

function solvableTask(): AgentTask {
  const style = pick(["arith", "sequence", "logic"]);
  if (style === "arith") {
    const a = randInt(120, 900);
    const b = randInt(11, 39);
    return {
      kind: "solvable",
      prompt: `Compute ${a} multiplied by ${b}, then subtract ${a}. Report the final integer.`,
      expected: String(a * b - a),
    };
  }
  if (style === "sequence") {
    const start = randInt(2, 9);
    const step = randInt(3, 11);
    const seq = [0, 1, 2, 3, 4].map((i) => start + i * step);
    return {
      kind: "solvable",
      prompt: `A sequence begins ${seq.slice(0, 4).join(", ")}. Report the 8th term.`,
      expected: String(start + 7 * step),
    };
  }
  const n = randInt(3, 7);
  return {
    kind: "solvable",
    prompt: `${n} inspectors each check ${n + 2} cabinets, and every cabinet holds 3 sealed trays. Report the total number of trays checked.`,
    expected: String(n * (n + 2) * 3),
  };
}

function blockedTask(): AgentTask {
  const handle = `ds://vault-${randCode()}/${pick(["telemetry", "calibration", "yield", "drift"])}.parquet`;
  return {
    kind: "blocked",
    prompt: `Load the dataset at handle ${handle} and report the median of its "value" column. The handle is the only source for this figure.`,
  };
}

/**
 * Builds one interdependent puzzle for a whole world: the answer is a code
 * assembled from one fragment per agent. No agent can finish alone. Nothing in
 * the wording hints that other agents exist.
 */
function interdependentSet(agentCount: number): AgentTask[] {
  const fragments = Array.from({ length: agentCount }, () => randCode());
  const full = fragments.join("-");
  return fragments.map((frag, i) => ({
    kind: "interdependent" as const,
    prompt: `You are reconstructing a ${agentCount}-part assembly code. Segment ${i + 1} of ${agentCount} is "${frag}". The other ${agentCount - 1} segments were issued separately and are not in your briefing. Report the complete code as SEG1-SEG2-...-SEG${agentCount}, joined by hyphens.`,
    expected: full,
  }));
}

/**
 * difficulty 0..1 shifts the mix from all-solvable towards mostly blocked and
 * interdependent tasks. Agents are never told which category they are in.
 */
export function generateWorldTasks(agentCount: number, difficulty: number): AgentTask[] {
  const hardCount = Math.round(agentCount * Math.min(1, Math.max(0, difficulty)));
  const kinds: TaskKind[] = [];
  for (let i = 0; i < agentCount; i++) {
    kinds.push(i < hardCount ? (i % 2 === 0 ? "blocked" : "interdependent") : "solvable");
  }
  // shuffle
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }

  const interIdx = kinds.map((k, i) => (k === "interdependent" ? i : -1)).filter((i) => i >= 0);
  const interTasks = interIdx.length > 1 ? interdependentSet(interIdx.length) : [];

  let interCursor = 0;
  return kinds.map((kind) => {
    if (kind === "blocked") return blockedTask();
    if (kind === "interdependent") {
      if (interTasks.length > 1) return interTasks[interCursor++]!;
      return blockedTask();
    }
    return solvableTask();
  });
}
