# Funding Bench

A benchmark for how well LLMs assess grant proposals and predict follow-up funding.
Models see historical AI-safety proposals from [Manifund](https://manifund.org) (outcomes
stripped), roleplay a real funder (LTFF, SFF, Coefficient Giving), recommend a grant
amount, and forecast the project's total raise per year. Forecasts are scored against
ground truth from Manifund transactions + public grant databases.

See `INITIAL_SPEC.md` and `PLAN.md` for design notes.

## Setup

```bash
bun install
cp .env.example .env   # add NEXT_PUBLIC_INSTANT_APP_ID, INSTANT_APP_ADMIN_TOKEN, OPENROUTER_API_KEY
```

## Commands

```bash
bun run dev               # website at localhost:3000
bun run fetch-proposals   # rebuild data/proposals.json + Manifund side of ground truth
bun run merge-research    # merge data/research-raw.json into ground truth + funders
bun run eval              # run all missing eval cells (models × funders × projects)
bun run eval -- --dry-run # print the first prompt
```

## Offline scoring example

`bun run scripts/audit-timaeus.ts` compares current Timaeus scoring with two
illustrative target definitions using the committed records and a synthetic
prediction. Run its checks with `bun test scripts/audit-timaeus.test.ts`.
Neither command needs credentials, model calls, or InstantDB. The prompt asks
for predictions through 2028; current scoring ends in 2026. The example does
not establish complete fundraising totals, select a correct target definition,
or measure changes to actual model rankings.

## Layout

- `data/proposals.json` — 20 proposals, model-visible fields only
- `data/ground-truth.json` — funding outcomes by year (never shown to models)
- `data/funders.json` — 4 funder rubrics used as personas
- `scripts/` — dataset + eval pipeline (bun)
- `src/lib/types.ts` — dataset types; `scoring.ts` — metrics (median |log error|, Spearman)
- Eval results live in InstantDB (`evals` entity); the `/results` page reads them live.

## TODOs
- Sanitize/check all the underlying data (eg Timaeus and Apollo funding numbers are clearly wrong)
  - And later set up some pipeline that gets us good data on all this stuff
- Think about a reasonable scoring function, I don't understand/trust the current one
  - Especially, think about a scoring function that's more like a trading function, aka more prediction market than metaculus average (more points when the forecast matters more)
  - ... maybe it actually just makes sense to set up thick-ish prediction markets (or futures) on these outcomes and let models trade on them
- Maybe optimize the funder rubrics more. Or give up on them since the models aren't using them much, idk
  - Look into the current scaffold
- Rerun just to see how robust the forecasts are between runs

Nice UI stuff
- Show the run reasoning in some readable/sane way
- Cut all the slop ofc
