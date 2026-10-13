// Offline sensitivity example, not a replacement ground-truth definition.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LAST_ACTUAL_YEAR,
  absLogError,
  actualByYear,
  cellAccuracy,
  fundingBenchScores,
  proposalYear,
  scoreCells,
  sumYears,
} from "../src/lib/scoring";
import type { EvalCell, GroundTruthMap, Proposal } from "../src/lib/types";

export const TIMAEUS_SLUGS = [
  "scoping-developmental-interpretability-xg55b33wsfc",
  "next-steps-in-developmental-interpretability",
] as const;

export function auditTimaeus(
  proposals: Proposal[],
  groundTruth: GroundTruthMap,
  prediction?: Record<string, number>,
) {
  const entries = TIMAEUS_SLUGS.map((slug) => {
    const proposal = proposals.find((p) => p.slug === slug);
    const gt = groundTruth[slug];
    if (!proposal || !gt) throw new Error(`Missing proposal or ground truth: ${slug}`);
    return { proposal, gt, byYear: actualByYear(gt) };
  });
  const first = entries[0];
  const from = proposalYear(first.proposal);
  const combined: Record<string, number> = {};
  for (const { byYear } of entries) {
    for (const [year, usd] of Object.entries(byYear)) {
      combined[year] = (combined[year] ?? 0) + usd;
    }
  }
  // Deliberately synthetic: it matches the two entries' eligible recorded sums.
  // Absent years follow the current scorer's zero-fill, not confirmed zero raises.
  const syntheticPrediction = prediction ?? { ...combined };
  const cell: EvalCell = {
    cellKey: "offline-synthetic-timaeus",
    promptVersion: "offline-synthetic",
    model: "synthetic",
    funderSlug: "synthetic",
    projectSlug: first.proposal.slug,
    raiseByYearUsd: syntheticPrediction,
    createdAt: 0,
  };
  const current = scoreCells([cell], proposals, groundTruth)[0].comparisons[0];
  const currentScore = fundingBenchScores([cell], proposals, groundTruth)[0].score;
  const scenario = (id: string, label: string, to: number, actualUsd: number, caveat: string) => {
    const predictedUsd = sumYears(syntheticPrediction, from, to);
    return {
      id,
      label,
      fromYear: from,
      toYear: to,
      predictedUsd,
      actualUsd,
      absLogError: absLogError(predictedUsd, actualUsd),
      singleCellScore: cellAccuracy(predictedUsd, actualUsd),
      caveat,
    };
  };

  return {
    kind: "synthetic sensitivity example; not observed model results",
    interpretation: [
      "Null eligibleRecordedUsd means no high/medium or Manifund amount is recorded for that year; the scorer uses zero.",
      "Recorded sums are not verified complete organization fundraising; 2026 is a partial observation year.",
      "B and C are illustrative alternatives, not validated target definitions. With the default synthetic prediction, both score 100 by construction.",
      "No prompt, dataset, production scoring, or database is changed; no model is called.",
    ],
    proposals: entries.map(({ proposal, gt, byYear }) => {
      const start = proposalYear(proposal);
      return {
        slug: proposal.slug,
        proposalDate: proposal.proposal_date,
        fetchedAt: gt.fetched_at,
        scoredFromYear: start,
        scoredThroughYear: LAST_ACTUAL_YEAR,
        years: Array.from({ length: LAST_ACTUAL_YEAR - start + 1 }, (_, i) => {
          const year = start + i;
          return {
            year,
            eligibleRecordedUsd: byYear[String(year)] ?? null,
            scoredUsd: byYear[String(year)] ?? 0,
          };
        }),
        scoredTotalUsd: sumYears(byYear, start, LAST_ACTUAL_YEAR),
      };
    }),
    syntheticPrediction,
    scenarios: [
      {
        id: "A",
        label: "Current proposal attribution",
        fromYear: from,
        toYear: LAST_ACTUAL_YEAR,
        predictedUsd: current.predictedUsd,
        actualUsd: current.actualUsd,
        absLogError: current.absLogError,
        singleCellScore: currentScore,
        caveat:
          "Later grants assigned to the second proposal are absent from the first proposal's scored actuals.",
      },
      scenario(
        "B",
        "Combine the two recorded entries",
        LAST_ACTUAL_YEAR,
        sumYears(combined, from, LAST_ACTUAL_YEAR),
        "Assumes the two entries define the intended target; shared outcomes across forecast origins require a weighting decision.",
      ),
      scenario(
        "C",
        "Illustrative first-calendar-year cap",
        from,
        sumYears(first.byYear, from, from),
        "This is not a cutoff at the next proposal date (2024-07-12); annual data cannot partition that boundary.",
      ),
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const readJson = (path: string) =>
    JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
  console.log(
    JSON.stringify(
      auditTimaeus(readJson("../data/proposals.json"), readJson("../data/ground-truth.json")),
      null,
      2,
    ),
  );
}
