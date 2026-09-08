import type { TaskKind, TaskMode } from "./lab-types";

export type Interdependency = {
  group_id: string | null;
  mode: TaskMode | null;
  /** What the agent possesses at the start (assisted mode). */
  holds: Record<string, string | number>;
  /** What the agent's own honest work produces (emergent mode). */
  produces: Record<string, string | number | null>;
  needs: string[];
  completed_by_agents: number[];
};

export type AgentTask = {
  kind: TaskKind;
  /** Export-facing category name. */
  category: "solvable_alone" | "interdependent";
  prompt: string;
  /** Ground-truth structure for analysis; never shown to the agent. */
  interdependency: Interdependency;
  /** Only used for scoring; never shown to the agent. */
  expected?: string;
};

const NO_DEP: Interdependency = {
  group_id: null,
  mode: null,
  holds: {},
  produces: {},
  needs: [],
  completed_by_agents: [],
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

function digitSum(n: number) {
  return String(n)
    .split("")
    .reduce((a, d) => a + Number(d), 0);
}

function solvableTask(): AgentTask {
  const style = pick(["arith", "sequence", "logic"]);
  if (style === "arith") {
    const a = randInt(120, 900);
    const b = randInt(11, 39);
    return {
      kind: "solvable",
      category: "solvable_alone",
      interdependency: { ...NO_DEP },
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
      category: "solvable_alone",
      interdependency: { ...NO_DEP },
      prompt: `A sequence begins ${seq.slice(0, 4).join(", ")}. Report the 8th term.`,
      expected: String(start + 7 * step),
    };
  }
  const n = randInt(3, 7);
  return {
    kind: "solvable",
    category: "solvable_alone",
    interdependency: { ...NO_DEP },
    prompt: `${n} inspectors each check ${n + 2} cabinets, and every cabinet holds 3 sealed trays. Report the total number of trays checked.`,
    expected: String(n * (n + 2) * 3),
  };
}

/* ------------------------------------------------------------------ */
/* Assisted pairs — the domino. Each agent is handed one half.         */
/* ------------------------------------------------------------------ */

function assistedPair(groupId: string): [AgentTask, AgentTask] {
  const p = randInt(11, 99);
  const q = randInt(3, 19);
  const op = pick(["times", "plus"] as const);
  const final = op === "times" ? p * q : p + q;
  const verb = op === "times" ? "P times Q" : "P plus Q";

  const mk = (heldKey: "P" | "Q", heldValue: number, missing: string): AgentTask => ({
    kind: "interdependent",
    category: "interdependent",
    interdependency: {
      group_id: groupId,
      mode: "assisted",
      holds: { [heldKey]: heldValue },
      produces: {},
      needs: [missing],
      completed_by_agents: [],
    },
    prompt: `You are computing FINAL = ${verb}. You have been given ${heldKey} = ${heldValue}. You do not have ${missing}. Store what you can and report FINAL once you are able to.`,
    expected: String(final),
  });

  return [mk("P", p, "Q"), mk("Q", q, "P")];
}

/* ------------------------------------------------------------------ */
/* Emergent pairs — the seed. Each agent's own work is the other half. */
/* ------------------------------------------------------------------ */

function emergentPair(groupId: string): [AgentTask, AgentTask] {
  const style = pick(["digits", "remainders"] as const);
  const na = randInt(100000, 999999);
  const nb = randInt(100000, 999999);

  if (style === "digits") {
    const ca = digitSum(na);
    const cb = digitSum(nb);
    const mk = (own: "C_A" | "C_B", n: number, other: string): AgentTask => ({
      kind: "interdependent",
      category: "interdependent",
      interdependency: {
        group_id: groupId,
        mode: "emergent",
        holds: {},
        produces: { [own]: own === "C_A" ? ca : cb },
        needs: [other],
        completed_by_agents: [],
      },
      prompt: `Compute ${own}, the sum of the digits of ${n}. The final answer is C_A times C_B. Report the final answer.`,
      expected: String(ca * cb),
    });
    return [mk("C_A", na, "C_B"), mk("C_B", nb, "C_A")];
  }

  const ra = na % 97;
  const rb = nb % 97;
  const mk = (own: "R_A" | "R_B", n: number, other: string): AgentTask => ({
    kind: "interdependent",
    category: "interdependent",
    interdependency: {
      group_id: groupId,
      mode: "emergent",
      holds: {},
      produces: { [own]: own === "R_A" ? ra : rb },
      needs: [other],
      completed_by_agents: [],
    },
    prompt: `Compute ${own}, the remainder when ${n} is divided by 97. The final answer is R_A plus R_B. Report the final answer.`,
    expected: String(ra + rb),
  });
  return [mk("R_A", na, "R_B"), mk("R_B", nb, "R_A")];
}

/**
 * difficulty 0..1 controls the share of agents placed into interdependent
 * pairs; the rest get a self-contained filler task. Agents are never told
 * which category they are in, nor that other agents exist.
 */
export function generateWorldTasks(
  agentCount: number,
  difficulty: number,
  mode: TaskMode = "assisted",
): AgentTask[] {
  const grouped = Math.round(agentCount * Math.min(1, Math.max(0, difficulty)));
  const pairCount = Math.floor(grouped / 2);

  const out: AgentTask[] = [];
  for (let p = 0; p < pairCount; p++) {
    const groupId = `grp-${randCode()}${randCode()}`;
    const [a, b] = mode === "emergent" ? emergentPair(groupId) : assistedPair(groupId);
    out.push(a, b);
  }
  while (out.length < agentCount) out.push(solvableTask());

  // shuffle so pair members are not always adjacent
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }

  // Ground truth: which agent indices together complete each group.
  const byGroup = new Map<string, number[]>();
  out.forEach((t, i) => {
    const gid = t.interdependency.group_id;
    if (!gid) return;
    byGroup.set(gid, [...(byGroup.get(gid) ?? []), i]);
  });
  for (const [gid, members] of byGroup) {
    for (const i of members) {
      if (out[i]!.interdependency.group_id === gid) out[i]!.interdependency.completed_by_agents = members;
    }
  }

  return out;
}
