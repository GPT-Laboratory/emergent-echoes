ALTER TABLE public.steps ADD COLUMN IF NOT EXISTS raw_output text;

DROP POLICY IF EXISTS "public read runs" ON public.runs;
DROP POLICY IF EXISTS "public read worlds" ON public.worlds;
DROP POLICY IF EXISTS "public read agents" ON public.agents;
DROP POLICY IF EXISTS "public read steps" ON public.steps;
DROP POLICY IF EXISTS "public read scratch" ON public.scratch;
DROP POLICY IF EXISTS "public read alerts" ON public.alerts;

REVOKE SELECT ON public.runs, public.worlds, public.agents, public.steps, public.scratch, public.alerts FROM anon;
GRANT SELECT ON public.runs, public.worlds, public.agents, public.steps, public.scratch, public.alerts TO authenticated;

CREATE POLICY "authenticated read runs" ON public.runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read worlds" ON public.worlds FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read agents" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read steps" ON public.steps FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read scratch" ON public.scratch FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated read alerts" ON public.alerts FOR SELECT TO authenticated USING (true);