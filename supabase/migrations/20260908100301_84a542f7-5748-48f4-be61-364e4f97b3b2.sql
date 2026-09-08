CREATE TABLE public.experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL DEFAULT 'persistence_sweep',
  task_mode text NOT NULL DEFAULT 'assisted',
  fixed_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sweep_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'running',
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  finished_at timestamp with time zone,
  duration_ms bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.experiments TO authenticated;
GRANT ALL ON public.experiments TO service_role;

ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read experiments"
  ON public.experiments FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_experiment_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.finished_at IS NOT NULL THEN
    NEW.duration_ms := GREATEST(0, (EXTRACT(EPOCH FROM (NEW.finished_at - NEW.started_at)) * 1000)::bigint);
  ELSE
    NEW.duration_ms := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER experiments_set_duration
BEFORE INSERT OR UPDATE OF finished_at, started_at ON public.experiments
FOR EACH ROW EXECUTE FUNCTION public.set_experiment_duration();

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS experiment_id uuid REFERENCES public.experiments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sweep_value numeric;

CREATE INDEX IF NOT EXISTS runs_experiment_id_idx ON public.runs(experiment_id);