/**
 * Model prices, USD per million tokens. One place, editable by hand.
 * A model missing here yields a null cost — never a guessed one.
 */
export type Price = { in: number; out: number };

export const MODEL_PRICES: Record<string, Price> = {
  "openai/gpt-6-astra": { in: 1.25, out: 10 },
  "openai/gpt-5.6-sol": { in: 1.25, out: 10 },
  "openai/gpt-5.6-terra": { in: 0.6, out: 4 },
  "openai/gpt-5.6-luna": { in: 0.25, out: 2 },
  "openai/gpt-5.5-pro": { in: 15, out: 120 },
  "openai/gpt-5.5": { in: 1.25, out: 10 },
  "openai/gpt-5.4": { in: 1.25, out: 10 },
  "openai/gpt-5.4-mini": { in: 0.25, out: 2 },
  "openai/gpt-5.4-nano": { in: 0.05, out: 0.4 },
  "openai/gpt-5-nano": { in: 0.05, out: 0.4 },
  "google/gemini-3.1-pro-preview": { in: 1.25, out: 10 },
  "google/gemini-3.8-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.7-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3.6-flash": { in: 0.3, out: 2.5 },
  "google/gemini-3-flash-preview": { in: 0.3, out: 2.5 },
  "google/gemini-3.1-flash-lite": { in: 0.1, out: 0.4 },
  "anthropic/claude-opus-5": { in: 15, out: 75 },
  "anthropic/claude-sonnet-5": { in: 3, out: 15 },
  "anthropic/claude-fable-5-1": { in: 3, out: 15 },
  "anthropic/claude-haiku-4-5-20251001": { in: 1, out: 5 },
};

export type TokenTotals = { tokens_in: number | null; tokens_out: number | null; tokens_reasoning: number | null };

/** USD for one token bundle, or null when the model has no price entry or no usage. */
export function estimateCostUsd(model: string, totals: TokenTotals): number | null {
  const p = MODEL_PRICES[model];
  if (!p) return null;
  if (totals.tokens_in == null && totals.tokens_out == null) return null;
  const cost = ((totals.tokens_in ?? 0) * p.in + (totals.tokens_out ?? 0) * p.out) / 1_000_000;
  return Math.round(cost * 1e6) / 1e6;
}

/** Sum token bundles, keeping null (= "provider returned no usage") distinct from 0. */
export function sumTokens(parts: ReadonlyArray<Partial<TokenTotals>>): TokenTotals {
  const add = (key: keyof TokenTotals): number | null => {
    const vals = parts.map((p) => p[key]).filter((v): v is number => typeof v === "number");
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  return { tokens_in: add("tokens_in"), tokens_out: add("tokens_out"), tokens_reasoning: add("tokens_reasoning") };
}
