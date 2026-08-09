import Link from "next/link";
import { getProposals } from "@/lib/data";

const COHORT_LABELS: Record<string, string> = {
  named: "large",
  funded: "well-funded",
  random: "random",
};

export default function ProjectsPage() {
  const proposals = getProposals();
  return (
    <div>
      <h1 className="text-2xl font-bold">
        Proposals <span className="text-orange-600">({proposals.length})</span>
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        Shown exactly as models see them: no comments, no funding outcomes.
      </p>
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-orange-500 text-left">
            <th className="py-2 pr-4">date</th>
            <th className="py-2 pr-4">title</th>
            <th className="py-2 pr-4">ask (max)</th>
            <th className="py-2">cohort</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p) => (
            <tr
              key={p.slug}
              className="border-b border-neutral-200 align-top dark:border-neutral-800"
            >
              <td className="py-2 pr-4 whitespace-nowrap">{p.proposal_date}</td>
              <td className="py-2 pr-4">
                <Link href={`/projects/${p.slug}`} className="underline hover:text-orange-600">
                  {p.title}
                </Link>
                <div className="text-xs text-neutral-500">{p.creator_name}</div>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">${p.funding_goal.toLocaleString()}</td>
              <td className="py-2 whitespace-nowrap">
                <span className={p.cohort === "random" ? "text-neutral-500" : "text-orange-600"}>
                  {COHORT_LABELS[p.cohort]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
