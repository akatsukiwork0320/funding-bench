"use client";

import { useMemo, useState } from "react";
import { PROMPT_VERSION } from "@/lib/config";
import { db } from "@/lib/db";
import { LAST_ACTUAL_YEAR, actualByYear, proposalYear, scoreCells, sumYears } from "@/lib/scoring";
import ScoreHeadline from "@/components/score-headline";
import type { EvalCell, FunderRubric, GroundTruthMap, Proposal } from "@/lib/types";

const fmtUsd = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? "—" : `$${Math.round(n).toLocaleString()}`;
const fmt2 = (n: number) => (Number.isNaN(n) ? "—" : n.toFixed(2));

export default function ResultsClient({
  proposals,
  groundTruth,
  funders,
}: {
  proposals: Proposal[];
  groundTruth: GroundTruthMap;
  funders: FunderRubric[];
}) {
  const { data, isLoading, error } = db.useQuery({
    evals: { $: { where: { promptVersion: PROMPT_VERSION } } },
  });
  const [selected, setSelected] = useState<string | null>(null);

  const cells = (data?.evals ?? []) as unknown as EvalCell[];
  const scores = useMemo(
    () => scoreCells(cells, proposals, groundTruth),
    [cells, proposals, groundTruth],
  );

  if (isLoading) return <p>loading evals…</p>;
  if (error) return <p className="text-orange-600">error: {error.message}</p>;

  const models = [...new Set(cells.map((c) => c.model))].sort();
  const funderSlugs = funders.map((f) => f.slug);
  const scoreFor = (model: string, funderSlug: string) =>
    scores.find((s) => s.model === model && s.funderSlug === funderSlug);
  const selectedScore = selected
    ? scores.find((s) => `${s.model}|${s.funderSlug}` === selected)
    : undefined;
  const bySlug = new Map(proposals.map((p) => [p.slug, p]));
  const failed = cells.filter((c) => c.error).length;

  return (
    <div>
      <h1 className="text-2xl font-bold">Results</h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Cell = median |log₁₀(predicted/actual)| across projects (0 = perfect, 1 = off by 10×), and
        Spearman rank correlation (ρ) between predicted and actual totals. Predictions summed from
        proposal year through {LAST_ACTUAL_YEAR} (note: {LAST_ACTUAL_YEAR} actuals only run through
        Aug {LAST_ACTUAL_YEAR}, so full-year predictions score slightly hot). Prompt{" "}
        {PROMPT_VERSION}, live from InstantDB — {cells.length} evals
        {failed > 0 && `, ${failed} failed`}.
      </p>

      {cells.length === 0 ? (
        <div className="mt-8 border-2 border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500 dark:border-neutral-700">
          No eval runs yet. Run: <code className="text-orange-600">bun run scripts/eval.ts</code>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <h2 className="text-lg font-bold">
              FundingBench Score <span className="text-orange-600">over time</span>
            </h2>
            <ScoreHeadline proposals={proposals} groundTruth={groundTruth} />
          </section>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-orange-500 text-left">
                  <th className="py-2 pr-4">model</th>
                  {funderSlugs.map((f) => (
                    <th key={f} className="py-2 pr-4">
                      {f}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr key={m} className="border-b border-neutral-200 dark:border-neutral-800">
                    <td className="py-2 pr-4 font-bold">{m}</td>
                    {funderSlugs.map((f) => {
                      const s = scoreFor(m, f);
                      const key = `${m}|${f}`;
                      return (
                        <td key={f} className="py-2 pr-4">
                          {s ? (
                            <button
                              onClick={() => setSelected(selected === key ? null : key)}
                              className={`underline hover:text-orange-600 ${
                                selected === key ? "text-orange-600" : ""
                              }`}
                            >
                              {fmt2(s.medianAbsLogError)} · ρ {fmt2(s.spearman)}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedScore && (
            <div className="mt-8">
              <h2 className="text-lg font-bold">
                <span className="text-orange-600">{selectedScore.model}</span> ×{" "}
                {selectedScore.funderSlug}
              </h2>
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-orange-500 text-left">
                    <th className="py-2 pr-4">project</th>
                    <th className="py-2 pr-4">grant rec</th>
                    <th className="py-2 pr-4">predicted raise</th>
                    <th className="py-2 pr-4">actual raise</th>
                    <th className="py-2">|log err|</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedScore.comparisons.map((c) => {
                    const p = bySlug.get(c.projectSlug);
                    const cell = cells.find(
                      (x) =>
                        x.model === selectedScore.model &&
                        x.funderSlug === selectedScore.funderSlug &&
                        x.projectSlug === c.projectSlug,
                    );
                    return (
                      <tr
                        key={c.projectSlug}
                        className="border-b border-neutral-200 align-top dark:border-neutral-800"
                      >
                        <td className="max-w-64 py-2 pr-4">
                          <details>
                            <summary className="cursor-pointer">
                              {p?.title ?? c.projectSlug}
                              {p?.cohort === "named" && (
                                <span
                                  className="text-orange-600"
                                  title="famous project — memorization risk"
                                >
                                  {" "}
                                  *
                                </span>
                              )}
                            </summary>
                            {cell?.reasoning && (
                              <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap border-l-2 border-orange-500 pl-3 text-xs text-neutral-600 dark:text-neutral-400">
                                {cell.reasoning}
                              </pre>
                            )}
                          </details>
                        </td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtUsd(c.grantRecUsd)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtUsd(c.predictedUsd)}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{fmtUsd(c.actualUsd)}</td>
                        <td className="py-2">{fmt2(c.absLogError)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-neutral-500">
                * = famous project (memorization risk). Click a project title to read the
                model&apos;s reasoning.
              </p>
            </div>
          )}

          <div className="mt-10">
            <h2 className="text-lg font-bold">Ground truth</h2>
            <table className="mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-orange-500 text-left">
                  <th className="py-2 pr-4">project</th>
                  <th className="py-2 pr-4">manifund</th>
                  <th className="py-2 pr-4">external (high/med)</th>
                  <th className="py-2">total thru {LAST_ACTUAL_YEAR}</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => {
                  const gt = groundTruth[p.slug];
                  if (!gt) return null;
                  const total = sumYears(actualByYear(gt), proposalYear(p), LAST_ACTUAL_YEAR);
                  const external = gt.external_funding
                    .filter((e) => e.confidence !== "low")
                    .reduce((s, e) => s + e.amount_usd, 0);
                  return (
                    <tr
                      key={p.slug}
                      className="border-b border-neutral-200 dark:border-neutral-800"
                    >
                      <td className="max-w-64 py-2 pr-4">{p.title}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {fmtUsd(gt.manifund_total_raised)}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{fmtUsd(external)}</td>
                      <td className="py-2 whitespace-nowrap">{fmtUsd(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
