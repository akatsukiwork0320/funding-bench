import Link from "next/link";
import ScoreHeadline from "@/components/score-headline";
import { getFunders, getGroundTruth, getProposals } from "@/lib/data";

export default function Home() {
  const proposals = getProposals();
  const funders = getFunders();
  const cohorts = {
    named: proposals.filter((p) => p.cohort === "named").length,
    funded: proposals.filter((p) => p.cohort === "funded").length,
    random: proposals.filter((p) => p.cohort === "random").length,
  };

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold">
          Can LLMs judge grant proposals<span className="text-orange-600">?</span>
        </h1>
        <p className="mt-4 max-w-2xl leading-relaxed">
          Funding Bench shows models historical AI-safety grant proposals from{" "}
          <a href="https://manifund.org" className="underline">
            Manifund
          </a>{" "}
          — with all funding outcomes stripped — and asks them, in the persona of a real funder, to
          (1) recommend a grant amount and (2) predict how much the project will actually raise,
          year by year. Predictions are scored against what happened.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-bold">
          FundingBench Score <span className="text-orange-600">over time</span>
        </h2>
        <ScoreHeadline proposals={getProposals()} groundTruth={getGroundTruth()} />
        <p className="mt-2 text-sm">
          <Link href="/results" className="underline hover:text-orange-600">
            full results →
          </Link>
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/projects"
          className="border-2 border-neutral-300 p-4 hover:border-orange-500 dark:border-neutral-700"
        >
          <div className="text-3xl font-bold text-orange-600">{proposals.length}</div>
          <div className="text-sm">
            proposals ({cohorts.named} large, {cohorts.funded} well-funded, {cohorts.random} random)
          </div>
        </Link>
        <Link
          href="/funders"
          className="border-2 border-neutral-300 p-4 hover:border-orange-500 dark:border-neutral-700"
        >
          <div className="text-3xl font-bold text-orange-600">{funders.length}</div>
          <div className="text-sm">funder rubrics (LTFF, SFF, 2× Coefficient Giving)</div>
        </Link>
        <Link
          href="/results"
          className="border-2 border-neutral-300 p-4 hover:border-orange-500 dark:border-neutral-700"
        >
          <div className="text-3xl font-bold text-orange-600">5</div>
          <div className="text-sm">models evaluated → results</div>
        </Link>
      </section>

      <section className="max-w-2xl space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-bold">Method</h2>
        <p>
          Each model sees a proposal exactly as it appeared at posting time (title, description,
          creator, ask range) plus a rubric describing one funder&apos;s thesis, team, and check
          sizes. It must reason briefly, then output a grant recommendation and a per-year forecast
          of total money raised through 2028.
        </p>
        <p>
          Scoring compares forecasts to ground truth assembled from Manifund transactions plus
          public grant databases (Coefficient Giving, SFF, LTFF payout reports). Headline metrics:
          median absolute log-error of predicted vs. actual raise, and Spearman rank correlation
          across projects.
        </p>
        <p className="text-neutral-500">
          Known limitation: models may have memorized outcomes for famous projects (Apollo, Timaeus,
          Lightcone…). The &quot;named&quot; cohort is flagged so you can compare.
        </p>
      </section>
    </div>
  );
}
