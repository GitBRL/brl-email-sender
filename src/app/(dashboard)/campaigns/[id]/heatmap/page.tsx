import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { HeatmapOverlay, type HeatmapLink } from './_overlay';

export default async function HeatmapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireProfile();
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('id, name, subject, template_id')
    .eq('id', id)
    .maybeSingle();
  if (!campaign) notFound();

  // Template HTML (the source-of-truth render — has data-link-id on tracked anchors)
  const { data: template } = campaign.template_id
    ? await supabase
        .from('templates')
        .select('html_content')
        .eq('id', campaign.template_id)
        .maybeSingle()
    : { data: null };

  const rawHtml = template?.html_content ?? '';

  // Tracked links + their click counts
  const { data: trackedLinks } = await supabase
    .from('tracked_links')
    .select('id, original_url, click_count')
    .eq('campaign_id', id);

  const linksById = new Map<string, { original_url: string; clicks: number; rank: number }>();
  // Count clicks from the canonical events table (more accurate than the cached column)
  const { data: clickEvents } = await supabase
    .from('email_events')
    .select('link_id')
    .eq('campaign_id', id)
    .eq('event_type', 'clicked');

  const liveCounts = new Map<string, number>();
  for (const e of clickEvents ?? []) {
    if (e.link_id) liveCounts.set(e.link_id, (liveCounts.get(e.link_id) ?? 0) + 1);
  }

  for (const l of trackedLinks ?? []) {
    linksById.set(l.id, {
      original_url: l.original_url,
      clicks: liveCounts.get(l.id) ?? l.click_count ?? 0,
      rank: 0, // filled after sort
    });
  }

  // Assign rank by click count desc
  const ranked = Array.from(linksById.entries()).sort((a, b) => b[1].clicks - a[1].clicks);
  ranked.forEach(([linkId, info], idx) => {
    info.rank = idx + 1;
    linksById.set(linkId, info);
  });

  const maxClicks = Math.max(1, ...ranked.map(([, l]) => l.clicks));

  // Annotate the HTML: for each <a data-link-id="X"> add an inline-block badge with the count.
  // We do this with a regex pass — the HTML is email-grade (no <script>), so regex is safe enough.
  const annotated = annotateHtmlWithCounts(rawHtml, linksById, maxClicks);

  // Wrap in a stylesheet that gives the body a light backdrop so badges pop.
  const documentHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  body { margin:0; padding:24px; background:#fafafa; font-family:-apple-system,BlinkMacSystemFont,sans-serif; }
  .brl-heatmap-anchor { position:relative; display:inline-block; padding:2px 4px; border-radius:3px; }
  .brl-heatmap-badge { position:absolute; top:-10px; right:-10px; min-width:22px; height:22px; padding:0 6px;
    border-radius:11px; background:#0a0a0a; color:#fff; font-size:11px; font-weight:700;
    display:inline-flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.3);
    font-family:-apple-system,BlinkMacSystemFont,sans-serif; line-height:1; pointer-events:none; }
  .brl-heatmap-badge.zero { background:#a1a1aa; }
</style></head><body>${annotated}</body></html>`;

  return (
    <div className="p-8 max-w-7xl space-y-6">
      <Link
        href={`/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark"
      >
        <ChevronLeft size={14} /> Back to campaign
      </Link>

      <header>
        <h1 className="text-2xl font-bold">Click heatmap</h1>
        <p className="text-sm text-zinc-500 mt-1 truncate">
          {campaign.name} · {campaign.subject}
        </p>
      </header>

      {rawHtml === '' ? (
        <div className="bg-amber-50 border border-amber-100 rounded p-4 text-sm text-amber-800">
          This campaign has no associated template HTML, so a heatmap cannot be rendered.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Heatmap viewer — iframe of the email + canvas overlay with
              radial gradient hotspots scaled to click intensity */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-zinc-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-100 text-xs text-zinc-500 flex items-center justify-between gap-3">
              <span>Email preview with click hotspots</span>
              <span className="inline-flex items-center gap-1.5 text-[10px]">
                Densidade:
                <span
                  className="inline-block w-16 h-2 rounded"
                  style={{
                    background:
                      'linear-gradient(to right, rgba(255,220,0,0.4), rgba(255,120,0,0.7), rgba(255,0,0,0.85))',
                  }}
                />
                <span className="text-zinc-400">baixa → alta</span>
              </span>
            </div>
            <HeatmapOverlay
              documentHtml={documentHtml}
              links={ranked.map<HeatmapLink>(([linkId, info]) => ({ id: linkId, clicks: info.clicks }))}
            />
          </div>

          {/* Ranked links */}
          <aside className="bg-white rounded-lg border border-zinc-200 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
              Links by clicks
            </h2>
            {ranked.length === 0 ? (
              <p className="text-sm text-zinc-400 italic">No tracked links in this campaign.</p>
            ) : (
              <ol className="space-y-2.5">
                {ranked.map(([, info]) => {
                  const intensity = Math.max(0.18, info.clicks / maxClicks);
                  return (
                    <li
                      key={info.original_url + info.rank}
                      className="border border-zinc-100 rounded p-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className="font-mono text-[10px] inline-flex items-center justify-center w-5 h-5 rounded-full text-white font-bold shrink-0"
                          style={{ background: `rgba(244, 114, 22, ${intensity})` }}
                          title={`${info.clicks} click${info.clicks === 1 ? '' : 's'}`}
                        >
                          {info.rank}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {info.clicks.toLocaleString('pt-BR')} clicks
                        </span>
                      </div>
                      <a
                        href={info.original_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="block text-zinc-700 hover:underline truncate font-mono text-[10px]"
                      >
                        {info.original_url}
                      </a>
                    </li>
                  );
                })}
              </ol>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Inject a click-count badge after each <a data-link-id="...">CONTENT</a>.
 * Uses a careful regex pass that preserves the original anchor attributes and
 * inner HTML — sufficient for email-grade markup which doesn't have nested <a>.
 */
function annotateHtmlWithCounts(
  html: string,
  linksById: Map<string, { original_url: string; clicks: number; rank: number }>,
  maxClicks: number,
): string {
  return html.replace(
    /<a\b([^>]*data-link-id="([^"]+)"[^>]*)>([\s\S]*?)<\/a>/gi,
    (match, attrs: string, linkId: string, inner: string) => {
      const info = linksById.get(linkId);
      if (!info) return match;

      const intensity = info.clicks > 0 ? Math.max(0.15, info.clicks / maxClicks) : 0;
      const bgColor =
        info.clicks > 0
          ? `background:rgba(244, 114, 22, ${intensity});`
          : 'background:#f4f4f5;';

      // Add inline-block wrapper styling, preserve all anchor attributes
      const wrapperStyle = `style="${bgColor}"`;
      const badgeClass = info.clicks === 0 ? 'brl-heatmap-badge zero' : 'brl-heatmap-badge';
      const badge = `<span class="${badgeClass}">${info.clicks}</span>`;

      return `<span class="brl-heatmap-anchor" ${wrapperStyle}><a${attrs}>${inner}</a>${badge}</span>`;
    },
  );
}
