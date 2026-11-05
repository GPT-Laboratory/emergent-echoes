# Reliability health check (read-only)

Known issues from 2026-10-31:
- Unauthenticated lab server actions: **fixed**. All of them now require an approved user (admin for `importCodings`/`stopSweep`).
- Runs left `running` forever: **still present**. There is no stale-run cleanup.

## Findings
- **High** — `lab.functions.ts` `stepAgent`/`tickWorld`: nothing stops the same agent being stepped twice at once (two tabs, Split plus the Lab page, or a retry after a timeout). That gives duplicate `step_index` values and double model calls. Fix: add a unique `(agent_id, step_index)` constraint and a conditional "claim step" update.
- **Medium** — `LabView.tsx` Run / Sweep buttons (~line 607): they are not disabled while `start()` is still in progress, so a double click creates two runs and two drivers. Fix: keep a `starting` state and disable both buttons while it is set.
- **Medium** — `run-driver.ts` `withRetry`/`driveAsync`: a non-transient failure returns `null`, which the loop treats as done. The agent is dropped but stays `running` in the database. Fix: mark the agent `error` on the server, or keep retrying with backoff.
- **Medium** — `run-driver.ts` `startDriver`: the browser marks the run `complete` even when ticks failed, and the update's error is ignored. Fix: complete the run on the server when the last world closes, and check the result.
- **Medium** — `run-driver.ts` `startSweep`: if `activate`/`startDriver` throws, it rejects without being caught. `finish` never runs, so the experiment stays `running` and `sweepProgress` stays active. Fix: wrap each point in try/catch and call `finish("stopped")` in a `finally`.
- **Medium** — `run-driver.ts`: `sweepProgress` and the driving/cancelled sets are module globals for one tab. A second tab or a reload cannot see or stop the sweep. Fix: read sweep state from the `experiments`/`runs` rows.
- **Medium** — `ai.server.ts` `postWithRetry`: 45 s timeout × 3 attempts, plus monitor and classifier calls in the same step, can push one step past the worker request limit. Fix: lower the timeout or attempt count, or run monitoring after the step returns.
- **Medium** — `lab-client.ts` `useWorldDetail`/`useRunSteps`: each realtime event reloads the whole world or run, and the subscriptions are not filtered by world. With many worlds this creates a flood of reloads, and slower responses can overwrite newer ones. Fix: add a `filter` on world_id/run_id, debounce `load()`, and drop out-of-order responses.
- **Medium** — `lab-client.ts`, `run-driver.ts`, `picker.tsx`, Rooms/Broadcast: returned Supabase `error`s are ignored, so failures look like empty data with no error message. Fix: show an error state when `error` is set.
- **Low** — `lab.functions.ts` (~85 KB in one module): there are no tests for `stats.ts` (Wilson CI) or the g2 generator in `tasks.ts`. Fix: add small unit tests.
- **Low** — `ai.server.ts` `EFFORT_REJECTED` is kept in memory per worker instance, so the first call after a restart repeats the rejected request. Fix: harmless; optionally save it per model.
- **Low** — Effects and timers: every view that creates intervals, listeners or channels also cleans them up, and channel names are unique. No leaks found. Fix: none.
- **Low** — Build and console: the latest build is OK, and there are no runtime or console errors in the logs. The dev server warns that `vite-tsconfig-paths` is redundant. Fix: set `resolve.tsconfigPaths: true` and remove the plugin.
