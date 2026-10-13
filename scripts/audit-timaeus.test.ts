import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { auditTimaeus, TIMAEUS_SLUGS } from "./audit-timaeus";
import type { GroundTruthMap, Proposal } from "../src/lib/types";

const proposals: Proposal[] = JSON.parse(
  readFileSync(new URL("../data/proposals.json", import.meta.url), "utf8"),
);
const groundTruth: GroundTruthMap = JSON.parse(
  readFileSync(new URL("../data/ground-truth.json", import.meta.url), "utf8"),
);
const report = auditTimaeus(proposals, groundTruth);

test("reproduces the current scorer on the committed Timaeus records", () => {
  assert.deepEqual(
    report.proposals.map((p) => [p.proposalDate, p.scoredTotalUsd]),
    [
      ["2023-07-18", 570650],
      ["2024-07-12", 2256680],
    ],
  );
  const a = report.scenarios[0];
  assert.equal(a.predictedUsd, 2827330);
  assert.equal(a.actualUsd, 570650);
  assert.ok(Math.abs(a.absLogError - 0.6950066797826855) < 1e-12);
  assert.ok(Math.abs(a.singleCellScore - 76.83311067391048) < 1e-10);
});

test("the two illustrative alternatives use distinct windows on both sides", () => {
  assert.deepEqual(
    report.scenarios
      .slice(1)
      .map((s) => [s.id, s.toYear, s.predictedUsd, s.actualUsd, s.singleCellScore]),
    [
      ["B", 2026, 2827330, 2827330, 100],
      ["C", 2023, 570650, 570650, 100],
    ],
  );
  const changed = auditTimaeus(proposals, groundTruth, {
    ...report.syntheticPrediction,
    "2024": 0,
  });
  assert.equal(changed.scenarios[1].predictedUsd, 2403870);
  assert.equal(changed.scenarios[1].actualUsd, 2827330);
  assert.ok(changed.scenarios[1].singleCellScore < 100);
  assert.deepEqual(changed.scenarios[2], report.scenarios[2]);
});

test("2027 and 2028 predictions do not enter the current scoring window", () => {
  const changed = auditTimaeus(proposals, groundTruth, {
    ...report.syntheticPrediction,
    "2027": 1e9,
    "2028": 2e9,
  });
  assert.deepEqual(changed.scenarios, report.scenarios);
});

test("low-confidence entries remain excluded, while medium entries are counted", () => {
  const gt = structuredClone(groundTruth);
  const second = gt[TIMAEUS_SLUGS[1]];
  const low = second.external_funding.find((e) => e.confidence === "low")!;
  assert.ok(low);
  low.amount_usd += 1e9;
  assert.deepEqual(auditTimaeus(proposals, gt), report);
  second.external_funding.push({ ...low, amount_usd: 1000, year: 2025, confidence: "medium" });
  assert.equal(auditTimaeus(proposals, gt).proposals[1].scoredTotalUsd, 2257680);
});

test("a later proposal's scored total excludes amounts before its proposal year", () => {
  const gt = structuredClone(groundTruth);
  gt[TIMAEUS_SLUGS[1]].manifund_raised_by_year["2023"] = 1000;
  const changed = auditTimaeus(proposals, gt);
  assert.equal(changed.proposals[1].scoredTotalUsd, 2256680);
  assert.equal(changed.scenarios[1].actualUsd, 2828330);
});

test("missing records are distinguished from an explicitly recorded zero", () => {
  assert.deepEqual(report.proposals[0].years[1], {
    year: 2024,
    eligibleRecordedUsd: null,
    scoredUsd: 0,
  });
  const gt = structuredClone(groundTruth);
  gt[TIMAEUS_SLUGS[0]].manifund_raised_by_year["2024"] = 0;
  assert.deepEqual(auditTimaeus(proposals, gt).proposals[0].years[1], {
    year: 2024,
    eligibleRecordedUsd: 0,
    scoredUsd: 0,
  });
});

test("missing target records fail instead of silently returning a partial total", () => {
  const gt = structuredClone(groundTruth);
  delete gt[TIMAEUS_SLUGS[1]];
  assert.throws(() => auditTimaeus(proposals, gt), /Missing proposal or ground truth/);
});
