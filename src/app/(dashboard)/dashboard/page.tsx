import Link from 'next/link';
import { Suspense } from 'react';
import { createServiceClient } from '@/lib/supabase/server';
import { pct } from '@/lib/utils';
import { requireProfile } from '@/lib/auth';
import { SparkLine } from '@/components/charts/spark-line';
import { BarList } from '@/components/charts/bar-list';
import { RangeSelector } from './_range-selector';
import { getResendMonthlyUsage } from '@/lib/resend-usage';

/**
 * Dashboard. The three primary charts (Audience growth / Sent over time /
 * Resend monthly quota) all respect a single time-range selector at the top
 * (?range=30d|60d|90d|custom + ?from / ?to). Resend quota is special-cased
 * to ALWAYS reflect the current calendar month since that's when Resend's
 * monthly cap actually resets.
 */

type Search = { range?: string; from?: string; to?: string };

function resolveRange(sp: Search): { startMs: number; days: number; label: string } {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const endMs = now.getTime();

  if (sp.range === 'custom' && sp.from && sp.to) {
    const f = new Date(sp.from);
    f.setHours(0, 0, 0, 0);
    const t = new Date(sp.to);
    t.setHours(23, 59, 59, 999);
    if (!isNaN(f.getTime()) && !isNaN(t.getTime()) && f.getTime() <= t.getTime()) {
      const days = Math.max(1, Math.ceil((t.getTime() - f.getTime()) / 86_400_000));
      return {
        startMs: f.getTime(),
        days,
        label: `${sp.from} → ${sp.to}`,
      };
    }
  }
  const presetDays =
    sp.range === '90d' ? 90 :
    sp.range === '60d' ? 60 :
    30;
  const start = new Date(now);
  start.setDate(start.getDate() - (presetDays - 1));
  start.setHours(0, 0, 0, 0);
  return {
    startMs: start.getTime(),
    days: presetDays,
    label: `últimos ${presetDays} dias`,
  };
}

const RESEND_MONTHLY_LIMIT = parseInt(process.env.RESEND_MONTHLY_LIMIT ?? '3000', 10);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = createServiceClient();

  const { startMs, days, label } = resolveRange(sp);

  // First day of current calendar month (for Resend monthly quota — the cap
  // resets on the 1st regardless of the selected display range).
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const last30 = new Date();
  last30.setDate(last30.getDate() - 30);

  const [
    contactsAgg,
    campaignsAgg,
    recentRes,
    eventsRes,
    sendEventsRes,
    monthSendCountRes,
    appSettingsRes,
    // Resend's actual API count for this month (cached 10 min).
    // Counts EVERY email sent through the Resend key (incl. external sends);
    // local count covers only sends through this app's pipeline.
    resendUsage,
  ] = await Promise.all([
    supabase.from('contacts').select('id, tag, status, created_at'),
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'sent'),
    supabase
      .from('campaigns')
      .select('id, name, subject, status, sent_at, total_recipients')
      .order('created_at', { ascending: false })
      .limit(5),
    // Engagement (opens/clicks) for the headline rates — always fixed 30d
    // window so the rate cards stay comparable
    supabase
      .from('email_events')
      .select('event_type, created_at')
      .gte('created_at', last30.toISOString()),
    // 'Emails sent' chart — count ONE event per email. We use 'sent' (the
    // event our send pipeline emits at dispatch). 'delivered' would
    // double-count: Resend's webhook fires both 'sent' and 'delivered' for
    // every email, plus deliveries can come for emails sent before the local
    // sent event was wired up.
    supabase
      .from('email_events')
      .select('created_at')
      .eq('event_type', 'sent')
      .gte('created_at', new Date(startMs).toISOString()),
    // Sent count THIS calendar month — for the Resend quota card. Same
    // logic — 'sent' only.
    supabase
      .from('email_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'sent')
      .gte('created_at', monthStart.toISOString()),
    // Operator-set monthly Resend limit (plan cap)
    supabase
      .from('app_settings')
      .select('resend_monthly_limit')
      .eq('id', true)
      .maybeSingle<{ resend_monthly_limit: number | null }>(),
    getResendMonthlyUsage(),
  ]);

  const contacts = contactsAgg.data ?? [];
  const totalContacts = contacts.length;
  const subscribed = contacts.filter((c) => c.status === 'subscribed').length;
  const tagCounts = { hot: 0, warm: 0, cold: 0, untagged: 0 };
  for (const c of contacts) {
    if (c.tag === 'hot') tagCounts.hot++;
    else if (c.tag === 'warm') tagCounts.warm++;
    else if (c.tag === 'cold') tagCounts.cold++;
    else tagCounts.untagged++;
  }

  const events = eventsRes.data ?? [];
  const counts = { sent: 0, opened: 0, clicked: 0 };
  for (const e of events) {
    if (e.event_type === 'sent' || e.event_type === 'delivered') counts.sent++;
    else if (e.event_type === 'opened') counts.opened++;
    else if (e.event_type === 'clicked') counts.clicked++;
  }
  const openRate = pct(counts.opened, counts.sent);
  const ctr = pct(counts.clicked, counts.sent);

  // ---- Series: build day-bucketed labels for the selected range ----
  const labels: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(startMs);
    d.setDate(d.getDate() + i);
    labels.push(`${d.getDate()}/${d.getMonth() + 1}`);
  }

  // 1) Audience growth — cumulative count of contacts (ONLY the contacts
  //    table) by day. Does NOT include sent emails or recipients.
  const newPerDay: number[] = new Array(days).fill(0);
  let baseline = 0;
  for (const c of contacts) {
    const created = new Date(c.created_at).getTime();
    if (created < startMs) {
      baseline++;
      continue;
    }
    const day = Math.floor((created - startMs) / 86_400_000);
    if (day >= 0 && day < days) newPerDay[day]++;
  }
  const cumulative: number[] = new Array(days);
  let running = baseline;
  for (let i = 0; i < days; i++) {
    running += newPerDay[i];
    cumulative[i] = running;
  }
  const newInRange = newPerDay.reduce((a, b) => a + b, 0);

  // 2) Emails sent over the selected range — daily counts
  const sentPerDay: number[] = new Array(days).fill(0);
  for (const e of sendEventsRes.data ?? []) {
    const day = Math.floor((new Date(e.created_at).getTime() - startMs) / 86_400_000);
    if (day >= 0 && day < days) sentPerDay[day]++;
  }
  const totalSentInRange = sentPerDay.reduce((a, b) => a + b, 0);

  // 3) Resend monthly quota — usage from Resend's API (real number, includes
  //    every email sent with the API key). Falls back to local email_events
  //    count if the API call failed. Limit from app_settings → env → 3000.
  const localSentThisMonth = monthSendCountRes.count ?? 0;
  const sentThisMonth = resendUsage.error
    ? localSentThisMonth
    : resendUsage.sentThisMonth;
  const usageSource: 'resend-api' | 'local' = resendUsage.error ? 'local' : 'resend-api';
  const monthlyLimit =
    appSettingsRes.data?.resend_monthly_limit ??
    RESEND_MONTHLY_LIMIT;
  const remaining = Math.max(0, monthlyLimit - sentThisMonth);
  const usagePct = Math.min(100, Math.round((sentThisMonth / monthlyLimit) * 100));
  const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Engagement chart still shows fixed 30d window so the cards above match
  const engagementLabels: string[] = [];
  const engOpens: number[] = [];
  const engClicks: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    engagementLabels.push(`${d.getDate()}/${d.getMonth() + 1}`);
    engOpens.push(0);
    engClicks.push(0);
  }
  const engStart = new Date();
  engStart.setDate(engStart.getDate() - 29);
  engStart.setHours(0, 0, 0, 0);
  for (const e of events) {
    const dayIdx = Math.floor(
      (new Date(e.created_at).getTime() - engStart.getTime()) / 86_400_000
    );
    if (dayIdx < 0 || dayIdx >= 30) continue;
    if (e.event_type === 'opened') engOpens[dayIdx]++;
    else if (e.event_type === 'clicked') engClicks[dayIdx]++;
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl">
      <header>
        <h1 className="text-2xl font-bold">Hello{profile.name ? `, ${profile.name}` : ''}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Here&apos;s what&apos;s happening with your campaigns.
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          label="Total contacts"
          value={String(totalContacts)}
          sub={`${subscribed.toLocaleString('pt-BR')} subscribed`}
        />
        <Stat label="Campaigns sent" value={String(campaignsAgg.count ?? 0)} sub="all-time" />
        <Stat label="Avg. open rate" value={`${openRate}%`} sub="last 30 days" />
        <Stat label="Avg. click-through" value={`${ctr}%`} sub="last 30 days" />
      </section>

      {/* Range selector + 3 primary charts ------------------------------ */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Métricas
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Período: <span className="font-medium text-zinc-700">{label}</span>
            </p>
          </div>
          <Suspense fallback={null}>
            <RangeSelector />
          </Suspense>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Audience growth — pure contacts count cumulative */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Crescimento da audiência
              </h3>
              <span className="text-[10px] text-zinc-500">contatos cadastrados</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalContacts.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-zinc-500 mb-2">
              +{newInRange.toLocaleString('pt-BR')} no período
            </div>
            <SparkLine
              labels={labels}
              series={[{ name: 'Total contatos', color: '#f47216', data: cumulative }]}
              height={120}
            />
          </div>

          {/* Emails sent over the range */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Emails enviados
              </h3>
              <span className="text-[10px] text-zinc-500">por dia</span>
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {totalSentInRange.toLocaleString('pt-BR')}
            </div>
            <div className="text-[11px] text-zinc-500 mb-2">total no período</div>
            <SparkLine
              labels={labels}
              series={[{ name: 'Sent', color: '#3b82f6', data: sentPerDay }]}
              height={120}
            />
          </div>

          {/* Resend monthly quota — always current calendar month */}
          <div className="bg-white rounded-lg border border-zinc-200 p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Cota Resend
              </h3>
              <span className="text-[10px] text-zinc-500 capitalize">{monthName}</span>
            </div>
            <div className="mb-3">
              {usageSource === 'resend-api' ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Direto da API Resend
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5"
                  title={resendUsage.error ?? 'Resend API unavailable'}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
                  Contagem local (API offline)
                </span>
              )}
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {remaining.toLocaleString('pt-BR')}
              <span className="text-sm font-normal text-zinc-500"> restantes</span>
            </div>
            <div className="text-[11px] text-zinc-500 mb-3">
              {sentThisMonth.toLocaleString('pt-BR')} de {monthlyLimit.toLocaleString('pt-BR')} usados ({usagePct}%)
            </div>
            <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usagePct}%`,
                  background:
                    usagePct >= 90 ? '#ef4444' : usagePct >= 70 ? '#f59e0b' : '#10b981',
                }}
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] text-zinc-500">
              <div><span className="text-emerald-600">●</span> &lt;70%</div>
              <div><span className="text-amber-600">●</span> &lt;90%</div>
              <div><span className="text-red-600">●</span> ≥90%</div>
            </div>
            {!appSettingsRes.data?.resend_monthly_limit && (
              <p className="text-[10px] text-zinc-400 mt-2 leading-tight">
                Limite padrão. Configure o cap real do seu plano em{' '}
                <Link href="/settings" className="underline hover:text-zinc-700">Settings</Link>.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Engagement (opens vs clicks) — keeps its dedicated 30d view -------- */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Engajamento — últimos 30 dias
        </h2>
        <SparkLine
          labels={engagementLabels}
          series={[
            { name: 'Opens', color: '#10b981', data: engOpens },
            { name: 'Clicks', color: '#3b82f6', data: engClicks },
          ]}
          height={200}
        />
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
            Audience by tag
          </h2>
          <BarList
            items={[
              { label: 'Hot', value: tagCounts.hot, color: '#ef4444' },
              { label: 'Warm', value: tagCounts.warm, color: '#f59e0b' },
              { label: 'Cold', value: tagCounts.cold, color: '#3b82f6' },
              { label: 'Untagged', value: tagCounts.untagged, color: '#a1a1aa' },
            ].filter((i) => i.value > 0)}
            emptyMessage="No contacts yet."
          />
        </section>

        <section className="bg-white rounded-lg border border-zinc-200 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
            Recent campaigns
          </h2>
          {(recentRes.data ?? []).length === 0 ? (
            <p className="text-sm text-zinc-500">
              No campaigns yet.{' '}
              <Link href="/campaigns/new" className="text-brl-orange underline">
                Create your first one →
              </Link>
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {recentRes.data!.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="py-2.5 flex items-center justify-between text-sm hover:bg-zinc-50 -mx-2 px-2 rounded transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.name}</div>
                      <div className="text-zinc-500 text-xs truncate">{c.subject}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-500 text-xs tabular-nums">
                        {(c.total_recipients ?? 0).toLocaleString('pt-BR')}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!profile.role || profile.role === 'viewer' ? (
        <p className="text-xs text-zinc-500">
          You have view-only access. Contact an admin to be promoted to editor.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-lg border border-zinc-200 p-4">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      <div className="text-xs text-zinc-500">{sub}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-zinc-100 text-zinc-700',
    sending: 'bg-amber-50 text-amber-700',
    sent: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-zinc-100 text-zinc-500',
    failed: 'bg-red-50 text-red-700',
  };
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
