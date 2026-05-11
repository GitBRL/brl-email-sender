/**
 * Tiny SVG line chart for time-series visualization.
 * Renders 1+ series stacked on the same X axis with shared scaling.
 *
 * Lightweight, no chart library — just inline SVG, fully responsive,
 * works in server components.
 */

export type Series = {
  name: string;
  color: string; // hex or css color
  data: number[]; // values, one per X tick
};

export type SparkLineProps = {
  /** X-axis labels (e.g. dates or hour buckets). Same length as each series.data */
  labels: string[];
  series: Series[];
  /** Render height in px. Width is 100% of container. */
  height?: number;
  /** Show value tooltips on hover (cursor + label). Default true. */
  showTooltip?: boolean;
};

export function SparkLine({
  labels,
  series,
  height = 200,
}: SparkLineProps) {
  const W = 800; // viewBox width — scaled by container
  const H = height;
  const PAD_L = 36;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 28;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const N = labels.length;
  if (N === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs text-zinc-400"
        style={{ height }}
      >
        No data yet.
      </div>
    );
  }

  const allValues = series.flatMap((s) => s.data);
  const max = Math.max(1, ...allValues);
  const x = (i: number) => PAD_L + (N === 1 ? innerW / 2 : (i / (N - 1)) * innerW);
  const y = (v: number) => PAD_T + innerH - (v / max) * innerH;

  // Y-axis ticks: 0, max/2, max
  const yTicks = [0, max / 2, max];
  // X-axis ticks: show ~6 evenly spaced labels
  const xTickStride = Math.max(1, Math.ceil(N / 6));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        {/* Y grid */}
        {yTicks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={y(v)}
              y2={y(v)}
              stroke="#e4e4e7"
              strokeDasharray={i === 0 ? '' : '2 3'}
            />
            <text
              x={PAD_L - 6}
              y={y(v) + 4}
              fontSize="10"
              fill="#71717a"
              textAnchor="end"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* X labels */}
        {labels.map((lbl, i) =>
          i % xTickStride === 0 || i === N - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              fontSize="10"
              fill="#71717a"
              textAnchor={i === 0 ? 'start' : i === N - 1 ? 'end' : 'middle'}
            >
              {lbl}
            </text>
          ) : null
        )}

        {/* Series */}
        {series.map((s) => {
          const points = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          const areaPath =
            `M ${x(0)},${y(0)} L ` +
            s.data.map((v, i) => `${x(i)},${y(v)}`).join(' L ') +
            ` L ${x(N - 1)},${y(0)} Z`;
          return (
            <g key={s.name}>
              <path d={areaPath} fill={s.color} fillOpacity="0.08" />
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points}
              />
              {N <= 30 &&
                s.data.map((v, i) => (
                  <circle
                    key={i}
                    cx={x(i)}
                    cy={y(v)}
                    r="2.5"
                    fill="white"
                    stroke={s.color}
                    strokeWidth="1.5"
                  />
                ))}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-2 text-xs">
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="text-zinc-600">{s.name}</span>
            <span className="text-zinc-400 tabular-nums">
              ({s.data.reduce((a, b) => a + b, 0).toLocaleString('pt-BR')})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
