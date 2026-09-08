CREATE OR REPLACE FUNCTION public.set_run_duration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.finished_at IS NOT NULL THEN
    NEW.duration_ms := GREATEST(0, (EXTRACT(EPOCH FROM (NEW.finished_at - COALESCE(NEW.started_at, NEW.created_at))) * 1000)::bigint);
  ELSE
    NEW.duration_ms := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS runs_set_duration ON public.runs;
CREATE TRIGGER runs_set_duration
BEFORE INSERT OR UPDATE OF finished_at, started_at ON public.runs
FOR EACH ROW EXECUTE FUNCTION public.set_run_duration();