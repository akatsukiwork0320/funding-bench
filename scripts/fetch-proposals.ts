// Fetch the benchmark's 20 project proposals from the public Manifund API.
// Writes:
//   data/proposals.json     — model-visible fields only (no funding outcomes)
//   data/ground-truth.json  — Manifund $ raised by year (external funding is
//                             merged in separately; see scripts/README notes)
// Run: bun run scripts/fetch-proposals.ts

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";

const API = "https://manifund.org/api/v0/projects";
const DATA_DIR = join(process.cwd(), "data");

// 5 large/successful-ish named in the spec + 5 other decently-funded,
// chosen for spread across 2023–2025.
const CURATED_SLUGS = [
  // named in spec
  "scoping-developmental-interpretability-xg55b33wsfc", // Timaeus
  "apollo-research-scale-up-interpretability--behavioral-model-evals-research",
  "support-for-deep-coverage-of-china-and-ai", // ChinaTalk
  "lightcone-infrastructure",
  "forethought",
  // other decently-funded
  "independent-researcher", // Joseph Bloom
  "10th-edition-of-ai-safety-camp",
  "finishing-the-sb-1047-documentary-in-6-weeks",
  "mox-a-coworking--events-space-in-sf",
  "creating-making-god-an-accessible-feature-documentary-on-risks-from-agi",
];

const RANDOM_COUNT = 10;
const SEED = 20260807; // fixed so selection is reproducible
// Random pool: AI-safety grant proposals old enough to have ≥1yr of follow-up.
const POOL_CUTOFF = "2025-09-01";
const AI_SAFETY_CAUSES = new Set(["tais", "ai-gov"]);

interface ApiProject {
  title: string;
  id: string;
  created_at: string;
  slug: string;
  blurb: string | null;
  description: unknown; // markdown string, or rich-text json for old projects
  stage: string;
  funding_goal: number;
  min_funding: number;
  type: string;
  profiles: { username: string; full_name: string } | null;
  txns: { amount: number; created_at?: string; type?: string; token?: string }[];
  bids: { amount: number; status: string }[];
  causes: { title: string; slug: string }[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fetchAllProjects(): Promise<ApiProject[]> {
  const all: ApiProject[] = [];
  let before: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = before ? `${API}?before=${encodeURIComponent(before)}` : API;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Manifund API ${res.status} for ${url}`);
    const batch = (await res.json()) as ApiProject[];
    if (batch.length === 0) break;
    // `before` is strict-exclusive, so projects sharing the boundary timestamp
    // could repeat or be skipped; dedupe by id as a safeguard.
    const seen = new Set(all.map((p) => p.id));
    all.push(...batch.filter((p) => !seen.has(p.id)));
    before = batch[batch.length - 1].created_at;
    process.stdout.write(`\rfetched ${all.length} projects…`);
  }
  console.log();
  return all;
}

// Old projects store descriptions as TipTap rich-text JSON; flatten to text.
function descriptionToMarkdown(desc: unknown): string {
  if (typeof desc === "string") return desc;
  if (!desc || typeof desc !== "object") return "";
  const parts: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "text" && typeof node.text === "string") parts.push(node.text);
    if (node.type === "heading") parts.push("\n\n## ");
    if (node.type === "paragraph") parts.push("\n\n");
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(desc);
  return parts
    .join("")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isEligibleForRandomPool(p: ApiProject): boolean {
  if (CURATED_SLUGS.includes(p.slug)) return false;
  if (p.type !== "grant") return false;
  if (p.created_at >= POOL_CUTOFF) return false;
  if (p.created_at < "2023-01-01") return false;
  if (!p.causes.some((c) => AI_SAFETY_CAUSES.has(c.slug))) return false;
  const desc = descriptionToMarkdown(p.description);
  if (desc.length < 500) return false; // skip junk/stub proposals
  if (!p.profiles?.full_name) return false;
  return true;
}

function manifundRaisedByYear(p: ApiProject): Record<string, number> {
  const byYear: Record<string, number> = {};
  for (const t of p.txns ?? []) {
    // project txns from this endpoint are donations to the project in USD
    if (t.token && t.token !== "USD") continue;
    const year = (t.created_at ?? "").slice(0, 4);
    if (!year) continue;
    byYear[year] = (byYear[year] ?? 0) + t.amount;
  }
  for (const y of Object.keys(byYear)) byYear[y] = Math.round(byYear[y]);
  return byYear;
}

async function main() {
  const all = await fetchAllProjects();
  const bySlug = new Map(all.map((p) => [p.slug, p]));

  const missing = CURATED_SLUGS.filter((s) => !bySlug.has(s));
  if (missing.length) throw new Error(`Curated slugs not found: ${missing.join(", ")}`);

  const pool = all.filter(isEligibleForRandomPool).sort((a, b) => a.slug.localeCompare(b.slug));
  console.log(`random pool: ${pool.length} eligible projects`);

  const rand = mulberry32(SEED);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const randomPicks = shuffled.slice(0, RANDOM_COUNT);

  const selected = [...CURATED_SLUGS.map((s) => bySlug.get(s)!), ...randomPicks];

  const proposals = selected.map((p, i) => ({
    slug: p.slug,
    cohort: i < 5 ? "named" : i < 10 ? "funded" : "random",
    title: p.title,
    blurb: p.blurb ?? "",
    description: descriptionToMarkdown(p.description),
    creator_name: p.profiles!.full_name,
    creator_username: p.profiles!.username,
    proposal_date: p.created_at.slice(0, 10),
    funding_goal: p.funding_goal,
    min_funding: p.min_funding,
    causes: p.causes.map((c) => c.slug),
    url: `https://manifund.org/projects/${p.slug}`,
  }));

  // Preserve any hand-researched external funding already in ground-truth.json
  const gtPath = join(DATA_DIR, "ground-truth.json");
  const existing: Record<string, any> = existsSync(gtPath)
    ? JSON.parse(readFileSync(gtPath, "utf8"))
    : {};

  const groundTruth: Record<string, any> = {};
  for (const p of selected) {
    // NOTE: this endpoint's txns carry {amount, token} only — no dates — so
    // manifundRaisedByYear() comes back empty here. Yearly breakdowns are
    // researched separately (merge-research.ts); never clobber them with {}.
    const recomputedByYear = manifundRaisedByYear(p);
    const existingByYear = existing[p.slug]?.manifund_raised_by_year ?? {};
    const byYear = Object.keys(recomputedByYear).length > 0 ? recomputedByYear : existingByYear;
    const total = Math.round(
      (p.txns ?? []).filter((t) => !t.token || t.token === "USD").reduce((s, t) => s + t.amount, 0),
    );
    const bySum = Object.values(byYear as Record<string, number>).reduce((s, v) => s + v, 0);
    if (Object.keys(byYear).length > 0 && Math.abs(bySum - total) > 2) {
      console.warn(
        `WARNING ${p.slug}: yearly sum $${bySum} != total $${total} — yearly data may be stale`,
      );
    }
    groundTruth[p.slug] = {
      manifund_raised_by_year: byYear,
      manifund_total_raised: total,
      stage: p.stage,
      external_funding: existing[p.slug]?.external_funding ?? [],
      notes: existing[p.slug]?.notes ?? "",
      research_summary: existing[p.slug]?.research_summary ?? "",
      fetched_at: new Date().toISOString().slice(0, 10),
    };
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(join(DATA_DIR, "proposals.json"), JSON.stringify(proposals, null, 2));
  writeFileSync(gtPath, JSON.stringify(groundTruth, null, 2));

  console.log(`wrote ${proposals.length} proposals`);
  for (const p of proposals) {
    console.log(
      `  [${p.cohort}] ${p.proposal_date} ${p.slug} (goal $${p.funding_goal.toLocaleString()})`,
    );
  }
}

main();
