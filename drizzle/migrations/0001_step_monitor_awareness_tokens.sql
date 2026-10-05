ALTER TABLE public.steps
  ADD COLUMN IF NOT EXISTS monitor_tokens_in integer,
  ADD COLUMN IF NOT EXISTS monitor_tokens_out integer,
  ADD COLUMN IF NOT EXISTS awareness_tokens_in integer,
  ADD COLUMN IF NOT EXISTS awareness_tokens_out integer;