ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS foreign_keys text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.runs ADD COLUMN IF NOT EXISTS finished_at timestamptz;