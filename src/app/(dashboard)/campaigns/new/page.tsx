import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { FROM_EMAIL, FROM_NAME } from '@/lib/resend';
import { STARTER_TEMPLATES } from '@/lib/starter-templates';
import { Wizard, type ResumeData } from './wizard';
import type { BrandKit } from '@/lib/brand-kits';
import type { ContactTag } from '@/types';

export default async function NewCampaignPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  await requireRole('editor');
  const sp = await searchParams;
  const supabase = createServiceClient();

  const [{ data: templates }, { data: lists }, { data: kits }] = await Promise.all([
    supabase.from('templates').select('id, name, updated_at, brand_kit_id').order('updated_at', { ascending: false }),
    supabase.from('list_counts').select('id, name, contact_count').order('created_at', { ascending: false }),
    supabase.from('brand_kits').select('*').order('is_custom').order('name'),
  ]);

  // Resume mode: when /campaigns/new?id=<uuid>, hydrate the wizard with an
  // existing draft so the user can pick up where they left off.
  let resume: ResumeData | null = null;
  let initialApprovalStatus: 'not_required' | 'pending' | 'approved' | 'changes_requested' = 'not_required';
  let initialRequireAll = false;
  let initialApprovalHistory: import('../actions').ApprovalHistoryRow[] = [];
  if (sp.id) {
    const { data: row } = await supabase
      .from('campaigns')
      .select('id, name, subject, from_name, from_email, reply_to, template_id, brand_kit_id, list_ids, filter_tag, status, approval_status, approval_require_all')
      .eq('id', sp.id)
      .maybeSingle();
    if (row && row.status === 'draft') {
      resume = {
        id: row.id,
        name: row.name ?? '',
        subject: row.subject ?? '',
        fromName: row.from_name ?? FROM_NAME,
        fromEmail: row.from_email ?? FROM_EMAIL,
        replyTo: row.reply_to ?? '',
        templateId: row.template_id,
        brandKitId: row.brand_kit_id,
        listIds: (row.list_ids ?? []) as string[],
        filterTag: (row.filter_tag ?? '') as ContactTag | '',
      };
      initialApprovalStatus = (row.approval_status ?? 'not_required') as typeof initialApprovalStatus;
      initialRequireAll = !!row.approval_require_all;
      const { data: hist } = await supabase
        .from('campaign_approvals')
        .select('id, stakeholder_name, stakeholder_email, status, feedback_note, sent_at, responded_at, expires_at')
        .eq('campaign_id', sp.id)
        .order('sent_at', { ascending: false });
      initialApprovalHistory = (hist ?? []) as typeof initialApprovalHistory;
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl">
      <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to campaigns
      </Link>
      <h1 className="text-2xl font-bold mb-6">
        {resume ? `Continuar campanha — ${resume.name || '(sem nome)'}` : 'New campaign'}
      </h1>
      <Wizard
        templates={(templates ?? []) as Array<{ id: string; name: string; updated_at: string; brand_kit_id: string | null }>}
        lists={(lists ?? []) as Array<{ id: string; name: string; contact_count: number }>}
        kits={(kits ?? []) as BrandKit[]}
        starters={STARTER_TEMPLATES.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          category: s.category,
        }))}
        defaultFromName={FROM_NAME}
        defaultFromEmail={FROM_EMAIL}
        resume={resume}
        initialApprovalStatus={initialApprovalStatus}
        initialRequireAll={initialRequireAll}
        initialApprovalHistory={initialApprovalHistory}
      />
    </div>
  );
}
