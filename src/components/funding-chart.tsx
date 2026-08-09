"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MODEL_META, PROMPT_VERSION } from "@/lib/config";
import { db } from "@/lib/db";
import { LAST_ACTUAL_YEAR, actualByYear, median, proposalYear } from "@/lib/scoring";
import type { EvalCell, FunderRubric, GroundTruth, Proposal } from "@/lib/types";

/** Predictions run through this year (see EvalOutput.raise_by_year_usd). */
const PRED_LAST_YEAR = 2028;
/** Log-scale display floor, same as scoring's EPS_USD. */
const LOG_FLOOR = 1000;

/** Categorical slots (globals.css), assigned to models in MODEL_META order. */
const MODEL_VARS = ["--chart-s1", "--chart-s2", "--chart-s3", "--chart-s4", "--chart-s5"];
/** Fixed shape per funder rubric, by funders.json order. */
const SHAPES = ["circle", "square", "triangle", "diamond", "plus", "cross"] as const;
type Shape = (typeof SHAPES)[number];

const fmtC = (n: number) =>
  n >= 1e6
    ? `$${Number((n / 1e6).toPrecision(3))}M`
    : n >= 1e3
      ? `$${Math.round(n / 1e3)}k`
      : `$${Math.round(n)}`;

const funderShort = (slug: string) => slug.toUpperCase().replace(/-/g, " ");
const modelLabel = (id: string) =>
  MODEL_META.find((m) => m.id === id)?.label ?? id.split("/").pop() ?? id;

/** SVG glyph, centered at (cx, cy). `s` ≈ half-size. */
function Glyph({
  shape,
  cx,
  cy,
  s,
  fill,
  ring,
  opacity = 1,
}: {
  shape: Shape;
  cx: number;
  cy: number;
  s: number;
  fill: string;
  ring?: boolean;
  opacity?: number;
}) {
  const common = {
    fill,
    opacity,
    stroke: ring ? "var(--background)" : "none",
    strokeWidth: ring ? 2 : 0,
  };
  switch (shape) {
    case "circle":
      return <circle cx={cx} cy={cy} r={s} {...common} />;
    case "square":
      return (
        <rect x={cx - s * 0.9} y={cy - s * 0.9} width={s * 1.8} height={s * 1.8} {...common} />
      );
    case "triangle":
      return (
        <path
          d={`M${cx},${cy - s * 1.15} L${cx + s * 1.1},${cy + s * 0.85} L${cx - s * 1.1},${cy + s * 0.85} Z`}
          {...common}
        />
      );
    case "diamond":
      return (
        <path
          d={`M${cx},${cy - s * 1.25} L${cx + s * 1.25},${cy} L${cx},${cy + s * 1.25} L${cx - s * 1.25},${cy} Z`}
          {...common}
        />
      );
    case "plus": {
      const t = s * 0.42;
      return (
        <path
          d={`M${cx - t},${cy - s} h${t * 2} v${s - t} h${s - t} v${t * 2} h${-(s - t)} v${s - t} h${-t * 2} v${-(s - t)} h${-(s - t)} v${-t * 2} h${s - t} Z`}
          {...common}
        />
      );
    }
    case "cross": {
      const t = s * 0.42;
      return (
        <g transform={`rotate(45 ${cx} ${cy})`}>
          <path
            d={`M${cx - t},${cy - s} h${t * 2} v${s - t} h${s - t} v${t * 2} h${-(s - t)} v${s - t} h${-t * 2} v${-(s - t)} h${-(s - t)} v${-t * 2} h${s - t} Z`}
            {...common}
          />
        </g>
      );
    }
  }
}

interface SeriesMeta {
  key: string;
  model: string;
  /** Absent on median-across-rubrics series. */
  funderSlug?: string;
  color: string;
  shape: Shape;
}

export default function FundingChart({
  proposal,
  groundTruth,
  funders,
}: {
  proposal: Proposal;
  groundTruth: GroundTruth | null;
  funders: FunderRubric[];
}) {
  const { data, isLoading } = db.useQuery({
    evals: { $: { where: { promptVersion: PROMPT_VERSION, projectSlug: proposal.slug } } },
  });
  const cells = ((data?.evals ?? []) as unknown as EvalCell[]).filter(
    (c) => !c.error && c.raiseByYearUsd,
  );

  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState<"log" | "linear">("log");
  const [hiddenModels, setHiddenModels] = useState<Set<string>>(new Set());
  const [hiddenFunders, setHiddenFunders] = useState<Set<string>>(new Set());
  const [hoverModel, setHoverModel] = useState<string | null>(null);
  const [hoverFunder, setHoverFunder] = useState<string | null>(null);

  const { rows, raw, medianSeries, cellSeries, years, models, yTicks, yDomain } = useMemo(() => {
    const propYear = proposalYear(proposal);
    const truthTotal = groundTruth ? actualByYear(groundTruth) : {};
    const manifund = groundTruth?.manifund_raised_by_year ?? {};
    const truthYears = Object.keys(truthTotal).map(Number);
    const startYear = Math.min(propYear, ...(truthYears.length ? truthYears : [propYear]));
    const years: number[] = [];
    for (let y = startYear; y <= PRED_LAST_YEAR; y++) years.push(y);

    const present = new Set(cells.map((c) => c.model));
    const known = MODEL_META.map((m) => m.id).filter((m) => present.has(m));
    const models = [...known, ...[...present].filter((m) => !known.includes(m)).sort()];
    const colorOf = (model: string) =>
      `var(${MODEL_VARS[Math.max(models.indexOf(model), 0) % MODEL_VARS.length]})`;
    const shapeOf = (slug: string) =>
      SHAPES[
        Math.max(
          funders.findIndex((f) => f.slug === slug),
          0,
        ) % SHAPES.length
      ];

    // raw = true cumulative values (0 allowed); rows = log-floored for plotting.
    const raw = new Map<string, Record<number, number>>();
    const cum = (byYear: Record<string, number>, upTo: number) => {
      const out: Record<number, number> = {};
      let acc = 0;
      for (const y of years) {
        if (y > upTo) break;
        acc += byYear[String(y)] ?? 0;
        out[y] = acc;
      }
      return out;
    };
    if (groundTruth) {
      raw.set("truthTotal", cum(truthTotal, LAST_ACTUAL_YEAR));
      raw.set("truthManifund", cum(manifund, LAST_ACTUAL_YEAR));
    }

    const cellSeries: SeriesMeta[] = cells.map((c) => {
      const key = `p_${models.indexOf(c.model)}_${funders.findIndex((f) => f.slug === c.funderSlug)}`;
      raw.set(key, cum(c.raiseByYearUsd!, PRED_LAST_YEAR));
      return {
        key,
        model: c.model,
        funderSlug: c.funderSlug,
        color: colorOf(c.model),
        shape: shapeOf(c.funderSlug),
      };
    });

    // One point per model per year: median of that model's per-rubric cumulatives.
    const medianSeries: SeriesMeta[] = models.map((m) => {
      const key = `m_${models.indexOf(m)}`;
      const keys = cellSeries.filter((s) => s.model === m).map((s) => s.key);
      const byYear: Record<number, number> = {};
      for (const y of years) {
        const vals = keys.map((k) => raw.get(k)?.[y]).filter((v): v is number => v !== undefined);
        if (vals.length) byYear[y] = median(vals);
      }
      raw.set(key, byYear);
      return { key, model: m, color: colorOf(m), shape: "circle" };
    });

    const rows = years.map((year) => {
      const row: Record<string, number> = { year };
      for (const [key, byYear] of raw) {
        if (byYear[year] !== undefined)
          row[key] = scale === "log" ? Math.max(byYear[year], LOG_FLOOR) : byYear[year];
      }
      return row;
    });

    // Y ticks: powers of 10 hugging the data range (stable across the toggle).
    let max = LOG_FLOOR;
    let min = Infinity;
    for (const byYear of raw.values())
      for (const v of Object.values(byYear)) {
        max = Math.max(max, v);
        min = Math.min(min, Math.max(v, LOG_FLOOR));
      }
    if (!Number.isFinite(min)) min = LOG_FLOOR;
    const bottom = Math.max(10 ** Math.floor(Math.log10(min)), LOG_FLOOR);
    const yTicks: number[] = [];
    for (let t = bottom; t <= max; t *= 10) yTicks.push(t);
    const yDomain: [number, number] = [bottom / 1.15, max * 1.15];

    return { rows, raw, medianSeries, cellSeries, years, models, yTicks, yDomain };
  }, [cells, proposal, groundTruth, funders, scale]);

  const series = expanded ? cellSeries : medianSeries;
  const visible = (s: SeriesMeta) =>
    !hiddenModels.has(s.model) && !(s.funderSlug && hiddenFunders.has(s.funderSlug));
  const emphasis = (s: SeriesMeta): "hi" | "lo" | "base" => {
    if (!hoverModel && !hoverFunder) return "base";
    return (hoverModel && s.model === hoverModel) || (hoverFunder && s.funderSlug === hoverFunder)
      ? "hi"
      : "lo";
  };

  const toggle = (set: Set<string>, v: string, apply: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const colorOf = (model: string) =>
    `var(${MODEL_VARS[Math.max(models.indexOf(model), 0) % MODEL_VARS.length]})`;
  const shapeOf = (slug: string) =>
    SHAPES[
      Math.max(
        funders.findIndex((f) => f.slug === slug),
        0,
      ) % SHAPES.length
    ];
  const visibleFunders = funders.filter((f) => cellSeries.some((s) => s.funderSlug === f.slug));

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Predicted funding over time</h2>
        <div className="flex flex-wrap items-center gap-3">
          {cells.length > 0 && (
            <div role="group" aria-label="Prediction detail" className="flex text-xs">
              <button
                aria-pressed={!expanded}
                onClick={() => setExpanded(false)}
                className={`border border-neutral-300 px-2 py-1 dark:border-neutral-700 ${
                  !expanded
                    ? "border-orange-500 font-bold text-orange-600"
                    : "hover:text-orange-600"
                }`}
              >
                Median per model
              </button>
              <button
                aria-pressed={expanded}
                onClick={() => setExpanded(true)}
                className={`-ml-px border border-neutral-300 px-2 py-1 dark:border-neutral-700 ${
                  expanded ? "border-orange-500 font-bold text-orange-600" : "hover:text-orange-600"
                }`}
              >
                All rubric predictions
              </button>
            </div>
          )}
          <div role="group" aria-label="Y-axis scale" className="flex text-xs">
            <button
              aria-pressed={scale === "log"}
              onClick={() => setScale("log")}
              className={`border border-neutral-300 px-2 py-1 dark:border-neutral-700 ${
                scale === "log"
                  ? "border-orange-500 font-bold text-orange-600"
                  : "hover:text-orange-600"
              }`}
            >
              Log
            </button>
            <button
              aria-pressed={scale === "linear"}
              onClick={() => setScale("linear")}
              className={`-ml-px border border-neutral-300 px-2 py-1 dark:border-neutral-700 ${
                scale === "linear"
                  ? "border-orange-500 font-bold text-orange-600"
                  : "hover:text-orange-600"
              }`}
            >
              Linear
            </button>
          </div>
        </div>
      </div>

      {/* Legend: model colors (+ funder shapes when expanded); click to toggle, hover to highlight */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="flex items-center gap-1.5">
          <svg width="20" height="12" aria-hidden>
            <line x1="1" y1="6" x2="19" y2="6" stroke="var(--foreground)" strokeWidth="2.5" />
          </svg>
          Actual (Manifund + external)
        </span>
        <span className="flex items-center gap-1.5 text-neutral-500">
          <svg width="20" height="12" aria-hidden>
            <line
              x1="1"
              y1="6"
              x2="19"
              y2="6"
              stroke="var(--chart-muted)"
              strokeWidth="2"
              strokeDasharray="4 3"
            />
          </svg>
          Manifund only
        </span>
        {models.map((m) => (
          <button
            key={m}
            aria-pressed={!hiddenModels.has(m)}
            onClick={() => toggle(hiddenModels, m, setHiddenModels)}
            onMouseEnter={() => setHoverModel(m)}
            onMouseLeave={() => setHoverModel(null)}
            onFocus={() => setHoverModel(m)}
            onBlur={() => setHoverModel(null)}
            className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 ${
              hiddenModels.has(m) ? "opacity-40" : ""
            }`}
            title={m}
          >
            <svg width="20" height="12" aria-hidden>
              <line x1="1" y1="6" x2="19" y2="6" stroke={colorOf(m)} strokeWidth="2.5" />
            </svg>
            {modelLabel(m)}
          </button>
        ))}
      </div>
      {expanded && visibleFunders.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {visibleFunders.map((f) => (
            <button
              key={f.slug}
              aria-pressed={!hiddenFunders.has(f.slug)}
              onClick={() => toggle(hiddenFunders, f.slug, setHiddenFunders)}
              onMouseEnter={() => setHoverFunder(f.slug)}
              onMouseLeave={() => setHoverFunder(null)}
              onFocus={() => setHoverFunder(f.slug)}
              onBlur={() => setHoverFunder(null)}
              className={`flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-900 ${
                hiddenFunders.has(f.slug) ? "opacity-40" : ""
              }`}
              title={f.name}
            >
              <svg width="14" height="14" aria-hidden>
                <Glyph shape={shapeOf(f.slug)} cx={7} cy={7} s={4.5} fill="var(--chart-muted)" />
              </svg>
              {funderShort(f.slug)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            {years[years.length - 1] > LAST_ACTUAL_YEAR && (
              <ReferenceArea
                x1={LAST_ACTUAL_YEAR}
                x2={years[years.length - 1]}
                fill="var(--chart-grid)"
                fillOpacity={0.25}
              />
            )}
            <XAxis
              dataKey="year"
              type="number"
              domain={[years[0], years[years.length - 1]]}
              ticks={years}
              tickFormatter={String}
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-grid)" }}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              scale={scale}
              domain={scale === "log" ? yDomain : [0, "auto"]}
              ticks={scale === "log" ? yTicks : undefined}
              tickCount={scale === "linear" ? 5 : undefined}
              allowDecimals={false}
              tickFormatter={fmtC}
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ stroke: "var(--chart-muted)", strokeWidth: 1 }}
              isAnimationActive={false}
              content={({ active, label }) =>
                active && label !== undefined ? (
                  <ChartTooltip
                    year={Number(label)}
                    raw={raw}
                    expanded={expanded}
                    series={series.filter(visible)}
                    funders={visibleFunders.filter((f) => !hiddenFunders.has(f.slug))}
                    models={models.filter((m) => !hiddenModels.has(m))}
                    colorOf={colorOf}
                    shapeOf={shapeOf}
                    hasTruth={!!groundTruth}
                  />
                ) : null
              }
            />
            {/* prediction series: color = model, shape = funder rubric */}
            {series.map((s) =>
              visible(s) ? (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={emphasis(s) === "hi" ? 2 : 1}
                  strokeOpacity={{ hi: 0.9, base: expanded ? 0.3 : 0.5, lo: 0.08 }[emphasis(s)]}
                  isAnimationActive={false}
                  dot={(props: { key?: React.Key | null; cx?: number; cy?: number }) => {
                    const { key, cx, cy } = props;
                    if (cx === undefined || cy === undefined) return <g key={key} />;
                    return (
                      <Glyph
                        key={key}
                        shape={s.shape}
                        cx={cx}
                        cy={cy}
                        s={4.5}
                        fill={s.color}
                        ring
                        opacity={{ hi: 1, base: 0.85, lo: 0.12 }[emphasis(s)]}
                      />
                    );
                  }}
                  activeDot={false}
                />
              ) : null,
            )}
            {/* truth: bold ink lines, drawn last so they sit on top */}
            {groundTruth && (
              <Line
                dataKey="truthManifund"
                stroke="var(--chart-muted)"
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                isAnimationActive={false}
                activeDot={false}
              />
            )}
            {groundTruth && (
              <Line
                dataKey="truthTotal"
                stroke="var(--foreground)"
                strokeWidth={2.5}
                dot={{
                  r: 3,
                  fill: "var(--foreground)",
                  stroke: "var(--background)",
                  strokeWidth: 2,
                }}
                isAnimationActive={false}
                activeDot={{ r: 4 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-2 text-xs text-neutral-500">
        {scale === "log" && "Values floored at $1k for the log scale. "}
        Actuals (solid lines) run through {LAST_ACTUAL_YEAR} — partial year, shaded region is
        forecast-only. Predictions from prompt {PROMPT_VERSION}
        {isLoading ? ", loading…" : cells.length === 0 ? " — no eval runs yet." : "."}
      </p>

      {/* Table view: the non-hover, non-color channel for every plotted value */}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-orange-600">
          Data table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b-2 border-orange-500 text-left">
                <th className="py-1.5 pr-4">series</th>
                {years.map((y) => (
                  <th key={y} className="py-1.5 pr-4 text-right tabular-nums">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groundTruth && (
                <>
                  <TableRow
                    label="Actual (Manifund + external)"
                    byYear={raw.get("truthTotal")}
                    years={years}
                    bold
                  />
                  <TableRow
                    label="Actual, Manifund only"
                    byYear={raw.get("truthManifund")}
                    years={years}
                  />
                </>
              )}
              {series.map((s) => (
                <TableRow
                  key={s.key}
                  label={
                    s.funderSlug
                      ? `${modelLabel(s.model)} — ${funderShort(s.funderSlug)}`
                      : `${modelLabel(s.model)} (median)`
                  }
                  byYear={raw.get(s.key)}
                  years={years}
                />
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function TableRow({
  label,
  byYear,
  years,
  bold,
}: {
  label: string;
  byYear: Record<number, number> | undefined;
  years: number[];
  bold?: boolean;
}) {
  return (
    <tr className="border-b border-neutral-200 dark:border-neutral-800">
      <td className={`py-1.5 pr-4 whitespace-nowrap ${bold ? "font-bold" : ""}`}>{label}</td>
      {years.map((y) => (
        <td key={y} className="py-1.5 pr-4 text-right tabular-nums whitespace-nowrap">
          {byYear?.[y] !== undefined ? fmtC(byYear[y]) : "—"}
        </td>
      ))}
    </tr>
  );
}

/** Shared tooltip: truth first, then per-model medians (or the model × rubric matrix). */
function ChartTooltip({
  year,
  raw,
  expanded,
  series,
  funders,
  models,
  colorOf,
  shapeOf,
  hasTruth,
}: {
  year: number;
  raw: Map<string, Record<number, number>>;
  expanded: boolean;
  series: SeriesMeta[];
  funders: FunderRubric[];
  models: string[];
  colorOf: (model: string) => string;
  shapeOf: (slug: string) => Shape;
  hasTruth: boolean;
}) {
  const truthTotal = raw.get("truthTotal")?.[year];
  const truthManifund = raw.get("truthManifund")?.[year];
  const valueOf = (model: string, funderSlug?: string) => {
    const s = series.find((x) => x.model === model && x.funderSlug === funderSlug);
    return s ? raw.get(s.key)?.[year] : undefined;
  };
  const modelKey = (m: string) => (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: colorOf(m) }} />
      {modelLabel(m)}
    </span>
  );
  return (
    <div className="rounded border border-neutral-200 bg-[var(--background)] p-2.5 text-xs shadow-md dark:border-neutral-800">
      <div className="font-bold">
        {year}
        {year > LAST_ACTUAL_YEAR && (
          <span className="ml-1 font-normal text-neutral-500">(forecast only)</span>
        )}
      </div>
      {hasTruth && (
        <div className="mt-1.5 space-y-0.5">
          <div className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="8" aria-hidden>
                <line x1="1" y1="4" x2="13" y2="4" stroke="var(--foreground)" strokeWidth="2.5" />
              </svg>
              Actual total
            </span>
            <span className="font-bold tabular-nums">
              {truthTotal !== undefined ? fmtC(truthTotal) : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-4 text-neutral-500">
            <span className="flex items-center gap-1.5">
              <svg width="14" height="8" aria-hidden>
                <line
                  x1="1"
                  y1="4"
                  x2="13"
                  y2="4"
                  stroke="var(--chart-muted)"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
              </svg>
              Manifund only
            </span>
            <span className="tabular-nums">
              {truthManifund !== undefined ? fmtC(truthManifund) : "—"}
            </span>
          </div>
        </div>
      )}
      {models.length > 0 &&
        (expanded ? (
          <table className="mt-2 border-collapse">
            <thead>
              <tr>
                <th />
                {funders.map((f) => (
                  <th
                    key={f.slug}
                    className="px-1.5 pb-0.5 text-center font-normal text-neutral-500"
                  >
                    <svg width="12" height="12" aria-hidden className="mx-auto mb-0.5 block">
                      <Glyph
                        shape={shapeOf(f.slug)}
                        cx={6}
                        cy={6}
                        s={4}
                        fill="var(--chart-muted)"
                      />
                    </svg>
                    {funderShort(f.slug)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m}>
                  <td className="pr-1.5 text-neutral-500">{modelKey(m)}</td>
                  {funders.map((f) => {
                    const v = valueOf(m, f.slug);
                    return (
                      <td key={f.slug} className="px-1.5 text-right font-medium tabular-nums">
                        {v !== undefined ? fmtC(v) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="mt-2 space-y-0.5">
            {models.map((m) => {
              const v = valueOf(m, undefined);
              return (
                <div key={m} className="flex items-center justify-between gap-4">
                  <span className="text-neutral-500">{modelKey(m)}</span>
                  <span className="font-medium tabular-nums">
                    {v !== undefined ? fmtC(v) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
    </div>
  );
}
