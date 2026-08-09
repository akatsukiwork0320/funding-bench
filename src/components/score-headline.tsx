"use client";

// Headline benchmark results: score-over-time chart + model ranking table.
// Self-contained (subscribes to evals itself) so it can sit on any page.

import { useMemo } from "react";
import { MODEL_META, PROMPT_VERSION } from "@/lib/config";
import { db } from "@/lib/db";
import { fundingBenchScores } from "@/lib/scoring";
import ScoreChart from "@/app/results/score-chart";
import type { EvalCell, GroundTruthMap, Proposal } from "@/lib/types";

export default function ScoreHeadline({
  proposals,
  groundTruth,
}: {
  proposals: Proposal[];
  groundTruth: GroundTruthMap;
}) {
  const { data, isLoading, error } = db.useQuery({
    evals: { $: { where: { promptVersion: PROMPT_VERSION } } },
  });
  const cells = (data?.evals ?? []) as unknown as EvalCell[];
  const modelScores = useMemo(
    () => fundingBenchScores(cells, proposals, groundTruth),
    [cells, proposals, groundTruth],
  );

  if (isLoading) return <p className="text-sm text-neutral-500">loading scores…</p>;
  if (error)
    return <p className="text-sm text-orange-600">error loading scores: {error.message}</p>;
  if (modelScores.length === 0)
    return (
      <p className="text-sm text-neutral-500">
        No eval runs yet — run <code className="text-orange-600">bun run eval</code>.
      </p>
    );

  const chartPoints = modelScores.flatMap((s) => {
    const meta = MODEL_META.find((m) => m.id === s.model);
    return meta ? [{ label: meta.label, released: meta.released, score: s.score, n: s.n }] : [];
  });

  return (
    <div>
      <p className="mt-1 max-w-2xl text-xs text-neutral-500">
        Per cell: accuracy = max(0, 1 − |log₁₀(predicted/actual)|/3) × 100 — 100 is exact, 0 is off
        by ≥1000× — averaged over all funder × project cells. Points at each model&apos;s release
        date.
      </p>
      <div className="mt-4">
        <ScoreChart points={chartPoints} />
      </div>
      <table className="mt-2 w-full max-w-2xl border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-orange-500 text-left">
            <th className="py-2 pr-4">model</th>
            <th className="py-2 pr-4">released</th>
            <th className="py-2 pr-4">score</th>
            <th className="py-2">cells</th>
          </tr>
        </thead>
        <tbody>
          {modelScores.map((s) => {
            const meta = MODEL_META.find((m) => m.id === s.model);
            return (
              <tr key={s.model} className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2 pr-4">{meta?.label ?? s.model}</td>
                <td className="py-2 pr-4">{meta?.released ?? "—"}</td>
                <td className="py-2 pr-4 font-bold text-orange-600">{s.score.toFixed(1)}</td>
                <td className="py-2">{s.n}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
