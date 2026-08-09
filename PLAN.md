# Funding Bench 0 — Plan

MVP of a benchmark testing how well LLMs assess grant proposals and predict follow-up funding,
per INITIAL_SPEC.md plus decisions made 2026-08-07.

## Decisions made

- **Storage**: dataset (proposals, ground truth, rubrics) as committed JSON under `data/`;
  eval results written to InstantDB so the site can update live as runs happen.
- **Eval output**: for each (model, rubric, proposal), the model produces brief reasoning plus:
  1. `grant_rec` — $ this specific funder should grant right now
  2. `raise_proposal_year` — predicted total $ the project raises in its proposal year
  3. `raise_by_year` — predicted total $ raised in each following year through 2028
- **Scoring (MVP)**: simple metrics per model×rubric — median absolute log-error vs actual
  raised, plus Spearman rank correlation (does the model order projects by funding success
  correctly?). Raw $ comparisons shown alongside. Impact-cert-style scoring deferred.
- **Funders (M=4)**: LTFF, SFF, Coefficient Giving Navigating Transformative AI Fund,
  Coefficient Giving GCR Opportunities Fund (changed from cG TAIS/AIGP per Austin,
  2026-08-07).
- **No Eve / no agentic harness**: a plain batch eval script over OpenRouter. Models get no
  web search — memorization is the known confound, not tooling.

## Dataset (K=20 projects)

- 5 named large/successful-ish: Timaeus, Apollo, ChinaTalk, Lightcone, Forethought
- 5 other decently-funded AI safety projects
- 10 random AI safety projects from Manifund

`data/proposals.json` — what models see. Per project: slug, title, description (markdown),
creator name + short bio as listed at proposal time, proposal date, funding goal (target)
and max ask ("funding_goal" / "min_funding" on Manifund). **Excluded**: comments, donations,
current stage, anything post-dating the proposal.

`data/ground-truth.json` — never shown to models. Per project, by calendar year:

- Manifund $ raised (from txns API)
- External funding (Coefficient Giving/Open Phil grants DB, SFF grant lists, LTFF payout
  reports, Longterm Wiki, org annual reports, web search) with a source URL per entry
- Notes on confidence/completeness. Actuals exist only through ~mid-2026; 2027–2028
  predictions are recorded now and become scoreable later.

Collection is scripted where possible (`scripts/fetch-proposals.ts`), manual research
recorded as JSON where not.

## Funder rubrics

`data/funders/*.json` (rendered on site): a few paragraphs on thesis, grantmaker bios,
typical check size, total yearly spend, grants/year. Sourced from
manifund.org/ais-funder-bulletin plus each funder's own site (LTFF payout reports, SFF
grant rounds, coefficientgiving.org grants database). Each rubric notes an "as of" date.

## Eval protocol

`scripts/eval.ts`, plain OpenRouter chat completions:

- N=5 models: Claude 3.5 Sonnet, Claude 4.5 Sonnet, Claude 5 Opus, GPT 5.6 Terra, GPT-4o
  (exact OpenRouter IDs verified against /api/v1/models at run time).
- Prompt: funder rubric + proposal + instruction to reason briefly, then emit a JSON block
  with the three dollar outputs. Temperature 0 (or provider default where unsupported),
  one sample per cell. 5×4×20 = 400 calls; est. cost a few dollars (budget cap $100).
- The prompt tells the model the proposal date and instructs it to reason as of that date.
  Known limitation: models may have memorized outcomes for famous projects (Apollo,
  Timaeus). MVP just flags the 5 famous projects in results; look at ForecastBench's
  handling later.
- Results (including raw reasoning text) written to InstantDB via admin SDK; re-runs are
  idempotent per (model, rubric, project, promptVersion).

## InstantDB schema

- `runs`: id, startedAt, promptVersion, notes
- `evals`: run link, model, funderSlug, projectSlug, grantRec, raiseByYear (json),
  reasoning (text), costUsd, latencyMs, error?

Dataset stays in JSON; only eval outputs + derived scores live in Instant.

## Website (text-first, orange highlights; redesign later)

- `/` — what this benchmark is, headline results table
- `/projects` + `/projects/[slug]` — the 20 proposals as models see them
- `/funders` + `/funders/[slug]` — the 4 rubrics
- `/results` — model × rubric matrix: metrics (median |log-error|, rank corr), drill-down
  to per-project $ vs actual, reasoning text visible (live from InstantDB)

## Build order

1. `scripts/fetch-proposals.ts` + pick the 20 projects → `data/proposals.json`
2. Ground truth: Manifund txns script + external funding research → `data/ground-truth.json`
3. Funder rubrics → `data/funders/*.json`
4. Instant schema + eval runner (**blocked on `OPENROUTER_API_KEY` in `.env`**)
5. Scoring lib + website pages
6. Run full eval, sanity-check results, iterate on prompt if outputs are malformed

## Open questions / risks

- **Memorization**: no mitigation in MVP beyond flagging famous projects; consider
  ForecastBench-style holdouts or post-cutoff proposals later.
- **Ground-truth completeness**: external funding data is patchy; per-entry sources and a
  confidence note are the mitigation. "Total raised" = Manifund + known external grants,
  which undercounts orgs with private funding.
- **What counts as the project vs the org**: e.g. Apollo's Manifund ask vs Apollo the org's
  total raise. MVP convention: ground truth tracks the org/project entity that made the
  proposal, noted per project.
- Claude 3.5 Sonnet is fully deprecated on OpenRouter (checked 2026-08-07). Substituted
  anthropic/claude-3-haiku — the last Claude-3-era model available (Aug 2023 cutoff, which
  predates most outcomes, making it a useful low-memorization baseline).
