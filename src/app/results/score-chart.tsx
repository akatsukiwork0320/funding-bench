"use client";

// Epoch-style scatter: FundingBench score (0–100) vs model release date.
// Single conceptual series → one accent hue, identity via direct labels
// (ink-colored text, never the mark color); no legend needed.

export interface ScorePoint {
  label: string;
  released: string; // ISO date
  score: number; // 0–100
  n: number;
}

const W = 640;
const H = 300;
const M = { top: 16, right: 24, bottom: 36, left: 40 };

export default function ScoreChart({ points }: { points: ScorePoint[] }) {
  if (points.length === 0) return null;
  const pts = [...points].sort((a, b) => Date.parse(a.released) - Date.parse(b.released));

  const t0 = Date.parse(pts[0].released);
  const t1 = Date.parse(pts[pts.length - 1].released);
  const pad = Math.max((t1 - t0) * 0.08, 90 * 86400e3);
  const xMin = t0 - pad;
  const xMax = t1 + pad;
  const x = (t: number) => M.left + ((t - xMin) / (xMax - xMin)) * (W - M.left - M.right);
  const y = (s: number) => M.top + (1 - s / 100) * (H - M.top - M.bottom);

  // half-year ticks across the domain
  const ticks: Date[] = [];
  const first = new Date(xMin);
  const d = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() < 6 ? 0 : 6, 1));
  if (d.getTime() < xMin) d.setUTCMonth(d.getUTCMonth() + 6);
  while (d.getTime() <= xMax) {
    ticks.push(new Date(d));
    d.setUTCMonth(d.getUTCMonth() + 6);
  }
  const fmtTick = (dt: Date) =>
    dt.getUTCMonth() === 0 ? String(dt.getUTCFullYear()) : `Jul ${dt.getUTCFullYear()}`;

  // Direct labels: centered above the dot by default. When two points are
  // close in x, split them horizontally — left member's label goes left of
  // its dot, right member's goes right — so labels never cover a neighbor.
  const xs = pts.map((p) => x(Date.parse(p.released)));
  type Placement = { anchor: "start" | "middle" | "end"; lx: number; ly: number; scoreDy?: number };
  const placement = (i: number, px: number, py: number): Placement => {
    const crowded = xs.some((ox, j) => j !== i && Math.abs(ox - px) < 90);
    if (crowded) {
      const isLeft = !xs.some((ox, j) => j !== i && Math.abs(ox - px) < 90 && ox < px);
      if (isLeft) return { anchor: "end", lx: px - 12, ly: py + 4, scoreDy: -12 };
      // right member: label to the right, unless that would clip the edge —
      // then drop it below the dot, right-aligned
      return px + 100 > W - M.right
        ? { anchor: "end", lx: px + 6, ly: py + 20 }
        : { anchor: "start", lx: px + 12, ly: py + 4 };
    }
    return {
      anchor: px > W - M.right - 90 ? "end" : px < M.left + 60 ? "start" : "middle",
      lx: px,
      ly: py < M.top + 30 ? py + 18 : py - 10,
    };
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full max-w-2xl"
      role="img"
      aria-label="FundingBench score by model release date"
    >
      {/* gridlines + y labels */}
      {[0, 25, 50, 75, 100].map((s) => (
        <g key={s}>
          <line
            x1={M.left}
            x2={W - M.right}
            y1={y(s)}
            y2={y(s)}
            className="stroke-neutral-200 dark:stroke-neutral-800"
            strokeWidth={s === 0 ? 1.5 : 1}
          />
          <text
            x={M.left - 8}
            y={y(s) + 3}
            textAnchor="end"
            className="fill-neutral-500 text-[10px]"
          >
            {s}
          </text>
        </g>
      ))}
      {/* x ticks */}
      {ticks.map((dt) => (
        <g key={dt.toISOString()}>
          <line
            x1={x(dt.getTime())}
            x2={x(dt.getTime())}
            y1={H - M.bottom}
            y2={H - M.bottom + 4}
            className="stroke-neutral-400"
          />
          <text
            x={x(dt.getTime())}
            y={H - M.bottom + 16}
            textAnchor="middle"
            className="fill-neutral-500 text-[10px]"
          >
            {fmtTick(dt)}
          </text>
        </g>
      ))}
      {/* points + direct labels */}
      {pts.map((p, i) => {
        const px = x(Date.parse(p.released));
        const py = y(p.score);
        const { anchor, lx, ly, scoreDy: dyOverride } = placement(i, px, py);
        const scoreDy = dyOverride ?? (ly <= py ? -11 : 12);
        return (
          <g key={p.label}>
            <circle
              cx={px}
              cy={py}
              r={5}
              className="fill-orange-600 dark:fill-orange-500 stroke-[var(--background)]"
              strokeWidth={2}
            />
            {/* larger invisible hit target with tooltip */}
            <circle cx={px} cy={py} r={14} fill="transparent">
              <title>
                {`${p.label} (${p.released}): ${p.score.toFixed(1)} across ${p.n} cells`}
              </title>
            </circle>
            <text
              x={lx}
              y={ly}
              textAnchor={anchor}
              className="fill-neutral-700 dark:fill-neutral-300 text-[11px]"
            >
              {p.label}
            </text>
            <text
              x={lx}
              y={ly + scoreDy}
              textAnchor={anchor}
              className="fill-neutral-500 text-[10px]"
            >
              {p.score.toFixed(1)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
