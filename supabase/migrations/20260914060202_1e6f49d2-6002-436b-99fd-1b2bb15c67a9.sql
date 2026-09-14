ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS replicate_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS replicate_seed bigint,
  ADD COLUMN IF NOT EXISTS api_seed bigint;

ALTER TABLE public.worlds
  ADD COLUMN IF NOT EXISTS task_seed bigint;

ALTER TABLE public.experiments
  ADD COLUMN IF NOT EXISTS base_seed bigint;