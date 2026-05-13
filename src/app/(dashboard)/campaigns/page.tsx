import Link from 'next/link';
import { Plus, Mail } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { pct } from '@/lib/utils';
import { CampaignRowActions } from './_row-actions';

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'failed';
  total_recipients: number;
  sent_at: string | null;
  created_at: string;
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  scheduled: 'bg-blue-50 text-blue-700',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-zinc-200 text-zinc-700',
  failed: 'bg-red-50 text-red-700',
};

export default async function CampaignsPage() {
  const profile = await requireProfile();
  const supabase = createServiceClient();
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, subject, status, total_recipients, sent_at, created_at')
    .order('created_at', { ascending: false });

  // Per-campaign open/click counts (single query)
  const ids = (campaigns ?? []).map((c) => c.id);
  const eventCounts: Record<string, { opened: number; clicked: number }> = {};
  if (ids.length > 0) {
    const { data: events } = await supabase
      .from('email_events')
      .select('campaign_id, event_type')
      .in('campaign_id', ids);
    for (const e of events ?? []) {
      if (!e.campaign_id) continue;
      if (!eventCounts[e.campaign_id]) eventCounts[e.campaign_id] = { opened: 0, clicked: 0 };
      if (e.event_type === 'opened') eventCounts[e.campaign_id].opened++;
      else if (e.event_type === 'clicked') eventCounts[e.campaign_id].clicked++;
    }
  }

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  return (
    <div className="p-8 max-w-7xl">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Compose, send and track your email campaigns.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/campaigns/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover"
          >
            <Plus size={14} /> New campaign
          </Link>
        )}
      </header>

      {(campaigns ?? []).length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-12 text-center">
          <Mail size={24} className="mx-auto text-zinc-400 mb-2" />
          <h2 className="text-sm font-semibold">No campaigns yet</h2>
          <p className="text-xs text-zinc-500 mt-1">Create your first campaign to start sending.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500 uppercase tracking-wide bg-zinc-50">
              <tr>
                <th className="text-left font-medium px-4 py-3">Campaign</th>
                <th className="text-left font-medium px-4 py-3">Status</th>
                <th className="text-right font-medium px-4 py-3">Recipients</th>
                <th className="text-right font-medium px-4 py-3">Open rate</th>
                <th className="text-right font-medium px-4 py-3">CTR</th>
                <th className="text-left font-medium px-4 py-3">Sent</th>
                <th className="text-right font-medium px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(campaigns as CampaignRow[]).map((c) => {
                const counts = eventCounts[c.id] ?? { opened: 0, clicked: 0 };
                const openRate = pct(counts.opened, c.total_recipients);
                const ctr = pct(counts.clicked, c.total_recipients);
                return (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      {/* For drafts, clicking the name jumps directly back into
                          the wizard so the user can continue. For other states
                          we go to the analytics detail page. */}
                      <Link
                        href={c.status === 'draft' ? `/campaigns/new?id=${c.id}` : `/campaigns/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.name}
                      </Link>
                      <div className="text-xs text-zinc-500 truncate max-w-md">{c.subject}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_STYLES[c.status]}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{c.total_recipients.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{c.status === 'sent' ? `${openRate}%` : '—'}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{c.status === 'sent' ? `${ctr}%` : '—'}</td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {c.sent_at ? new Date(c.sent_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <CampaignRowActions id={c.id} name={c.name} canDelete={canDelete} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
