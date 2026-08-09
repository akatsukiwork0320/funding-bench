// Scoring: compare model predictions to actual funding raised.
// Pure functions — safe on client (results page) and in scripts.

import type { EvalCell, GroundTruth, Proposal } from "./types";

/** Actuals only exist through this year (mid-2026 at dataset build time). */
export const LAST_ACTUAL_YEAR = 2026;
/** Floor so $0 outcomes don't blow up log error. */
const EPS_USD = 1000;

/** Actual USD raised per year = Manifund donations + external grants (high/medium confidence). */
export function actualByYear(gt: GroundTruth): Record<string, number> {
  const byYear: Record<string, number> = { ...gt.manifund_raised_by_year };
  for (const e of gt.external_funding) {
    if (e.confidence === "low") continue;
    const y = String(e.year);
    byYear[y] = (byYear[y] ?? 0) + e.amount_usd;
  }
  return byYear;
}

export function sumYears(byYear: Record<string, number>, fromYear: number, toYear: number): number {
  let total = 0;
  for (let y = fromYear; y <= toYear; y++) total += byYear[String(y)] ?? 0;
  return total;
}

export function proposalYear(p: Proposal): number {
  return Number(p.proposal_date.slice(0, 4));
}

/** |log10(pred/actual)|, both floored at EPS_USD. 1.0 = off by 10x. */
export function absLogError(predUsd: number, actualUsd: number): number {
  const pred = Math.max(predUsd, EPS_USD);
  const actual = Math.max(actualUsd, EPS_USD);
  return Math.abs(Math.log10(pred / actual));
}

export function median(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function ranks(xs: number[]): number[] {
  const indexed = xs.map((x, i) => ({ x, i }));
  indexed.sort((a, b) => a.x - b.x);
  const r = new Array<number>(xs.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].x === indexed[i].x) j++;
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return r;
}

/** Spearman rank correlation; NaN if <3 points or zero variance. */
export function spearman(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length < 3) return NaN;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return NaN;
  return num / Math.sqrt(da * db);
}

/**
 * Unified FundingBench score, 0–100: per-cell accuracy
 * max(0, 1 − |log₁₀(pred/actual)|/3) — 100 = exact, 0 = off by ≥1000× —
 * averaged over every scoreable (funder, project) cell for the model.
 */
export function cellAccuracy(predUsd: number, actualUsd: number): number {
  return Math.max(0, 1 - absLogError(predUsd, actualUsd) / 3) * 100;
}

export interface ModelScore {
  model: string;
  /** Mean cell accuracy, 0–100. */
  score: number;
  /** Number of scoreable cells (max funders × projects). */
  n: number;
}

export function fundingBenchScores(
  cells: EvalCell[],
  proposals: Proposal[],
  groundTruth: Record<string, GroundTruth>,
): ModelScore[] {
  const bySlug = new Map(proposals.map((p) => [p.slug, p]));
  const acc = new Map<string, number[]>();
  for (const c of cells) {
    if (c.error || !c.raiseByYearUsd) continue;
    const p = bySlug.get(c.projectSlug);
    const gt = groundTruth[c.projectSlug];
    if (!p || !gt) continue;
    const from = proposalYear(p);
    const pred = sumYears(c.raiseByYearUsd, from, LAST_ACTUAL_YEAR);
    const actual = sumYears(actualByYear(gt), from, LAST_ACTUAL_YEAR);
    (acc.get(c.model) ?? acc.set(c.model, []).get(c.model)!).push(cellAccuracy(pred, actual));
  }
  return [...acc.entries()]
    .map(([model, xs]) => ({
      model,
      score: xs.reduce((s, x) => s + x, 0) / xs.length,
      n: xs.length,
    }))
    .sort((a, b) => b.score - a.score);
}

export interface ProjectComparison {
  projectSlug: string;
  /** Sum of predicted raise, proposal year → LAST_ACTUAL_YEAR. */
  predictedUsd: number;
  /** Sum of actual raise over the same window. */
  actualUsd: number;
  absLogError: number;
  grantRecUsd: number | undefined;
}

export interface ModelFunderScore {
  model: string;
  funderSlug: string;
  n: number;
  medianAbsLogError: number;
  spearman: number;
  comparisons: ProjectComparison[];
}

/** Score one (model, funder) slice of eval cells against ground truth. */
export function scoreCells(
  cells: EvalCell[],
  proposals: Proposal[],
  groundTruth: Record<string, GroundTruth>,
): ModelFunderScore[] {
  const bySlug = new Map(proposals.map((p) => [p.slug, p]));
  const groups = new Map<string, EvalCell[]>();
  for (const c of cells) {
    if (c.error || !c.raiseByYearUsd) continue;
    const key = `${c.model}|${c.funderSlug}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }

  const scores: ModelFunderScore[] = [];
  for (const [key, group] of groups) {
    const [model, funderSlug] = key.split("|");
    const comparisons: ProjectComparison[] = [];
    for (const c of group) {
      const p = bySlug.get(c.projectSlug);
      const gt = groundTruth[c.projectSlug];
      if (!p || !gt) continue;
      const from = proposalYear(p);
      const predictedUsd = sumYears(c.raiseByYearUsd!, from, LAST_ACTUAL_YEAR);
      const actualUsd = sumYears(actualByYear(gt), from, LAST_ACTUAL_YEAR);
      comparisons.push({
        projectSlug: c.projectSlug,
        predictedUsd,
        actualUsd,
        absLogError: absLogError(predictedUsd, actualUsd),
        grantRecUsd: c.grantRecUsd,
      });
    }
    comparisons.sort((a, b) => b.actualUsd - a.actualUsd);
    scores.push({
      model,
      funderSlug,
      n: comparisons.length,
      medianAbsLogError: median(comparisons.map((c) => c.absLogError)),
      spearman: spearman(
        comparisons.map((c) => c.predictedUsd),
        comparisons.map((c) => c.actualUsd),
      ),
      comparisons,
    });
  }
  scores.sort((a, b) => a.funderSlug.localeCompare(b.funderSlug) || a.model.localeCompare(b.model));
  return scores;
}
