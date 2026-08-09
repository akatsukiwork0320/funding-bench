import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { getFunder, getFunders } from "@/lib/data";

export function generateStaticParams() {
  return getFunders().map((f) => ({ slug: f.slug }));
}

export default async function FunderPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const f = getFunder(slug);
  if (!f) notFound();

  return (
    <article>
      <Link href="/funders" className="text-sm underline hover:text-orange-600">
        ← all funders
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{f.name}</h1>
      <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-1 border-y-2 border-orange-500 py-3 text-sm sm:grid-cols-2">
        <dt className="text-neutral-500">typical check size</dt>
        <dd>{f.typical_check_size || "—"}</dd>
        <dt className="text-neutral-500">yearly spend</dt>
        <dd>{f.total_yearly_spend || "—"}</dd>
        <dt className="text-neutral-500">grants per year</dt>
        <dd>{f.grants_per_year || "—"}</dd>
        <dt className="text-neutral-500">as of</dt>
        <dd>{f.as_of || "—"}</dd>
      </dl>

      <h2 className="mt-8 text-lg font-bold text-orange-600">Thesis</h2>
      <div className="prose-bench mt-2">
        <ReactMarkdown>{f.thesis}</ReactMarkdown>
      </div>

      {f.grantmakers.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold text-orange-600">Grantmakers</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {f.grantmakers.map((g) => (
              <li key={g.name}>
                <span className="font-bold">{g.name}</span> — {g.bio}
              </li>
            ))}
          </ul>
        </>
      )}

      {f.process_notes && (
        <>
          <h2 className="mt-8 text-lg font-bold text-orange-600">Process</h2>
          <div className="prose-bench mt-2">
            <ReactMarkdown>{f.process_notes}</ReactMarkdown>
          </div>
        </>
      )}

      {f.sources.length > 0 && (
        <>
          <h2 className="mt-8 text-lg font-bold text-orange-600">Sources</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {f.sources.map((s) => (
              <li key={s}>
                <a href={s} className="underline break-all">
                  {s}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}
