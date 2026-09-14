/**
 * Single config point for the models used by the lab.
 * Swap these ids to change agent / monitor capability.
 */
import {
  AGENT_MODEL_ID,
  MONITOR_MODEL_ID,
  PROVIDER_FIXED_TEMPERATURE,
  anthropicApiId,
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

/**
 * Models observed at runtime to reject `output_config.effort`. Recorded so the
 * export can say "provider-fixed" instead of silently claiming a locked effort.
 */
const EFFORT_REJECTED = new Set<string>();
export function effortRejected(modelId: string): boolean {
  return EFFORT_REJECTED.has(modelId);
}

async function postWithRetry(url: string, init: RequestInit): Promise<Response> {
  let res: Response | null = null;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) });
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
  return res;
}

/**
 * Anthropic Claude via the Messages API. Reasoning effort is `output_config.effort`;
 * temperature is sent explicitly, as for Gemini. No `thinking`, no `budget_tokens`.
 */
async function chatAnthropic(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number | undefined;
  effort: ReasoningEffort;
}): Promise<ChatResult> {
  const key = process.env["ANTHROPIC_API_KEY"];
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY");
  const apiModel = anthropicApiId(opts.model);

  const build = (withEffort: boolean) =>
    JSON.stringify({
      model: apiModel,
      max_tokens: Math.max(opts.maxTokens, 4096),
      ...(withEffort ? { output_config: { effort: opts.effort } } : {}),
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };

  let res = await postWithRetry("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: build(!effortRejected(opts.model)),
  });

  // A model that refuses output_config.effort is recorded, never silently dropped.
  if (res.status === 400 && !effortRejected(opts.model)) {
    const text = await res.text().catch(() => "");
    if (/output_config|effort/i.test(text)) {
      EFFORT_REJECTED.add(opts.model);
      res = await postWithRetry("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: build(false),
      });
    } else {
      throw new GatewayError(400, text.slice(0, 400));
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GatewayError(res.status, text.slice(0, 400) || res.statusText);
  }

  const data = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  return {
    text: (data.content ?? [])
      .filter((b) => b?.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n"),
    usage: {
      tokens_in: num(data.usage?.input_tokens),
      tokens_out: num(data.usage?.output_tokens),
      // The Messages API does not report reasoning tokens separately.
      tokens_reasoning: null,
    },
  };
}

/** Token usage as the provider reported it; null means "not returned". */
export type ChatUsage = { tokens_in: number | null; tokens_out: number | null; tokens_reasoning: number | null };
export type ChatResult = { text: string; usage: ChatUsage };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Text only — kept for callers that do not record usage. */
export async function chat(opts: Parameters<typeof chatDetailed>[0]): Promise<string> {
  return (await chatDetailed(opts)).text;
}

export async function chatDetailed(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Locked per experiment; identical on every step. Never left to the gateway. */
  reasoningEffort?: ReasoningEffort;
}): Promise<ChatResult> {
  const limit = opts.maxTokens ?? 700;
  const canSetTemperature = temperatureSupported(opts.model) && opts.temperature != null;

  // Effort is an experimental factor: send it explicitly on every call so the
  // gateway's per-model default can never silently shift the x-axis.
  const requestedEffort: ReasoningEffort = opts.reasoningEffort ?? "low";
  const effort = normalizeEffortForModel(opts.model, requestedEffort);
  const sendsEffort = reasoningEffortSupported(opts.model);

  if (opts.model.startsWith("anthropic/")) {
    return chatAnthropic({
      model: opts.model,
      system: opts.system,
      user: opts.user,
      maxTokens: limit,
      temperature: canSetTemperature ? opts.temperature : undefined,
      effort,
    });
  }

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  // GPT-5/6-family models take max_completion_tokens (never max_tokens),
  // reject non-default temperature, and gpt-6-astra requires a reasoning effort.
  const isOpenAiReasoning = opts.model.startsWith("openai/");

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


  const res = await postWithRetry(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body,
  });


  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new GatewayError(res.status, text.slice(0, 400) || res.statusText);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      completion_tokens_details?: { reasoning_tokens?: number };
    };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    usage: {
      tokens_in: num(data.usage?.prompt_tokens),
      tokens_out: num(data.usage?.completion_tokens),
      tokens_reasoning: num(data.usage?.completion_tokens_details?.reasoning_tokens),
    },
  };
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
