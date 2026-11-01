# Security health check (read-only)

## Previously known issues
- **Fixed** — Unauthenticated lab server actions: all 18 now require a signed-in, approved user. `importCodings` and `stopSweep` are admin-only, and every action validates its input.
- **High, still present** — Browser-driven runs can stay `running` forever. There is still no stale-run sweeper. Fix: mark a run/world/agent `stopped` when it has had no new step for N minutes, on read or on a schedule.

## Findings
- **Medium** — Any approved user can spend AI credits without limit: up to 20 worlds × 8 agents × 30 steps × 10 replicates, plus repeated sweeps, with no per-user quota or concurrency cap. Fix: add a per-user active-run limit and a daily step/cost cap checked in `createRun`/`createSweep`/`stepAgent`.
- **Medium** — `stopRun`, `activateRun`, `finishExperiment` and `recordHumanAction` let any approved user change anyone's run. Runs have no owner column. Fix: add `created_by` to runs/experiments, and allow only the owner or an admin to change them.
- **Medium** — `stepAgent`/`tickWorld` accept any agent or world ID, with no check that the run is still running and not already being stepped. Repeated calls cost model credits twice. Fix: refuse when the run is not `running`, and claim the step atomically using a unique `(agent_id, step_index)`.
- **Low** — Linter: `has_role` and `is_approved` are SECURITY DEFINER and callable by signed-in users. Each only answers yes/no about a user ID you pass in, so another user's role or approval status can be checked. Fix: accept this, or wrap them so they only check `auth.uid()`.
- **Low** — RLS: all lab tables have RLS on, reads are approved-only, and client writes are denied. `account_requests` inserts are limited to own row + `pending`, and only admins can decide. Fix: none.
- **Low** — Secrets: `ANTHROPIC_API_KEY`, `LOVABLE_API_KEY` and the service-role key are read only in server-only modules. `prompt-spec.ts` mentions the key name only as text, not its value. Fix: none.
- **Low** — No edge functions and no `/api/public` routes, so there are no unauthenticated HTTP endpoints. Fix: none.
- **Low** — `decideAccessRequest` checks admin by reading `user_roles` itself instead of using the shared `requireAdmin` middleware. Fix: switch to `requireAdmin` for consistency.
- **Low** — Exports return all reasoning and raw outputs to any approved user. This is intended for approved users, but approval is the only barrier. Fix: keep approval strict, and optionally limit bulk export to admins.

## Suggested next step (if approved)
Add the stale-run sweeper and a per-user run/cost cap.
