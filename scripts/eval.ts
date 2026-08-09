// Run the benchmark: N models × M funder rubrics × K proposals via OpenRouter,
// writing one eval row per cell to InstantDB.
//
// Usage:
//   bun run scripts/eval.ts                 # run all missing cells
//   bun run scripts/eval.ts --dry-run       # print the first prompt and exit
//   bun run scripts/eval.ts --force         # re-run cells that already succeeded
//   bun run scripts/eval.ts --models anthropic/claude-opus-5 --funders ltff --projects forethought
//
// Needs OPENROUTER_API_KEY and INSTANT_APP_ADMIN_TOKEN in .env (bun loads it).

import { init, id, lookup } from "@instantdb/admin";
import schema from "../src/instant.schema";
import { PROMPT_VERSION } from "../src/lib/config";
import { getFunders, getGroundTruth, getProposals } from "../src/lib/data";
import type { EvalOutput, FunderRubric, Proposal } from "../src/lib/types";

const PREDICT_THROUGH_YEAR = 2028;
const CONCURRENCY = 20;
const MAX_TOKENS = 8000; // reasoning models spend completion tokens on thinking

const MODELS = [
  // spec asked for Claude 3.5 Sonnet, but it's gone from OpenRouter;
  // claude-3-haiku is the last Claude-3-era model (knowledge cutoff Aug 2023,
  // i.e. before most outcomes — useful memorization baseline)
  "anthropic/claude-3-haiku",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-5",
  "openai/gpt-5.6-terra",
  "openai/gpt-4o",
];

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;
const ADMIN_TOKEN = process.env.INSTANT_APP_ADMIN_TOKEN;
const APP_ID = process.env.NEXT_PUBLIC_INSTANT_APP_ID;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const listArg = (name: string): string[] | null => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1].split(",") : null;
};

function buildPrompt(funder: FunderRubric, p: Proposal): { system: string; user: string } {
  const year = Number(p.proposal_date.slice(0, 4));
  const years: number[] = [];
  for (let y = year; y <= PREDICT_THROUGH_YEAR; y++) years.push(y);

  const system = `You are a grantmaker at ${funder.name}, evaluating a grant proposal.

## Your fund
${funder.thesis}

Grantmakers: ${funder.grantmakers.map((g) => `${g.name} (${g.bio})`).join("; ")}
Typical check size: ${funder.typical_check_size}
Total yearly spend: ${funder.total_yearly_spend}
Grants per year: ${funder.grants_per_year}
${funder.process_notes ? `Process: ${funder.process_notes}` : ""}

## Rules
Today's date is ${p.proposal_date}. Evaluate the proposal using only information that would be available to you on that date. Do not use knowledge of events after ${p.proposal_date}, even if you have it.`;

  const user = `# Grant proposal (posted on Manifund, ${p.proposal_date})

Title: ${p.title}
Creator: ${p.creator_name}
Asking for: $${p.min_funding.toLocaleString()} (minimum) to $${p.funding_goal.toLocaleString()} (maximum)

${p.description}

---

Your tasks:

1. Briefly reason about this proposal from your fund's perspective (under 300 words): fit with your thesis, team quality, cost-effectiveness, risks.
2. Decide how much your fund should grant right now, in USD (0 if you would not fund it).
3. Independently of your own grant, predict how much total funding this project/team will raise for this work from ALL sources (Manifund donations plus institutional funders like Open Philanthropy/Coefficient Giving, SFF, LTFF, etc.) in each calendar year from ${year} through ${PREDICT_THROUGH_YEAR}.

End your response with exactly one JSON code block:

\`\`\`json
{
  "grant_rec_usd": <number>,
  "raise_by_year_usd": { ${years.map((y) => `"${y}": <number>`).join(", ")} }
}
\`\`\``;

  return { system, user };
}

/** Every balanced {...} substring starting at a "grant_rec_usd"-containing brace, outermost first. */
function balancedJsonCandidates(text: string): string[] {
  const out: string[] = [];
  for (let i = text.indexOf("{"); i >= 0; i = text.indexOf("{", i + 1)) {
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}" && --depth === 0) {
        const cand = text.slice(i, j + 1);
        if (cand.includes("grant_rec_usd")) out.push(cand);
        break;
      }
    }
  }
  return out;
}

function parseOutput(text: string): EvalOutput {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const candidates = [...blocks.reverse(), ...balancedJsonCandidates(text)];
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c.trim());
      if (
        typeof obj.grant_rec_usd === "number" &&
        obj.raise_by_year_usd &&
        typeof obj.raise_by_year_usd === "object" &&
        !Array.isArray(obj.raise_by_year_usd)
      ) {
        // coerce numeric strings; reject anything else so bad values can't
        // silently corrupt scoring
        const byYear: Record<string, number> = {};
        for (const [year, v] of Object.entries(obj.raise_by_year_usd)) {
          const n = typeof v === "number" ? v : Number(v);
          if (!Number.isFinite(n)) throw new Error(`non-numeric raise for ${year}`);
          byYear[year] = n;
        }
        return { grant_rec_usd: obj.grant_rec_usd, raise_by_year_usd: byYear };
      }
    } catch {
      // try next candidate
    }
  }
  throw new Error("no valid JSON output block found");
}

async function callOpenRouter(model: string, system: string, user: string) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/akrolsmir/funding-bench",
      "X-Title": "Funding Bench",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      usage: { include: true },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`openrouter ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`openrouter: ${JSON.stringify(json.error).slice(0, 300)}`);
  const text: string = json.choices?.[0]?.message?.content ?? "";
  const costUsd: number | undefined = json.usage?.cost;
  return { text, costUsd };
}

async function withRetries<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String(e);
      if (!/429|5\d\d|overloaded|timeout/i.test(msg) && i > 0) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
    }
  }
  throw lastErr;
}

async function verifyModels(models: string[]) {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${OPENROUTER_KEY}` },
  });
  if (!res.ok) throw new Error(`could not list openrouter models: ${res.status}`);
  const { data } = (await res.json()) as { data: { id: string }[] };
  const ids = new Set(data.map((m) => m.id));
  const missing = models.filter((m) => !ids.has(m));
  if (missing.length) {
    console.error(`\nThese model ids don't exist on OpenRouter: ${missing.join(", ")}`);
    for (const m of missing) {
      const stem = m.split("/")[1]?.split("-").slice(0, 2).join("-") ?? m;
      const near = data
        .filter((x) => x.id.includes(stem))
        .map((x) => x.id)
        .slice(0, 8);
      if (near.length) console.error(`  candidates for ${m}: ${near.join(", ")}`);
    }
    throw new Error("fix MODELS in scripts/eval.ts (or pass --models)");
  }
}

async function main() {
  const proposals = getProposals();
  const funders = getFunders();
  const groundTruthSlugs = Object.keys(getGroundTruth());

  const models = listArg("models") ?? MODELS;
  const funderFilter = listArg("funders");
  const projectFilter = listArg("projects");

  const selFunders = funders.filter((f) => !funderFilter || funderFilter.includes(f.slug));
  const selProjects = proposals.filter((p) => !projectFilter || projectFilter.includes(p.slug));

  if (flag("dry-run")) {
    const { system, user } = buildPrompt(selFunders[0], selProjects[0]);
    console.log("=== SYSTEM ===\n" + system + "\n\n=== USER ===\n" + user);
    return;
  }

  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY missing from .env");
  if (!ADMIN_TOKEN || !APP_ID) throw new Error("Instant env vars missing from .env");
  if (!groundTruthSlugs.length) console.warn("warning: ground-truth.json is empty");

  await verifyModels(models);

  const db = init({ appId: APP_ID, adminToken: ADMIN_TOKEN, schema });

  const existing = await db.query({
    evals: { $: { where: { promptVersion: PROMPT_VERSION } } },
  });
  const done = new Set(existing.evals.filter((e) => !e.error).map((e) => e.cellKey));

  const cells: { model: string; funder: FunderRubric; proposal: Proposal }[] = [];
  for (const model of models)
    for (const funder of selFunders)
      for (const proposal of selProjects) {
        const cellKey = `${PROMPT_VERSION}|${model}|${funder.slug}|${proposal.slug}`;
        if (!flag("force") && done.has(cellKey)) continue;
        cells.push({ model, funder, proposal });
      }

  console.log(
    `running ${cells.length} cells (${models.length} models × ${selFunders.length} funders × ${selProjects.length} projects, ${done.size} already done)`,
  );
  if (!cells.length) return;

  const runId = id();
  await db.transact(
    db.tx.runs[runId].update({
      createdAt: Date.now(),
      promptVersion: PROMPT_VERSION,
      notes: `models=${models.join(",")}`,
    }),
  );

  let completed = 0;
  let spent = 0;
  const queue = [...cells];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const cell = queue.shift()!;
      const cellKey = `${PROMPT_VERSION}|${cell.model}|${cell.funder.slug}|${cell.proposal.slug}`;
      const { system, user } = buildPrompt(cell.funder, cell.proposal);
      const started = Date.now();
      let update: Record<string, unknown>;
      try {
        const { text, costUsd } = await withRetries(() => callOpenRouter(cell.model, system, user));
        const out = parseOutput(text);
        spent += costUsd ?? 0;
        update = {
          grantRecUsd: out.grant_rec_usd,
          raiseByYearUsd: out.raise_by_year_usd,
          reasoning: text,
          error: null,
          costUsd,
        };
      } catch (e) {
        update = { error: String(e).slice(0, 500) };
        console.error(`  FAIL ${cellKey}: ${String(e).slice(0, 120)}`);
      }
      await db.transact(
        db.tx.evals[lookup("cellKey", cellKey)]
          .update({
            promptVersion: PROMPT_VERSION,
            model: cell.model,
            funderSlug: cell.funder.slug,
            projectSlug: cell.proposal.slug,
            latencyMs: Date.now() - started,
            createdAt: Date.now(),
            ...update,
          })
          .link({ run: runId }),
      );
      completed++;
      if (completed % 10 === 0 || completed === cells.length) {
        console.log(`  ${completed}/${cells.length} done, ~$${spent.toFixed(2)} spent`);
      }
    }
  });
  await Promise.all(workers);
  console.log(`finished. total cost ~$${spent.toFixed(2)}`);
}

main();
