# Health check report (read-only)

## Security
- **High** — All 17 lab server actions (`createRun`, `stepAgent`, `tickWorld`, `createSweep`, `exportRun`, `importCodings`, etc.) have no auth check and use the service-role client. Anyone can call them directly to start runs (spending Anthropic/AI credits), stop runs, overwrite codings or export all data. Fix: add `requireSupabaseAuth` plus an `is_approved` check to each (admin-only for `importCodings`/`stopSweep`).
- **Medium** — `ANTHROPIC_API_KEY` and `LOVABLE_API_KEY` are only read server-side in `ai.server.ts`. No secrets found in client code (the publishable key is fine). Fix: none needed. Keep it that way.
- **Medium** — Every table has RLS: reads need approval, writes are denied to clients. `account_requests` only allows inserts with `pending` status. `access.functions.ts` uses auth middleware. Fix: none needed. Run the security scanner once to confirm grants.
- **Low** — No Supabase edge functions and no `/api/public` routes, so there are no unauthenticated endpoints beyond the server actions above.

## Reliability
- **High** — The run driver is browser-driven. If the tab closes mid-run, runs and worlds stay `running` forever and inflate progress and ETA. Fix: add a stale-run sweeper that marks runs `stopped` after N minutes without new steps.
- **Medium** — Async scheduler: two tabs, or Split plus the Lab page, can drive the same run at once. That causes duplicate `step_index` and double model calls. Fix: add a unique `(agent_id, step_index)` constraint and a conditional "claim step" update.
- **Medium** — The 45 s timeout and 3 retries per call, plus a per-step monitor and classifier, give a long tail under load. Many worlds in parallel can also hit gateway rate limits (429). Fix: limit concurrency per run in the driver.
- **Medium** — `lab.functions.ts` is about 85 KB in one module, so regressions there are likely. There are no tests for the stats, Wilson CI or the g2 task generator. Fix: add small unit tests for `stats.ts` and `tasks.ts`.
- **Low** — `EFFORT_REJECTED` is an in-memory set per worker isolate. Its state is lost between requests, so the first call per isolate retries. Fix: harmless, or persist the result per model.

## Dead weight
- **Low** — About 46 shadcn UI components and unused packages (`embla-carousel-react`, `input-otp`, `react-day-picker`, `vaul`, `cmdk`, `react-resizable-panels`, likely `react-hook-form`) remain. Fix: remove the unused ones after confirming with `rg`.
- **Low** — `drizzle-kit`, `drizzle-orm` and `drizzle.config.ts` are unused because the schema is managed by migrations. Fix: remove them.
- **Low** — There are overlapping views: `replay.$runId`, `broadcast`, `rooms` and `split`. Fix: decide whether `replay` is still needed.
- **Low** — The `scratch.author_agent_id` and `alerts` tables appear lightly used. Fix: verify their usage before dropping anything.

## Proposed next step (if approved)
Fix the High items only: add auth and approval guards on the lab server actions, and add a stale-run cleanup.
