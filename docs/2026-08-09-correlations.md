# Correlation analysis: grant recs & raise forecasts (2026-08-09)

Quick look at how correlated the v2 eval outputs are across three axes: model, funder
rubric, and forecast year. Data: all 400 error-free v2 cells (5 models × 4 funders ×
20 projects) pulled from Instant. For each pair we report **Pearson on
log10(1+USD)** (dollar amounts are heavy-tailed) and **Spearman rank** correlation,
written `pearson/spearman`.

## TL;DR

1. **Between models:** moderately correlated. Grant recommendations agree on _ranking_
   (mean Spearman ≈ 0.69) much more than on _amounts_ (mean log-Pearson ≈ 0.46).
   Total raise forecasts agree more (0.74 / 0.86) — models mostly read the same
   fundraising signal from a proposal, but scale their checks very differently.
2. **Between funders:** grant recs are only moderately correlated across rubrics
   (0.57 / 0.70), so the personas genuinely change the recommendation. But raise
   forecasts are nearly identical across funders (0.94 / 0.97) — as they should be,
   since the project's future raise doesn't depend on who's evaluating it. Nice
   sanity check that models treat the two questions differently.
3. **Between years:** adjacent-year forecasts are highly correlated and get more so
   over time (2025→2026: 0.82/0.97; 2027→2028: 0.96/0.99). Models mostly forecast
   smooth trajectories — the far years carry little independent information beyond
   "extrapolate the current level."

## 1. Between models

Grant recommendations, paired on the 80 shared (funder, project) cells per pair:

|                   | haiku-3 | opus-5  | sonnet-4.5 | gpt-4o  | gpt-5.6 |
| ----------------- | ------- | ------- | ---------- | ------- | ------- |
| claude-3-haiku    | —       | .21/.60 | .37/.58    | .39/.79 | .28/.56 |
| claude-opus-5     |         | —       | .62/.75    | .41/.69 | .82/.88 |
| claude-sonnet-4.5 |         |         | —          | .46/.61 | .56/.69 |
| gpt-4o            |         |         |            | —       | .52/.73 |
| gpt-5.6-terra     |         |         |            |         | —       |

- The two frontier models (Opus 5, GPT-5.6 Terra) agree with _each other_ far more
  (.82/.88) than either agrees with the older models — capability seems to converge
  model judgments, cutting across labs.
- Claude 3 Haiku is the outlier: rank-agrees decently but its dollar amounts are
  nearly uncorrelated with Opus 5 (.21). Weak models pick similar winners but
  arbitrary check sizes.
- Total raise forecasts are more correlated between models (mean .74/.86 vs .46/.69
  for grant recs). Forecasting the market is a more constrained task than deciding
  what _you_ would fund.

## 2. Between funder rubrics

Grant recommendations, paired on the 100 shared (model, project) cells per pair:

|         | cg-gcro | cg-ntai | ltff    | sff     |
| ------- | ------- | ------- | ------- | ------- |
| cg-gcro | —       | .62/.76 | .57/.64 | .54/.73 |
| cg-ntai |         | —       | .68/.68 | .58/.80 |
| ltff    |         |         | —       | .45/.57 |
| sff     |         |         |         | —       |

- Mean .57/.70 — clearly positive (good projects are good projects) but far from
  redundant. The rubric shifts roughly a third of the rank ordering.
- LTFF × SFF is the least-correlated pair (.45/.57), which tracks: smallest overlap
  in stated priorities. The two Coefficient funds + SFF cluster more tightly.
- Raise forecasts across funders: .94/.97. The funder persona barely moves the
  forecast, which is the desired behavior — the forecast question is
  funder-independent. If this number ever drops, it likely means persona framing is
  bleeding into the forecast.

## 3. Between years

Predicted raise per calendar year, paired across (model, funder, project). n varies
by year because forecasts start at each proposal's year (only 2023-vintage proposals
have 2023 predictions).

| adjacent pair | n   | pearson(log) | spearman |
| ------------- | --- | ------------ | -------- |
| 2023→2024     | 120 | .57          | .73      |
| 2024→2025     | 240 | .73          | .96      |
| 2025→2026     | 400 | .82          | .97      |
| 2026→2027     | 400 | .94          | .99      |
| 2027→2028     | 400 | .96          | .99      |

- Correlation rises monotonically into the future: models differentiate early years
  (grant-year dynamics, runway) but the 2027/2028 tail is essentially "carry the
  2026 level forward" (Spearman .99).
- Even distant pairs stay high (2024×2028: .70/.89) — trajectories are smooth,
  rarely predicting collapse or breakout.
- Implication for scoring: when 2027–2028 become scoreable, they'll mostly re-test
  the same prediction as 2026 rather than adding independent signal. Cross-year
  _level_ is the real bet; year-shape carries little.

## Bonus

Grant rec vs the same cell's total forecast raise: .63/.77 — models recommend more
to projects they expect to raise more, but the two outputs aren't collapsing into
one judgment.

## Variance decomposition: model vs rubric vs year

Follow-up question: for a given proposal, where does the variability in the raise
forecast come from — the model, the funder rubric, or the year? Method: ANOVA on
log10(1+forecast) over the balanced slice (years 2025–2028, present in all 400
cells → 1600 observations, fully crossed 20 projects × 5 models × 4 funders × 4
years, so sums of squares are orthogonal and add up).

Share of total variance:

| source            | share |
| ----------------- | ----- |
| project           | 55.1% |
| project × model   | 16.2% |
| model             | 5.6%  |
| project × year    | 3.4%  |
| year              | 2.1%  |
| model × year      | 1.2%  |
| project × funder  | 1.0%  |
| funder            | 0.3%  |
| model × funder    | 0.4%  |
| funder × year     | 0.0%  |
| residual (3+-way) | 14.7% |

- **Project dominates (55%)** — good, that's the signal: models mostly respond to
  which proposal they're reading.
- **Model-related terms sum to ~23%** (model + project×model + model×year). The big
  chunk is _project×model_ — models don't just have different global generosity
  levels, they disagree about _which_ projects will raise a lot.
- **Funder-related terms sum to ~1.7%.** The rubric barely touches the forecast.
- **Year-related ~6.7%**, mostly project×year (different projects get different
  trajectory shapes).

The most direct answer to "within a single proposal-year, who disagrees?" — take
each (project, year) cell's 5×4 table of forecasts and decompose its spread:

| within-cell source         | share |
| -------------------------- | ----- |
| model                      | 67.6% |
| funder rubric              | 4.8%  |
| model × funder interaction | 27.6% |

In dollar terms, the typical spread within a proposal:

- swap the **model** (same rubric, year): sd of model means ≈ 0.96 log10 units — a
  ~9× typical spread (inflated by models sometimes predicting $0 for a year)
- move one **year** (same model, rubric): sd ≈ 0.55 log10 units (~3.6×)
- swap the **rubric** (same model, year): sd ≈ 0.27 log10 units (~1.8×)

So the intuition holds: **model ≫ year ≫ rubric** for forecast variability, with
model explaining ~14× more within-proposal variance than the rubric.

Contrast with **grant recommendations** (same decomposition, within project):
model 47.4%, funder 21.5%, interaction 31.1%. The rubric matters ~4× more for the
grant decision than for the forecast — consistent with the correlation section:
personas shape what a funder would _give_, but models (correctly) treat "what will
this project raise?" as rubric-independent.

## Method notes

- Pearson computed on log10(1+x) because raw USD is dominated by a few large
  projects; Spearman is scale-free. Where they diverge (models, esp. Haiku), it
  means rank agreement with wild disagreement on magnitudes.
- Year-to-year correlations are within-cell (same model+funder+project across
  years), so smooth per-cell trajectories inflate them by construction — that's the
  finding, not an artifact, but don't read them as agreement between _independent_
  forecasts.
- Analysis script was one-off; regenerate by querying v2 `evals` from Instant and
  computing pairwise correlations over shared cells.
