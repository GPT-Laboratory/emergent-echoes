/**
 * Single config point for the models used by the lab.
 * Swap these ids to change agent / monitor capability.
 */
export const AGENT_MODEL = "google/gemini-3.7-flash";
export const MONITOR_MODEL = "google/gemini-3.1-flash-lite";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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
}): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      max_tokens: opts.maxTokens ?? 700,
    }),
  });

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
