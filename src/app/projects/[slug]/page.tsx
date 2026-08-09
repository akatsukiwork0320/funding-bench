import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getProposal, getProposals } from "@/lib/data";

export function generateStaticParams() {
  return getProposals().map((p) => ({ slug: p.slug }));
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getProposal(slug);
  if (!p) notFound();

  return (
    <article>
      <Link href="/projects" className="text-sm underline hover:text-orange-600">
        ← all proposals
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{p.title}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1 border-y-2 border-orange-500 py-3 text-sm sm:grid-cols-4">
        <dt className="text-neutral-500">creator</dt>
        <dd>{p.creator_name}</dd>
        <dt className="text-neutral-500">posted</dt>
        <dd>{p.proposal_date}</dd>
        <dt className="text-neutral-500">min ask</dt>
        <dd>${p.min_funding.toLocaleString()}</dd>
        <dt className="text-neutral-500">max ask</dt>
        <dd>${p.funding_goal.toLocaleString()}</dd>
      </dl>
      <div className="prose-bench mt-6">
        <ReactMarkdown>{p.description}</ReactMarkdown>
      </div>
      <p className="mt-8 text-xs text-neutral-500">
        Source:{" "}
        <a href={p.url} className="underline">
          {p.url}
        </a>{" "}
        (funding data hidden from evaluated models)
      </p>
    </article>
  );
}
