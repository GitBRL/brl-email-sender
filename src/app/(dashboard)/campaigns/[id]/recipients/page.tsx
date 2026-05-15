import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { getCampaignRecipientsByGroup, type RecipientGroup } from '../../actions';
import { RecipientsTable } from './_recipients-table';

const GROUP_LABELS: Record<RecipientGroup, string> = {
  recipients: 'Destinatários',
  sent: 'Enviados',
  delivered: 'Entregues',
  opened: 'Abriram',
  clicked: 'Clicaram',
  bounced: 'Bounced',
  complained: 'Reclamações',
  not_opened: 'Não abriram',
  opened_no_click: 'Abriram (sem clique)',
};

const VALID_GROUPS = new Set(Object.keys(GROUP_LABELS) as RecipientGroup[]);

function isValidGroup(g: string | undefined): g is RecipientGroup {
  return !!g && VALID_GROUPS.has(g as RecipientGroup);
}

export default async function CampaignRecipientsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const sp = await searchParams;
  const group: RecipientGroup = isValidGroup(sp.group) ? sp.group : 'recipients';
  const supabase = createServiceClient();

  const [{ data: campaign }, { data: lists }, { data: tagRows }, recipients] = await Promise.all([
    supabase.from('campaigns').select('id, name').eq('id', id).maybeSingle(),
    supabase.from('lists').select('id, name').order('name'),
    supabase.from('lists').select('tags'),
    getCampaignRecipientsByGroup(id, group),
  ]);
  if (!campaign) notFound();

  const tagSet = new Set<string>();
  for (const r of (tagRows ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of r.tags ?? []) tagSet.add(t);
  }
  const tagSuggestions = Array.from(tagSet).sort();
  const canEdit = profile.role === 'admin' || profile.role === 'editor';

  return (
    <div className="p-8 max-w-7xl space-y-5">
      <Link
        href={`/campaigns/${id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark"
      >
        <ChevronLeft size={14} /> Voltar para a campanha
      </Link>

      <header>
        <h1 className="text-2xl font-bold">{GROUP_LABELS[group]}</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {recipients.length.toLocaleString('pt-BR')} contato{recipients.length === 1 ? '' : 's'} ·{' '}
          <span className="text-zinc-700 font-medium">{campaign.name}</span>
        </p>
      </header>

      {/* Cohort tabs */}
      <nav className="flex flex-wrap gap-1.5">
        {(Object.keys(GROUP_LABELS) as RecipientGroup[]).map((g) => (
          <Link
            key={g}
            href={`/campaigns/${id}/recipients?group=${g}`}
            className={`text-xs px-2.5 py-1 rounded-full border transition ${
              g === group
                ? 'bg-brl-dark text-white border-brl-dark'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300'
            }`}
          >
            {GROUP_LABELS[g]}
          </Link>
        ))}
      </nav>

      <RecipientsTable
        rows={recipients}
        campaignName={campaign.name ?? ''}
        group={group}
        groupLabel={GROUP_LABELS[group]}
        existingLists={(lists ?? []) as Array<{ id: string; name: string }>}
        tagSuggestions={tagSuggestions}
        canEdit={canEdit}
      />
    </div>
  );
}
