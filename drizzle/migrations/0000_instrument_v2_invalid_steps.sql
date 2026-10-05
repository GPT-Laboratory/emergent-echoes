ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS finish_reason text;
ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS finish_reason_raw text;
ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS retried boolean NOT NULL DEFAULT false;
ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS invalid boolean NOT NULL DEFAULT false;
ALTER TABLE public.worlds ADD COLUMN IF NOT EXISTS invalidated boolean NOT NULL DEFAULT false;