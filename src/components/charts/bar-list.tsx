/**
 * Horizontal bar list — used as our "click heatmap" view of which links
 * in an email got the most engagement, and elsewhere for ranked
 * distributions (tag breakdown, etc.).
 *
 * Each row's bar width is the value relative to the max in the set.
 */

export type BarListItem = {
  /** Display label (left side) */
  label: string;
  /** Numeric value (drives the bar width) */
  value: number;
  /** Optional href — if set, the label becomes a link */
  href?: string;
  /** Optional secondary text below the label (e.g. URL) */
  sub?: string;
  /** Override the default brand-orange bar color */
  color?: string;
};

export function BarList({
  items,
  emptyMessage = 'No data yet.',
  showRank = false,
  valueFormatter = (v) => v.toLocaleString('pt-BR'),
}: {
  items: BarListItem[];
  emptyMessage?: string;
  showRank?: boolean;
  valueFormatter?: (v: number) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-zinc-400 italic py-6 text-center">{emptyMessage}</p>;
  }

  const max = Math.max(1, ...items.map((i) => i.value));

  return (
    <ol className="space-y-2.5">
      {items.map((item, idx) => {
        const widthPct = (item.value / max) * 100;
        // Heat-coloring: top item is darkest brand orange, fading down
        const intensity = Math.max(0.2, item.value / max);
        const barColor = item.color ?? `rgba(244, 114, 22, ${intensity})`; // brand orange w/ heat

        return (
          <li key={idx} className="relative">
            <div className="relative h-9 rounded bg-zinc-50 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 transition-all"
                style={{ width: `${widthPct}%`, background: barColor }}
              />
              <div className="relative h-full flex items-center justify-between px-3 text-xs gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {showRank && (
                    <span className="font-mono text-[10px] text-zinc-500 w-4 shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <div className="min-w-0">
                    {item.href ? (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium text-zinc-900 hover:underline truncate block max-w-[400px]"
                      >
                        {item.label}
                      </a>
                    ) : (
                      <div className="font-medium text-zinc-900 truncate max-w-[400px]">
                        {item.label}
                      </div>
                    )}
                    {item.sub && (
                      <div className="text-[10px] text-zinc-500 truncate max-w-[400px]">
                        {item.sub}
                      </div>
                    )}
                  </div>
                </div>
                <div className="font-semibold tabular-nums text-zinc-900 shrink-0">
                  {valueFormatter(item.value)}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
