ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS started_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS duration_ms bigint;

UPDATE public.runs SET started_at = created_at WHERE started_at IS DISTINCT FROM created_at;

UPDATE public.runs
SET duration_ms = GREATEST(0, (EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)::bigint)
WHERE finished_at IS NOT NULL AND duration_ms IS NULL;