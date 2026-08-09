# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A benchmark for how well LLMs assess grant proposals and predict follow-up funding. Models see historical AI-safety proposals from Manifund (outcomes stripped), roleplay a real funder (LTFF, SFF, two Coefficient Giving funds), recommend a grant amount, and forecast the project's raise per year. Design notes: `INITIAL_SPEC.md` (original spec) and `docs/2026-08-07-initial-plan.md` (decisions + build order).

## Commands

Use bun for everything (scripts, package installs).

```bash
bun install
bun run dev               # site at localhost:3000 (Next.js + Tailwind)
bun run build             # production build (also the de-facto typecheck gate)
bunx tsc --noEmit         # typecheck only
bun run fetch-proposals   # rebuild data/proposals.json + Manifund side of ground truth
bun run merge-research    # merge data/research-raw.json into ground-truth.json + funders.json
bun run eval              # run all missing eval cells
bun run eval -- --dry-run # print the first prompt and exit
bun run eval -- --force --models anthropic/claude-opus-5 --funders ltff --projects forethought
```

No test suite exists. `.env` needs `NEXT_PUBLIC_INSTANT_APP_ID`, `INSTANT_APP_ADMIN_TOKEN` (InstantDB), and `OPENROUTER_API_KEY` (eval script only); bun loads `.env` automatically.

## Architecture

Two data stores, deliberately split:

- **Committed JSON in `data/`** — the dataset. `proposals.json` (model-visible fields only), `ground-truth.json` (funding outcomes, never shown to models), `funders.json` (rubrics used as personas), `research-raw.json` (manual/agent research staged for merge). Read server-side via `src/lib/data.ts` (uses `fs` — server components and scripts only).
- **InstantDB** — eval outputs only (`evals` + `runs` entities, schema in `src/instant.schema.ts`). The `/results` page reads them live on the client via `src/lib/db.ts` (`@instantdb/react`). Schema changes: edit `src/instant.schema.ts` then `npx instant-cli push schema --yes`. Full InstantDB usage rules (query operators, permissions, gotchas) are in `AGENTS.md` — follow it for any Instant work.

Pipeline flow: `scripts/fetch-proposals.ts` (Manifund public API, seeded random selection of the 20 projects) → `scripts/merge-research.ts` (folds researched external funding + rubrics in) → `scripts/eval.ts` (models × funders × proposals via OpenRouter chat completions, results written to Instant) → `src/lib/scoring.ts` (pure functions, safe on client and in scripts) → site pages.

Key invariants:

- **Contamination is the cardinal sin.** Nothing post-dating a proposal may appear in `proposals.json` descriptions or in funder rubrics — v1 was invalidated because 5 descriptions and the LTFF rubric leaked outcomes. Ground truth and anything derived from it must never reach the model prompt. When touching proposal text or rubrics, keep them as-of-proposal-date / as-of-rubric-date.
- **`PROMPT_VERSION`** (`src/lib/config.ts`) keys every eval cell (`promptVersion|model|funderSlug|projectSlug`, unique `cellKey` in Instant). Bump it whenever prompts, proposal text, or rubrics change; the results page only shows the current version, and `eval.ts` is idempotent per cell (skips done cells unless `--force`).
- **Model list lives in two places**: `MODELS` in `scripts/eval.ts` (OpenRouter ids, verified against the live model list at run time) and `MODEL_META` in `src/lib/config.ts` (labels + release dates for the score-over-time chart). Keep them in sync.
- Scoring compares predicted vs actual raise summed from proposal year through `LAST_ACTUAL_YEAR` (2026); low-confidence external funding entries are excluded from actuals. Predictions run through 2028 and become scoreable later.
