/**
 * Single config point for the models used by the lab.
 * Swap these ids to change agent / monitor capability.
 */
import {
  AGENT_MODEL_ID,
  MONITOR_MODEL_ID,
  PROVIDER_FIXED_TEMPERATURE,
  normalizeEffortForModel,
  reasoningEffortSupported,
  temperatureSupported,
  type ReasoningEffort,
} from "./lab-types";

export { effectiveReasoningEffort } from "./lab-types";

export const AGENT_MODEL = AGENT_MODEL_ID;
export const MONITOR_MODEL = MONITOR_MODEL_ID;

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

/**
 * What temperature was actually in force: the requested number, or the string
 * "provider-fixed" when the model rejects the parameter.
 */
export function effectiveTemperature(model: string, requested: number): number | "provider-fixed" {
  return temperatureSupported(model) ? requested : "provider-fixed";
}

export const PROVIDER_DEFAULT_TEMPERATURE = PROVIDER_FIXED_TEMPERATURE;

export class GatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function chat(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Locked per experiment; identical on every step. Never left to the gateway. */
  reasoningEffort?: ReasoningEffort;
}): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  // GPT-5/6-family models take max_completion_tokens (never max_tokens),
  // reject non-default temperature, and gpt-6-astra requires a reasoning effort.
  const isOpenAiReasoning = opts.model.startsWith("openai/");
  const limit = opts.maxTokens ?? 700;
  const canSetTemperature = temperatureSupported(opts.model) && opts.temperature != null;

  // Effort is an experimental factor: send it explicitly on every call so the
  // gateway's per-model default can never silently shift the x-axis.
  const requestedEffort: ReasoningEffort = opts.reasoningEffort ?? "low";
  const effort = normalizeEffortForModel(opts.model, requestedEffort);
  const sendsEffort = reasoningEffortSupported(opts.model);

  const body = JSON.stringify({
    model: opts.model,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
    ...(canSetTemperature ? { temperature: opts.temperature } : {}),
    ...(isOpenAiReasoning
      ? { max_completion_tokens: Math.max(limit, 2000), reasoning_effort: effort }
      : { max_tokens: limit }),
    // Non-OpenAI models route through OpenRouter, which takes `reasoning`.
    ...(sendsEffort && !isOpenAiReasoning ? { reasoning: { effort } } : {}),
  });

  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": key,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body,
        signal: AbortSignal.timeout(45_000),
      });
    } catch (e) {
      lastErr = e;
      res = null;
    }
    // Retry transient network failures and gateway congestion.
    if (res && !(res.status === 429 || res.status >= 500)) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }

  if (!res) {
    throw new GatewayError(0, lastErr instanceof Error ? lastErr.message : "Network error contacting model");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GatewayError(res.status, text.slice(0, 400) || res.statusText);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}

/** Tolerant JSON extraction — models occasionally wrap output in prose or fences. */
export function extractJson<T = Record<string, unknown>>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
