# Dead-weight health check (read-only, no code changed)

Every database table is still used. No unused lab components, lab helpers or Lovable Cloud backend functions turned up.

- **Medium**: `src/components/ui/`. 37 of the template's UI pieces are imported nowhere, for example calendar, carousel, chart, sidebar, form, command, drawer, menubar, input-otp, resizable and table. Fix: delete the unused files.
- **Medium**: `src/hooks/use-mobile.tsx`. Only the unused `sidebar.tsx` uses it. Fix: delete it together with the sidebar.
- **Medium**: `package.json`. `@hookform/resolvers` and `date-fns` are never imported. Fix: `bun remove` both.
- **Medium**: `package.json`. These packages are only used by unused UI pieces: `react-day-picker`, `embla-carousel-react`, `cmdk`, `vaul`, `input-otp`, `react-resizable-panels` and `react-hook-form`, plus the radix packages behind each deleted piece. Fix: remove them once those UI files are deleted.
- **Medium**: `src/components/ui/sonner.tsx` is unused, so no toast container is ever shown. Fix: either mount `<Toaster />` in `__root.tsx` or remove `sonner`.
- **Low**: `vite-tsconfig-paths`, `@tanstack/router-plugin` and `@tailwindcss/vite` are listed as packages, but the shared Vite config already provides them. Fix: move them to devDependencies, or remove `vite-tsconfig-paths`. This also clears the "redundant plugin" warning.
- **Low**: `drizzle/` and `drizzle.config.ts`. These keep a second migration track next to the Lovable Cloud migrations, and `schema.ts` is only 60 bytes. Fix: confirm nothing applies these migrations, then delete the folder.
- **Low**: Root files `prompts-appendix-a.md` and `template-audit.csv`, plus the archived plans in `.lovable/plan/`. These are generated artifacts, and the app now builds Appendix A itself. Fix: keep only what the paper needs.
- **Low**: Routes. Every page is linked from somewhere. `/split`, `/broadcast`, `/rooms` and `/picker` are filming tools only. Fix: none needed, but they could be grouped later.
- **Low**: Database. All tables are referenced (`alerts`, `human_codings`, `account_requests` included), and so are the columns spot-checked (`first_flag_step`, `solicit_write`, `human_action`, `sample_seed`). Fix: none.
