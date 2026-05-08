import { createClient } from '@/lib/supabase/server';
import { pct } from '@/lib/utils';
import { requireProfile } from '@/lib/auth';

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [
    { count: totalContacts },
    { count: sentCampaigns },
    { data: recentCampaigns },
    { data: events },
  ] = await Promise.all([
    supabase.from('contacts').select('*', { count: 'exact', head: true }),
    supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sent'),
    supabase
      .from('campaigns')
      .select('id,name,subject,status,sent_at,total_recipients')
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('email_events')
      .select('event_type'),
  ]);

  const counts = { sent: 0, opened: 0, clicked: 0 };
  for (const e of events ?? []) {
    if (e.event_type === 'sent' || e.event_type === 'delivered') counts.sent++;
    else if (e.event_type === 'opened') counts.opened++;
    else if (e.event_type === 'clicked') counts.clicked++;
  }
  const openRate = pct(counts.opened, counts.sent);
  const ctr = pct(counts.clicked, counts.sent);

  return (
    <div className="p-8 space-y-8 max-w-6xl">
      <header>
        <h1 className="text-2xl font-bold">Hello{profile.name ? `, ${profile.name}` : ''}</h1>
        <p className="text-sm text-zinc-500 mt-1">Here&apos;s what&apos;s happening with your campaigns.</p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total contacts"       value={String(totalContacts ?? 0)} />
        <Stat label="Campaigns sent"       value={String(sentCampaigns ?? 0)} />
        <Stat label="Avg. open rate"       value={`${openRate}%`} />
        <Stat label="Avg. click-through"   value={`${ctr}%`} />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-3">
          Recent campaigns
        </h2>
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          {(recentCampaigns ?? []).length === 0 ? (
            <p className="p-6 text-sm text-zinc-500">
              No campaigns yet. <a className="underline" href="/campaigns/new">Create your first one →</a>
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recentCampaigns!.map((c) => (
                <li key={c.id} className="p-4 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-zinc-500 text-xs">{c.subject}</div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-500">{c.total_recipients} recipients</span>
                    <StatusBadge status={c.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {!profile.role || profile.role === 'viewer' ? (
        <p className="text-xs text-zinc-500">
          You currently have view-only access. An admin must elevate your role to send campaigns.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const style: Record<string, string> = {
    draft:     'bg-zinc-100 text-zinc-700',
    scheduled: 'bg-blue-50 text-blue-700',
    sending:   'bg-amber-50 text-amber-700',
    sent:      'bg-emerald-50 text-emerald-700',
    paused:    'bg-zinc-200 text-zinc-700',
    failed:    'bg-red-50 text-red-700',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style[status] ?? 'bg-zinc-100 text-zinc-700'}`}>
      {status}
    </span>
  );
}
