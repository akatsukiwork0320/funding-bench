// Merge multi-agent research output (data/research-raw.json) into
// data/ground-truth.json and data/funders.json.
//
// research-raw.json shape: { projects: [...], rubrics: [...] } — see
// ExternalFundingEntry / FunderRubric in src/lib/types.ts.
//
// Run: bun run scripts/merge-research.ts

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ExternalFundingEntry, FunderRubric, GroundTruthMap } from "../src/lib/types";

const DATA_DIR = join(process.cwd(), "data");

interface ResearchedProject {
  slug: string;
  manifund_raised_by_year: Record<string, number>;
  external_funding: ExternalFundingEntry[];
  org_note: string;
  research_summary?: string;
}

interface ResearchRaw {
  projects: ResearchedProject[];
  rubrics: FunderRubric[];
}

const raw: ResearchRaw = JSON.parse(readFileSync(join(DATA_DIR, "research-raw.json"), "utf8"));
const gt: GroundTruthMap = JSON.parse(readFileSync(join(DATA_DIR, "ground-truth.json"), "utf8"));

let merged = 0;
for (const rp of raw.projects) {
  const entry = gt[rp.slug];
  if (!entry) {
    console.warn(`skipping unknown slug from research: ${rp.slug}`);
    continue;
  }
  entry.manifund_raised_by_year = rp.manifund_raised_by_year;
  entry.external_funding = rp.external_funding;
  entry.notes = rp.org_note;
  entry.research_summary = rp.research_summary ?? "";
  merged++;
}
writeFileSync(join(DATA_DIR, "ground-truth.json"), JSON.stringify(gt, null, 2));
console.log(`merged research for ${merged} projects into ground-truth.json`);

// Merge rubrics by slug into the existing funders.json; the benchmark's four
// funders are fixed, so rubrics for anything else (e.g. superseded cG programs)
// are dropped.
const FUNDER_SLUGS = ["ltff", "sff", "cg-ntai", "cg-gcro"];
if (raw.rubrics?.length) {
  const existing: FunderRubric[] = JSON.parse(readFileSync(join(DATA_DIR, "funders.json"), "utf8"));
  const bySlug = new Map(existing.map((f) => [f.slug, f]));
  for (const r of raw.rubrics) {
    if (!FUNDER_SLUGS.includes(r.slug)) {
      console.warn(`dropping rubric for non-benchmark funder: ${r.slug}`);
      continue;
    }
    bySlug.set(r.slug, r);
  }
  const rubrics = FUNDER_SLUGS.filter((s) => bySlug.has(s)).map((s) => bySlug.get(s)!);
  writeFileSync(join(DATA_DIR, "funders.json"), JSON.stringify(rubrics, null, 2));
  console.log(`funders.json now has: ${rubrics.map((r) => r.slug).join(", ")}`);
}

// sanity: every ground-truth project should have yearly manifund data now
const missingYearly = Object.entries(gt).filter(
  ([, v]) => v.manifund_total_raised > 0 && Object.keys(v.manifund_raised_by_year).length === 0,
);
if (missingYearly.length) {
  console.warn(
    `WARNING: projects with raised>0 but no yearly breakdown: ${missingYearly
      .map(([slug]) => slug)
      .join(", ")}`,
  );
}
