import Link from "next/link";
import { getFunders } from "@/lib/data";

export default function FundersPage() {
  const funders = getFunders();
  return (
    <div>
      <h1 className="text-2xl font-bold">
        Funder rubrics <span className="text-orange-600">({funders.length})</span>
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        Each eval asks a model to act as a grantmaker from one of these funds. Rubrics summarize
        thesis, team, and check sizes from public sources.
      </p>
      <div className="mt-6 space-y-4">
        {funders.map((f) => (
          <Link
            key={f.slug}
            href={`/funders/${f.slug}`}
            className="block border-2 border-neutral-300 p-4 hover:border-orange-500 dark:border-neutral-700"
          >
            <div className="font-bold">{f.name}</div>
            <div className="mt-1 text-sm text-neutral-500">
              {f.typical_check_size && <>typical check {f.typical_check_size} · </>}
              {f.total_yearly_spend && <>{f.total_yearly_spend} · </>}
              {f.grants_per_year && <>{f.grants_per_year} grants/yr</>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
