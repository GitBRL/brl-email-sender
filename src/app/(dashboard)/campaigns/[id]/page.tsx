import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Send } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { pct } from '@/lib/utils';
import { SendNowButton } from './_send-button';
import { CampaignRowActions } from '../_row-actions';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  scheduled: 'bg-blue-50 text-blue-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-zinc-200 text-zinc-700',
  failed: 'bg-red-50 text-red-700',
};

export default async function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: campaign } = await supabase.from('campaigns').select('*').eq('id', id).maybeSingle();
  if (!campaign) notFound();

  const { data: events } = await supabase.from('email_events').select('event_type').eq('campaign_id', id);

  const counts = { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 };
  for (const e of events ?? []) {
    if (e.event_type in counts) (counts as Record<string, number>)[e.event_type]++;
  }
  const total = campaign.total_recipients || counts.sent || 1;

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to campaigns
      </Link>

      <header className="flex items-start justify-between mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{campaign.name}</h1>
          <p className="text-sm text-zinc-500 mt-1 truncate">{campaign.subject}</p>
          <div className="mt-2">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[campaign.status]}`}>
              {campaign.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {canEdit && campaign.status === 'draft' && (
            <SendNowButton id={campaign.id} />
          )}
          <CampaignRowActions id={campaign.id} name={campaign.name} canDelete={canDelete} />
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Stat label="Recipients" value={campaign.total_recipients} />
        <Stat label="Delivered" value={counts.delivered} />
        <Stat label="Opens" value={counts.opened} sub={`${pct(counts.opened, total)}%`} />
        <Stat label="Clicks" value={counts.clicked} sub={`${pct(counts.clicked, total)}%`} />
      </div>

      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">Settings</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <Row label="From" value={`${campaign.from_name} <${campaign.from_email}>`} />
          {campaign.reply_to && <Row label="Reply-to" value={campaign.reply_to} />}
          <Row label="Sent at" value={campaign.sent_at ? new Date(campaign.sent_at).toLocaleString('pt-BR') : '—'} />
          <Row label="Audience filter" value={campaign.filter_tag ?? 'all tags'} />
          <Row label="Lists" value={campaign.list_ids?.length ? `${campaign.list_ids.length} list(s)` : 'all subscribed'} />
        </dl>
      </section>

      <p className="text-xs text-zinc-500 mt-6">
        Detailed per-link analytics and the click heatmap arrive in Phase 7.
      </p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value.toLocaleString('pt-BR')}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
