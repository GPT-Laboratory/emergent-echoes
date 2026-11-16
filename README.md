# Emergent Echoes: the reference lab

This repository holds the source of the **reference lab**, the environment in which the reference runs of the following paper were made:

> Abrahamsson, P., Waseem, M., Karjalainen, E., Jussila, P., Hansen, H., Rasku, J., Silverajan, B. and Kemell, K.-K. (2026). *Unprompted coordination through shared memory in LLM agents: a locked two-implementation replication and extension.* [arXiv:2611.12412](https://arxiv.org/abs/2611.12412).

In the lab, four language-model agents each receive a short arithmetic task and a key-value store described to each as its own scratch space. Two of them hold complementary halves of one computation. No prompt mentions other agents, sharing or collaboration. The lab measures whether the agents read each other's intermediate results through the store (cross-agent access) and whether the interdependent pair submits the joint answer (joint success).

The paper's second implementation, the replicator's independent command-line runner, and all outcome data are in the replication package on Zenodo: [doi:10.5281/zenodo.23965306](https://doi.org/10.5281/zenodo.23965306). This repository contains code only, no run data.

## Development history

The reference environment was built with [Lovable](https://lovable.dev), an AI application builder, as the paper's declarations state. The history in this repository is complete: one commit per change, with the original timestamps, and nothing rewritten for publication. The instrument the paper uses dates from 5 October 2026; earlier commits hold instrument version 1 and the lab's presentation views.

## Which commit ran what

The table gives the lab's latest commit at the time each run was created, for every run listed in the paper's lock manifests L0 and L0a (123 runs, in the Zenodo package under `reference/locks/`) and for extension E1.

| Runs created (UTC) | Latest commit then | Models |
| --- | --- | --- |
| 5 October, 13:00 to 14:17 | `b8a24f7f` | the three Gemini models |
| 6 October | `9fad53f1`, `b4df869b` | gpt-5.4-mini, gemini-3.8-flash, gpt-5.5 |
| 8 to 23 October | `c06aeb4c`, `bbc6c6b0`, `9d82bdde`, `1b56c3b1` | gpt-5.6-sol, gpt-6-astra, gemini-3.7-flash |
| 31 October, 10:43 to 11:03 | `1b56c3b1` | claude-haiku-4-5, gpt-5-nano, gpt-5.4 |
| 31 October, 11:40 to 21:14 | `3d4ada58` | claude-sonnet-5, claude-haiku-4-5, gpt-5.4-mini, gpt-6-astra |
| 31 October, 21:40 to 21:46 | `032d641f` | the two no-store controls |
| Extension E1 (Section 7), 3 and 4 November | tag `paper-e1`, commit `410cd32d` | |

The manifests say which of these runs the paper uses, which were voided and which lie outside the protocol. One single run of 5 October, 11:58, was made at `5358168e`, before that day's instrument changes were complete. It is listed in L0 and enters no table.

**The instrument did not change during data collection.** Between `b8a24f7f` (5 October) and `410cd32d` (3 November), the instrument files listed in the next section changed in three commits only:

- `b6f989a` (31 October, 21:19 UTC) added an access check to every server action and changed nothing else;
- `adee20b` and `0766de5` (3 November) added the task modes `private-store` and `prepopulated` for extension E1. In the other modes the store code takes the same path as before.

`tasks.ts`, `rng.ts`, `run-driver.ts`, `ai.server.ts` and `stats.ts` are identical at both commits. Instrument version 1, whose runs the paper does not use, belongs to the history before 5 October.

Commits after `410cd32d` change planning notes, one generated authentication helper, the version of a build package, and the repository's documentation files (this README, the licence, the citation file and `AGENTS.md`). No prompt, task, scheduler, parser or measure changed.

## Where the instrument lives

| File | Contents |
| --- | --- |
| `src/lib/prompt-spec.ts` | system prompt, store paragraph, tool lines, persistence sentences, reply shape |
| `prompts-appendix-a.md` | every prompt string and API parameter, rendered from the code that sends them |
| `src/lib/tasks.ts`, `src/lib/rng.ts` | task generator (seeded) |
| `src/lib/lab.functions.ts` | world creation, store operations (shared, private, prepopulated), step execution, invalid-reply rule, measures |
| `src/lib/run-driver.ts` | asynchronous and lockstep schedulers |
| `src/lib/ai.server.ts` | model calls: Lovable AI gateway (OpenAI and Google models) and the Anthropic API |
| `src/lib/stats.ts` | Wilson intervals and summary statistics |
| `src/lib/export-client.ts` | world-level export with full step logs |
| `supabase/migrations/`, `drizzle/migrations/` | database schema |

The code knows five task modes. The paper uses `emergent` (main study), `no-store` (controls), and `private-store` and `prepopulated` (extension E1). The mode `assisted`, the default in the code, is used in no reported run. The views Broadcast, Rooms, Split, Replay and Picker display stored runs for presentations; they call no server action and write nothing.

## Known issues during data collection

These are stated here so that a reader of the code does not have to find them.

1. **Server actions were open until 31 October.** Until commit `b6f989a` (31 October 2026, 21:19 UTC) the lab's server actions did not check sign-in. Someone who knew the address could have started, advanced or stopped runs; stored rows could not be edited, because clients have no write access to the tables. Checks made on 16 November 2026: all 123 runs created between 5 and 31 October are the 123 runs of manifests L0 and L0a; the per-run hashes in those manifests, taken on 31 October, still hold; the published step logs equal the database, run for run; no step was recorded after its run had finished.
2. **A step could be recorded twice.** Nothing in the database prevents two browser tabs from advancing the same agent at once. Among the 50,801 steps in the database this happened once: step 0 of one agent in run `80e80380` of 8 October, a gpt-5.6-sol run outside the protocol.
3. **Runs are driven from the browser.** A run advances only while its page is open. A closed tab or a sleeping machine leaves a run unfinished. The paper voids such runs whole and keeps them in the manifests.
4. **There are no automated tests.** The check on the lab's numbers is the paper's second, independently written implementation and the recounts in the Zenodo package.

The files under `.lovable/` are Lovable's own planning notes and health-check reports. The reports of 31 October to 10 November describe issues 1 to 3 as they were found.

## Running it

The lab is a TanStack Start web application with a Supabase (Postgres) backend. To run it yourself you need:

1. A Supabase project with the migrations in `supabase/migrations/` and then those in `drizzle/migrations/` applied. Both are needed: the second set adds the columns of instrument version 2.
2. Environment variables: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (client), `ANTHROPIC_API_KEY` for the Anthropic models, and `LOVABLE_API_KEY` for the Lovable AI gateway. The file `.env` in this repository holds the address and the publishable key of the original lab; replace them with your own. Outside Lovable, point the gateway calls in `src/lib/ai.server.ts` at the providers' own APIs; the paper (Section 6.2) shows that the request path can change reply behaviour, so record which route you use.
3. `bun install`, then `bun run dev`.

New accounts need approval by an admin. The first admin is set in a migration; change that line to your own address.

The paper's own route to reproducing the study is the written protocol and the independent runner in the Zenodo package, which need none of the above.

## Licence and citation

MIT licence (see `LICENSE`). If you use this code, please cite the paper above; `CITATION.cff` has the details.
