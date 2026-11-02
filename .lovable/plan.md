# Health check reports (read-only)

## Reliability
- **High** — `run-driver.ts`: runs are driven by the browser. Closing the tab leaves runs, worlds and agents `running` forever, so progress, ETA and pooled stats are wrong. Fix: add a stale-run sweeper that stops runs with no new step for N minutes.
- **High** — `lab.functions.ts` `stepAgent`/`tickWorld`: nothing stops the same agent being stepped twice at once (two tabs, Split plus the Lab page, or a retry after a timeout). That can give duplicate `step_index` values and double model calls. Fix: add a unique `(agent_id, step_index)` constraint and a conditional "claim step" update.
- **Medium** — `LabView.tsx` Run / Sweep buttons: they are not disabled while `start()` is still in progress. A double click creates two runs and two drivers. Fix: keep a `starting` state and disable both buttons while it is set.
- **Medium** — `run-driver.ts` `withRetry`: if a step fails for a non-transient reason, it returns `null`. The async loop then treats that as done and drops the agent, which stays `running` in the database. Fix: on a final failure, mark the agent `error` on the server, or keep retrying with backoff.
- **Medium** — `run-driver.ts` `startDriver`: the run is marked `complete` in the browser even if ticks failed, and the `.update()` result is never checked. Fix: complete the run on the server when the last world closes, and check the error.
- **Medium** — `run-driver.ts` `startSweep`: if `activate` throws (for example an auth error), it rejects without being caught. The sweep is never finished and `sweepProgress` stays active. Fix: wrap each point in try/catch and call `finish("stopped")` from a `finally`.
- **Medium** — `run-driver.ts`: `sweepProgress` and the driving/cancelled sets are module globals for one tab. A second tab cannot see or stop a sweep. Fix: read sweep state from `experiments`/`runs` in the database.
- **Medium** — `ai.server.ts`: 45 s timeout × 3 attempts, plus monitor and classifier calls per step, can push one step past the worker request limit. Fix: lower the timeout or the attempt count, or move monitoring off the critical path.
- **Medium** — `lab.functions.ts` (~85 KB in one module) has no tests for `stats.ts` (Wilson CI) or the g2 generator in `tasks.ts`. Fix: add small unit tests for these.
- **Low** — Many Supabase calls in `run-driver.ts`, `picker.tsx` and the Rooms/Broadcast views ignore the returned `error`, so failures show up as empty data instead of an error message. Fix: show an error state when `error` is set.
- **Low** — Timers and live-update connections: every view that creates them also cleans them up, and channel names are now unique. No leaks found. Fix: none.
- **Low** — `ai.server.ts` `EFFORT_REJECTED` is in memory for each worker instance, so the first call after a restart repeats the rejected request. Fix: harmless; optionally save it per model.
- **Low** — Build and console: the latest build is OK, and there are no runtime or console errors in the logs. The dev server warns that `vite-tsconfig-paths` is redundant. Fix: use `resolve.tsconfigPaths: true` and remove the plugin.

## Security (previous report)
- **Fixed** — Lab server actions now require a signed-in, approved user (admin for `importCodings`/`stopSweep`), with input validation.
- **Medium** — There is no per-user cap on AI spend, and runs have no owner, so any approved user can stop or change anyone's run. Fix: add a quota and a `created_by` owner check.
- **Low** — `has_role`/`is_approved` are SECURITY DEFINER functions that signed-in users can call. RLS is on for every table, no secrets are in browser code, and there are no public endpoints.
