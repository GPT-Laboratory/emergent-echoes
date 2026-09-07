CREATE TABLE public.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  label text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'idle'
);

CREATE TABLE public.worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  index int NOT NULL,
  status text NOT NULL DEFAULT 'running',
  cross_agent_read boolean NOT NULL DEFAULT false,
  solicit_write boolean NOT NULL DEFAULT false,
  first_cross_read_step int,
  first_flag_step int,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  index int NOT NULL,
  task jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'running',
  step_count int NOT NULL DEFAULT 0,
  answer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.scratch (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  key text NOT NULL,
  value text NOT NULL,
  author_agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (world_id, key)
);

CREATE TABLE public.steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  step_index int NOT NULL,
  reasoning text,
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  observation text,
  cross_agent_read boolean NOT NULL DEFAULT false,
  monitor_severity int,
  monitor_label text,
  monitor_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES public.worlds(id) ON DELETE CASCADE,
  step_id uuid REFERENCES public.steps(id) ON DELETE CASCADE,
  severity int NOT NULL,
  label text NOT NULL,
  human_action text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_worlds_run ON public.worlds(run_id);
CREATE INDEX idx_agents_world ON public.agents(world_id);
CREATE INDEX idx_scratch_world ON public.scratch(world_id);
CREATE INDEX idx_steps_world ON public.steps(world_id);
CREATE INDEX idx_steps_agent ON public.steps(agent_id);
CREATE INDEX idx_alerts_world ON public.alerts(world_id);

GRANT SELECT ON public.runs TO anon, authenticated;
GRANT SELECT ON public.worlds TO anon, authenticated;
GRANT SELECT ON public.agents TO anon, authenticated;
GRANT SELECT ON public.scratch TO anon, authenticated;
GRANT SELECT ON public.steps TO anon, authenticated;
GRANT SELECT ON public.alerts TO anon, authenticated;
GRANT ALL ON public.runs TO service_role;
GRANT ALL ON public.worlds TO service_role;
GRANT ALL ON public.agents TO service_role;
GRANT ALL ON public.scratch TO service_role;
GRANT ALL ON public.steps TO service_role;
GRANT ALL ON public.alerts TO service_role;

ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worlds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scratch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read runs" ON public.runs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read worlds" ON public.worlds FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read agents" ON public.agents FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read scratch" ON public.scratch FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read steps" ON public.steps FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public read alerts" ON public.alerts FOR SELECT TO anon, authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.scratch;
ALTER PUBLICATION supabase_realtime ADD TABLE public.steps;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.worlds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;