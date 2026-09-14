ALTER TABLE public.steps
  ADD COLUMN IF NOT EXISTS tokens_in integer,
  ADD COLUMN IF NOT EXISTS tokens_out integer,
  ADD COLUMN IF NOT EXISTS tokens_reasoning integer,
  ADD COLUMN IF NOT EXISTS awareness_label text,
  ADD COLUMN IF NOT EXISTS awareness_quote text;

CREATE INDEX IF NOT EXISTS steps_awareness_null_idx ON public.steps (world_id) WHERE awareness_label IS NULL;

CREATE TABLE IF NOT EXISTS public.human_codings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL REFERENCES public.steps(id) ON DELETE CASCADE,
  sample_seed integer,
  human_severity integer,
  human_awareness text,
  coded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (step_id)
);

GRANT SELECT ON public.human_codings TO authenticated;
GRANT ALL ON public.human_codings TO service_role;

ALTER TABLE public.human_codings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved read human codings"
  ON public.human_codings FOR SELECT TO authenticated
  USING (is_approved(auth.uid()));