'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { resend, FROM_EMAIL, FROM_NAME } from '@/lib/resend';
import { prepareCampaignHtml, personalize, personalizeSubject } from '@/lib/tracking';
import type { ContactTag } from '@/types';
import { applyKitToBlocks, type BrandKit } from '@/lib/brand-kits';
import { buildApprovalEmail } from '@/lib/approval-email';
import { findStarter } from '@/lib/starter-templates';
import { compileTemplate } from '@/lib/compile-template';
import { uid, type Block, type ButtonBlock, type TemplateDocument } from '@/lib/blocks';

export type ActionState = { ok: boolean; error?: string; id?: string; sent?: number; failed?: number };

/**
 * Load a draft campaign so the wizard can resume editing from where the
 * user left off. Returns everything the wizard needs to repopulate state +
 * pick the correct starting step. Refuses anything except status='draft' —
 * sent / sending campaigns are not editable.
 */
export async function getCampaignForResume(
  id: string,
): Promise<
  | {
      ok: true;
      campaign: {
        id: string;
        name: string | null;
        subject: string | null;
        from_name: string | null;
        from_email: string | null;
        reply_to: string | null;
        template_id: string | null;
        brand_kit_id: string | null;
        list_ids: string[];
        filter_tag: ContactTag | null;
      };
    }
  | { ok: false; error: string }
> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('campaigns')
    .select(
      'id, name, subject, from_name, from_email, reply_to, template_id, brand_kit_id, list_ids, filter_tag, status',
    )
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Campaign not found.' };
  if (data.status !== 'draft') {
    return { ok: false, error: `Campaign is "${data.status}" — only drafts can be edited.` };
  }
  return {
    ok: true,
    campaign: {
      id: data.id,
      name: data.name,
      subject: data.subject,
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to: data.reply_to,
      template_id: data.template_id,
      brand_kit_id: data.brand_kit_id,
      list_ids: (data.list_ids ?? []) as string[],
      filter_tag: data.filter_tag as ContactTag | null,
    },
  };
}

const Settings = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(200),
  from_name: z.string().trim().min(1).max(120),
  from_email: z.string().email(),
  reply_to: z.string().email().optional().or(z.literal('')).transform((v) => v || null),
  brand_kit_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
});

function fd(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v;
  return o;
}

export async function createCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole('editor');
  const parsed = Settings.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('campaigns')
    .insert({ ...parsed.data, status: 'draft', created_by: profile.id })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/campaigns');
  return { ok: true, id: data.id };
}

export async function updateCampaign(
  id: string,
  patch: Partial<{
    name: string;
    subject: string;
    from_name: string;
    from_email: string;
    reply_to: string | null;
    template_id: string | null;
    list_ids: string[];
    filter_tag: ContactTag | null;
    brand_kit_id: string | null;
  }>,
): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { error } = await supabase.from('campaigns').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${id}`);
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<ActionState> {
  await requireRole('admin');
  const supabase = createServiceClient();
  const { error } = await supabase.from('campaigns').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/campaigns');
  return { ok: true };
}

/**
 * Render the campaign's email exactly as it will be sent — with merge tags
 * personalised against a synthetic test recipient and tracking links rewritten
 * to point at this app. Used by the wizard's preview iframe (Edit + Review
 * steps). Returns the full HTML string ready to drop into an iframe srcdoc.
 *
 * Test recipient values intentionally use generic placeholders so the user
 * can see what `{{name}}` etc. will look like for a real subscriber.
 */
export async function getCampaignPreviewHtml(
  campaignId: string,
): Promise<{ ok: true; html: string; subject: string } | { ok: false; error: string }> {
  await requireRole('viewer');
  const supabase = createServiceClient();

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('subject, template_id, list_ids, filter_tag')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campaign not found' };
  if (!campaign.template_id) return { ok: false, error: 'No template selected yet' };

  const { data: template } = await supabase
    .from('templates')
    .select('html_content')
    .eq('id', campaign.template_id)
    .maybeSingle();
  if (!template?.html_content) return { ok: false, error: 'Template HTML is empty' };

  const prepared = prepareCampaignHtml(template.html_content, campaignId);

  // Same trick as sendTestEmail: borrow the first matching contact's data
  // so the preview shows realistic merge-tag values. Falls back to a generic
  // 'Maria Silva' placeholder when the campaign has no audience yet.
  let q = supabase
    .from('contacts')
    .select('id, email, name, last_name, phone, company, custom_fields')
    .eq('status', 'subscribed');
  if (campaign.filter_tag) q = q.eq('tag', campaign.filter_tag);
  if ((campaign.list_ids ?? []).length > 0) {
    q = q.overlaps('lists', campaign.list_ids);
  }
  const { data: firstRows } = await q.order('created_at', { ascending: true }).limit(1);
  const first = firstRows?.[0] ?? null;

  const sample = {
    id: 'preview-recipient',
    email: first?.email ?? 'preview@brleducacao.com.br',
    name: first?.name ?? 'Maria',
    last_name: first?.last_name ?? 'Silva',
    phone: first?.phone ?? null,
    company: first?.company ?? null,
    custom_fields: first?.custom_fields ?? null,
  };
  const html = personalize(prepared.html, sample);
  const subject = personalizeSubject(campaign.subject ?? '', sample);

  return { ok: true, html, subject };
}

/**
 * Send a single test email of the campaign to one address — used by the
 * "Enviar teste" form on the Review step. Does NOT mutate campaign state,
 * does NOT create a campaign_recipients row, does NOT mark the campaign as
 * sent. Tracking pixel + link rewriting still apply so the user sees the
 * real shape of the email.
 */
export async function sendTestEmail(
  campaignId: string,
  toEmail: string,
): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();

  const trimmed = toEmail.trim().toLowerCase();
  const emailOk = z.string().email().safeParse(trimmed);
  if (!emailOk.success) return { ok: false, error: 'Endereço de email inválido.' };

  const { data: campaign } = await supabase
    .from('campaigns')
    .select('subject, template_id, from_name, from_email, reply_to, list_ids, filter_tag')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return { ok: false, error: 'Campaign not found.' };
  if (!campaign.template_id) return { ok: false, error: 'Pick a template first.' };

  const { data: template } = await supabase
    .from('templates')
    .select('html_content')
    .eq('id', campaign.template_id)
    .maybeSingle();
  if (!template?.html_content) return { ok: false, error: 'Template HTML is empty.' };

  const prepared = prepareCampaignHtml(template.html_content, campaignId);

  // Pull the first contact in the campaign's audience to use as the merge-tag
  // source — so {{name}} / {{first_name}} / {{last_name}} / custom fields all
  // render exactly like they will for a real recipient instead of a literal
  // "Teste". The actual delivery still goes to `trimmed` (the operator's test
  // address); we just borrow another contact's PII for personalisation.
  let firstQuery = supabase
    .from('contacts')
    .select('id, email, name, last_name, phone, company, custom_fields')
    .eq('status', 'subscribed');
  if (campaign.filter_tag) firstQuery = firstQuery.eq('tag', campaign.filter_tag);
  if ((campaign.list_ids ?? []).length > 0) {
    firstQuery = firstQuery.overlaps('lists', campaign.list_ids);
  }
  const { data: firstContactRows } = await firstQuery
    .order('created_at', { ascending: true })
    .limit(1);
  const firstContact = firstContactRows?.[0] ?? null;

  const sample = {
    id: 'test-recipient',
    email: trimmed, // delivery target stays the operator's test address
    name: firstContact?.name ?? 'Teste',
    last_name: firstContact?.last_name ?? null,
    phone: firstContact?.phone ?? null,
    company: firstContact?.company ?? null,
    custom_fields: firstContact?.custom_fields ?? null,
  };
  const html = personalize(prepared.html, sample);
  const subject = `[TESTE] ${personalizeSubject(campaign.subject ?? '', sample)}`;

  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('from_name, from_email, reply_to')
    .eq('id', true)
    .maybeSingle();
  const effFromName = campaign.from_name || appSettings?.from_name || FROM_NAME;
  const effFromEmail = campaign.from_email || appSettings?.from_email || FROM_EMAIL;
  const effReplyTo = campaign.reply_to ?? appSettings?.reply_to ?? undefined;
  const fromHeader = `${effFromName} <${effFromEmail}>`;

  try {
    const result = await resend.emails.send({
      from: fromHeader,
      to: trimmed,
      subject,
      html,
      replyTo: effReplyTo ?? undefined,
    });
    if (result.error) {
      console.error('[sendTestEmail] Resend rejected:', {
        to: trimmed,
        from: fromHeader,
        error: result.error,
      });
      return { ok: false, error: `Resend: ${result.error.message}` };
    }
    console.log('[sendTestEmail] sent OK:', { to: trimmed, id: result.data?.id });
  } catch (e) {
    console.error('[sendTestEmail] threw:', e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { ok: true };
}

/**
 * Wizard-only convenience action: take a starter template id (`builtin:*` or
 * a DB template flagged is_starter), clone it, re-theme the blocks with the
 * campaign's selected brand kit, persist it as a new template row, and link
 * the resulting template to the campaign in one shot.
 *
 * Returns the new template id so the wizard can advance directly to the
 * next step without needing a separate updateCampaign call.
 */
export async function useStarterForCampaign(
  campaignId: string,
  starterId: string,
): Promise<ActionState> {
  const profile = await requireRole('editor');
  const supabase = createServiceClient();

  // Load the campaign so we can find its kit + use its name for labelling
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, brand_kit_id')
    .eq('id', campaignId)
    .maybeSingle();
  if (campErr || !campaign) return { ok: false, error: campErr?.message ?? 'Campaign not found.' };

  // Pull the kit (may be null on legacy campaigns; in that case we keep the
  // starter's original BRL palette as a safe fallback)
  let kit: BrandKit | null = null;
  if (campaign.brand_kit_id) {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('id', campaign.brand_kit_id)
      .maybeSingle<BrandKit>();
    kit = data;
  }

  // Resolve the starter document
  let sourceName: string;
  let sourceDoc: TemplateDocument;
  if (starterId.startsWith('builtin:')) {
    const starter = findStarter(starterId);
    if (!starter) return { ok: false, error: 'Starter template not found.' };
    sourceName = starter.name;
    sourceDoc = starter.document;
  } else {
    const { data, error } = await supabase
      .from('templates')
      .select('name, json_content, is_starter')
      .eq('id', starterId)
      .maybeSingle();
    if (error || !data) return { ok: false, error: error?.message ?? 'Template not found.' };
    if (!data.is_starter) return { ok: false, error: 'This template is not marked as a starter.' };
    sourceName = data.name;
    sourceDoc = data.json_content as TemplateDocument;
  }

  // Theme + give every block a fresh id (and buttons fresh link_ids so click
  // events attribute to *this* campaign template, not the source)
  const themed = kit ? applyKitToBlocks(sourceDoc.blocks, kit) : sourceDoc.blocks;
  const fresh: Block[] = themed.map((b) => {
    if (b.type === 'button') {
      const btn: ButtonBlock = { ...b, id: uid(), link_id: uid() };
      return btn;
    }
    return { ...b, id: uid() } as Block;
  });
  const doc: TemplateDocument = { ...sourceDoc, blocks: fresh };

  // Insert as a normal (non-starter) template, tagged with the kit
  const { data: tplRow, error: insertErr } = await supabase
    .from('templates')
    .insert({
      name: `${campaign.name || 'Campanha'} — ${sourceName}`,
      json_content: doc,
      html_content: compileTemplate(doc),
      created_by: profile.id,
      brand_kit_id: campaign.brand_kit_id,
      is_starter: false,
    })
    .select('id')
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Link to campaign
  const { error: linkErr } = await supabase
    .from('campaigns')
    .update({ template_id: tplRow.id })
    .eq('id', campaignId);
  if (linkErr) return { ok: false, error: linkErr.message };

  revalidatePath('/templates');
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, id: tplRow.id };
}

/** Resolve the unique recipient list for a campaign (subscribed contacts only). */
export async function previewRecipients(
  list_ids: string[],
  filter_tag: ContactTag | null,
): Promise<{ count: number; sample: string[] }> {
  await requireRole('viewer');
  const supabase = createServiceClient();

  let q = supabase
    .from('contacts')
    .select('id, email', { count: 'exact' })
    .eq('status', 'subscribed');

  if (filter_tag) q = q.eq('tag', filter_tag);
  if (list_ids.length > 0) q = q.overlaps('lists', list_ids);

  const { data, count } = await q.limit(5);
  return { count: count ?? 0, sample: (data ?? []).map((c) => c.email) };
}

/** Compile, personalize, and send a campaign now. */
export async function sendCampaign(id: string): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();

  // Load campaign + template
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (cErr || !campaign) return { ok: false, error: cErr?.message ?? 'Campaign not found' };
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return { ok: false, error: 'This campaign was already sent or is currently sending.' };
  }
  if (!campaign.template_id) return { ok: false, error: 'Pick a template first.' };

  const { data: template, error: tErr } = await supabase
    .from('templates')
    .select('html_content')
    .eq('id', campaign.template_id)
    .maybeSingle();
  if (tErr || !template?.html_content) return { ok: false, error: 'Template HTML is empty.' };

  // Resolve recipients (include phone/company/custom_fields so they can be used as merge tags)
  let recipientsQuery = supabase
    .from('contacts')
    .select('id, email, name, last_name, phone, company, custom_fields')
    .eq('status', 'subscribed');
  if (campaign.filter_tag) recipientsQuery = recipientsQuery.eq('tag', campaign.filter_tag);
  if ((campaign.list_ids ?? []).length > 0)
    recipientsQuery = recipientsQuery.overlaps('lists', campaign.list_ids);
  const { data: recipients, error: rErr } = await recipientsQuery;
  if (rErr) return { ok: false, error: rErr.message };
  if (!recipients || recipients.length === 0)
    return { ok: false, error: 'No subscribed recipients match this audience.' };

  // Mark sending + capture link rewrite map
  await supabase
    .from('campaigns')
    .update({ status: 'sending', total_recipients: recipients.length })
    .eq('id', id);

  const prepared = prepareCampaignHtml(template.html_content, id);

  // Persist tracked links for later attribution
  if (prepared.links.length > 0) {
    await supabase
      .from('tracked_links')
      .upsert(
        prepared.links.map((l) => ({
          campaign_id: id,
          link_id: l.link_id,
          original_url: l.original_url,
        })),
        { onConflict: 'campaign_id,link_id', ignoreDuplicates: true },
      );
  }

  // Resolve From / Reply-to with fallback chain:
  //   1. campaign.from_name/from_email/reply_to (per-campaign override)
  //   2. app_settings table (admin-edited defaults)
  //   3. env vars (FROM_NAME / FROM_EMAIL)
  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('from_name, from_email, reply_to')
    .eq('id', true)
    .maybeSingle();
  const effFromName = campaign.from_name || appSettings?.from_name || FROM_NAME;
  const effFromEmail = campaign.from_email || appSettings?.from_email || FROM_EMAIL;
  const effReplyTo = campaign.reply_to ?? appSettings?.reply_to ?? undefined;

  // Send (sequential to respect Resend rate limits; can be parallelised later)
  const fromHeader = `${effFromName} <${effFromEmail}>`;
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const html = personalize(prepared.html, r);
    const subject = personalizeSubject(campaign.subject, r);

    try {
      const { data: sentRes, error: sendErr } = await resend.emails.send({
        from: fromHeader,
        to: r.email,
        subject,
        html,
        replyTo: effReplyTo ?? undefined,
      });

      if (sendErr) throw new Error(sendErr.message);

      await supabase.from('campaign_recipients').insert({
        campaign_id: id,
        contact_id: r.id,
        email: r.email,
        resend_id: sentRes?.id ?? null,
        status: 'sent',
        sent_at: new Date().toISOString(),
      });
      await supabase.from('email_events').insert({
        campaign_id: id,
        contact_id: r.id,
        event_type: 'sent',
      });
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      await supabase.from('campaign_recipients').insert({
        campaign_id: id,
        contact_id: r.id,
        email: r.email,
        status: 'failed',
      });
      await supabase.from('email_events').insert({
        campaign_id: id,
        contact_id: r.id,
        event_type: 'failed',
        link_url: msg.slice(0, 500),
      });
      failed++;
    }
  }

  await supabase
    .from('campaigns')
    .update({
      status: failed > 0 && sent === 0 ? 'failed' : 'sent',
      sent_at: new Date().toISOString(),
    })
    .eq('id', id);

  revalidatePath('/campaigns');
  revalidatePath(`/campaigns/${id}`);
  return { ok: true, sent, failed };
}

// =====================================================================
// Stakeholder approval workflow
// =====================================================================

const ApprovalRequestInput = z.object({
  stakeholderName: z.string().trim().max(120).optional().or(z.literal('')).transform((v) => v || null),
  stakeholderEmail: z.string().trim().toLowerCase().email(),
});

export type ApprovalHistoryRow = {
  id: string;
  stakeholder_name: string | null;
  stakeholder_email: string;
  status: 'pending' | 'approved' | 'changes_requested' | 'cancelled' | 'expired';
  feedback_note: string | null;
  sent_at: string;
  responded_at: string | null;
  expires_at: string;
};

/**
 * Request stakeholder approval for a campaign. Inserts a campaign_approvals
 * row, sends the approval email via Resend, and bumps campaigns.approval_status
 * to 'pending'. Idempotent at the row level — every call creates a new request
 * (multiple stakeholders are supported; cancel old ones via cancelApproval).
 */
export async function requestApproval(
  campaignId: string,
  input: { stakeholderName?: string; stakeholderEmail: string },
): Promise<{ ok: true; approvalId: string } | { ok: false; error: string }> {
  await requireRole('editor');
  const parsed = ApprovalRequestInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const supabase = createServiceClient();
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('id, name, template_id, from_name, from_email')
    .eq('id', campaignId)
    .maybeSingle();
  if (cErr || !campaign) return { ok: false, error: cErr?.message ?? 'Campaign not found.' };
  if (!campaign.template_id) return { ok: false, error: 'Pick a template before requesting approval.' };

  const { data: template } = await supabase
    .from('templates')
    .select('html_content')
    .eq('id', campaign.template_id)
    .maybeSingle();
  if (!template?.html_content) return { ok: false, error: 'Template HTML is empty.' };

  // Pull the BRL master logo (if uploaded) for the approval-email header
  const { data: brlKit } = await supabase
    .from('brand_kits')
    .select('logo_url')
    .eq('slug', 'brl')
    .maybeSingle();

  // Insert the approval row first so we have its token
  const { data: row, error: insertErr } = await supabase
    .from('campaign_approvals')
    .insert({
      campaign_id: campaignId,
      stakeholder_name: parsed.data.stakeholderName,
      stakeholder_email: parsed.data.stakeholderEmail,
      status: 'pending',
    })
    .select('id, token')
    .single();
  if (insertErr || !row) return { ok: false, error: insertErr?.message ?? 'Insert failed.' };

  // Build + send the approval email
  const { html, subject } = buildApprovalEmail({
    campaignHtml: template.html_content,
    campaignName: campaign.name ?? 'Campanha sem nome',
    stakeholderName: parsed.data.stakeholderName,
    token: row.token,
    brlLogoUrl: brlKit?.logo_url ?? null,
  });

  // From address: use the campaign's from_name / from_email if set so the
  // approval email feels like part of the brand, falling back to env defaults.
  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('from_name, from_email')
    .eq('id', true)
    .maybeSingle();
  const effFromName = campaign.from_name || appSettings?.from_name || FROM_NAME;
  const effFromEmail = campaign.from_email || appSettings?.from_email || FROM_EMAIL;

  try {
    const result = await resend.emails.send({
      from: `${effFromName} <${effFromEmail}>`,
      to: parsed.data.stakeholderEmail,
      subject,
      html,
    });
    if (result.error) {
      console.error('[requestApproval] Resend rejected:', result.error);
      // Roll back the row so we don't have a 'pending' approval that was never sent
      await supabase.from('campaign_approvals').delete().eq('id', row.id);
      return { ok: false, error: `Resend: ${result.error.message}` };
    }
  } catch (e) {
    console.error('[requestApproval] threw:', e);
    await supabase.from('campaign_approvals').delete().eq('id', row.id);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Bump campaign.approval_status if it was 'not_required' or already settled
  await recomputeApprovalStatus(supabase, campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true, approvalId: row.id };
}

/** Cancel a pending approval (operator sent to wrong email, etc.). The token
 *  becomes invalid — stakeholder will see a 'link cancelled' page if they
 *  try to respond. */
export async function cancelApproval(approvalId: string): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('campaign_approvals')
    .select('id, campaign_id, status')
    .eq('id', approvalId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Approval request not found.' };
  if (row.status !== 'pending') {
    return { ok: false, error: `Não pode cancelar — status já é '${row.status}'.` };
  }
  const { error } = await supabase
    .from('campaign_approvals')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', approvalId);
  if (error) return { ok: false, error: error.message };
  await recomputeApprovalStatus(supabase, row.campaign_id);
  revalidatePath(`/campaigns/${row.campaign_id}`);
  return { ok: true };
}

/** Re-fetch + re-send the approval email for an existing pending request
 *  (stakeholder lost the email, marked as spam, etc.). Generates a fresh
 *  token + extends the expiry. */
export async function resendApproval(approvalId: string): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('campaign_approvals')
    .select('id, campaign_id, stakeholder_name, stakeholder_email, status')
    .eq('id', approvalId)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Approval not found.' };
  if (row.status !== 'pending') {
    return { ok: false, error: `Não pode reenviar — status já é '${row.status}'.` };
  }
  // Cancel the old, create a new one (preserves the audit trail)
  await supabase
    .from('campaign_approvals')
    .update({ status: 'cancelled', responded_at: new Date().toISOString() })
    .eq('id', approvalId);
  const send = await requestApproval(row.campaign_id, {
    stakeholderName: row.stakeholder_name ?? undefined,
    stakeholderEmail: row.stakeholder_email,
  });
  if (!send.ok) return send;
  return { ok: true };
}

/**
 * Recompute campaigns.approval_status from the live set of approvals.
 *
 * Rules:
 *  - No active approvals (all cancelled/expired or none exist) → 'not_required'
 *  - require_all = false → reflect the latest non-cancelled response
 *      (any 'approved' / 'changes_requested' overwrites 'pending')
 *  - require_all = true  → 'approved' only if EVERY non-cancelled is 'approved';
 *      any 'changes_requested' wins; else 'pending'
 *
 * Internal helper — called after every approval mutation. Exported so the
 * /api/approval/respond route can call it after committing a response.
 */
export async function recomputeApprovalStatus(
  supabase: ReturnType<typeof createServiceClient>,
  campaignId: string,
): Promise<void> {
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('approval_require_all')
    .eq('id', campaignId)
    .maybeSingle();
  if (!campaign) return;

  const { data: rows } = await supabase
    .from('campaign_approvals')
    .select('status, responded_at, sent_at')
    .eq('campaign_id', campaignId)
    .neq('status', 'cancelled')
    .neq('status', 'expired')
    .order('responded_at', { ascending: false, nullsFirst: false })
    .order('sent_at', { ascending: false });

  const active = rows ?? [];
  let next: 'not_required' | 'pending' | 'approved' | 'changes_requested' = 'not_required';
  if (active.length === 0) {
    next = 'not_required';
  } else if (campaign.approval_require_all) {
    if (active.some((r) => r.status === 'changes_requested')) next = 'changes_requested';
    else if (active.every((r) => r.status === 'approved')) next = 'approved';
    else next = 'pending';
  } else {
    // Latest non-pending wins; if all still pending, 'pending'
    const decisive = active.find((r) => r.status === 'approved' || r.status === 'changes_requested');
    next = (decisive?.status as typeof next) ?? 'pending';
  }
  await supabase.from('campaigns').update({ approval_status: next }).eq('id', campaignId);
}

/** Toggle the 'require_all' flag on a campaign — exposed so the wizard UI can
 *  flip it without going through updateCampaign's bigger schema. */
export async function setRequireAllApprovals(campaignId: string, value: boolean): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('campaigns')
    .update({ approval_require_all: value })
    .eq('id', campaignId);
  if (error) return { ok: false, error: error.message };
  await recomputeApprovalStatus(supabase, campaignId);
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: true };
}

/** Read-only fetch of all approval requests for a campaign — used by the
 *  wizard UI to render the history table. */
export async function listApprovals(campaignId: string): Promise<ApprovalHistoryRow[]> {
  await requireRole('viewer');
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('campaign_approvals')
    .select('id, stakeholder_name, stakeholder_email, status, feedback_note, sent_at, responded_at, expires_at')
    .eq('campaign_id', campaignId)
    .order('sent_at', { ascending: false });
  return (data ?? []) as ApprovalHistoryRow[];
}

// =====================================================================
// Recipients-by-group (drill-down from the funnel stat cards)
// =====================================================================

/** Cohort buckets the operator can drill into from the campaign funnel. */
export type RecipientGroup =
  | 'recipients'      // every contact the campaign was queued for
  | 'sent'            // emit-success events
  | 'delivered'       // Resend delivered webhook
  | 'opened'          // any open
  | 'clicked'         // any click
  | 'bounced'         // hard bounce
  | 'complained'      // marked spam
  | 'not_opened'      // recipients that did NOT open — re-engagement audience
  | 'opened_no_click'; // opened but didn't click — soft-engaged audience

export type RecipientRow = {
  id: string;
  email: string;
  name: string | null;
  last_name: string | null;
  tag: ContactTag;
  status: 'subscribed' | 'unsubscribed' | 'bounced';
};

/**
 * Return the contacts in a campaign's funnel cohort. Used by the
 * /campaigns/[id]/recipients?group=... drill-down page.
 *
 * Implementation:
 *  - 'recipients': join campaign_recipients → contacts
 *  - sent/delivered/opened/clicked/bounced/complained: distinct contact_ids
 *    from email_events of that type, then look up the contacts
 *  - not_opened: recipients minus opened
 *  - opened_no_click: opened minus clicked
 */
export async function getCampaignRecipientsByGroup(
  campaignId: string,
  group: RecipientGroup,
): Promise<RecipientRow[]> {
  await requireRole('viewer');
  const supabase = createServiceClient();

  async function contactIdsForEvent(eventType: string): Promise<Set<string>> {
    const { data } = await supabase
      .from('email_events')
      .select('contact_id')
      .eq('campaign_id', campaignId)
      .eq('event_type', eventType);
    const set = new Set<string>();
    for (const r of (data ?? []) as Array<{ contact_id: string | null }>) {
      if (r.contact_id) set.add(r.contact_id);
    }
    return set;
  }

  async function recipientContactIds(): Promise<Set<string>> {
    const { data } = await supabase
      .from('campaign_recipients')
      .select('contact_id')
      .eq('campaign_id', campaignId);
    const set = new Set<string>();
    for (const r of (data ?? []) as Array<{ contact_id: string | null }>) {
      if (r.contact_id) set.add(r.contact_id);
    }
    return set;
  }

  let ids: Set<string>;
  switch (group) {
    case 'recipients':
      ids = await recipientContactIds();
      break;
    case 'sent':
    case 'delivered':
    case 'opened':
    case 'clicked':
    case 'bounced':
    case 'complained':
      ids = await contactIdsForEvent(group);
      break;
    case 'not_opened': {
      const [recipients, opened] = await Promise.all([
        recipientContactIds(),
        contactIdsForEvent('opened'),
      ]);
      ids = new Set<string>();
      for (const id of recipients) if (!opened.has(id)) ids.add(id);
      break;
    }
    case 'opened_no_click': {
      const [opened, clicked] = await Promise.all([
        contactIdsForEvent('opened'),
        contactIdsForEvent('clicked'),
      ]);
      ids = new Set<string>();
      for (const id of opened) if (!clicked.has(id)) ids.add(id);
      break;
    }
    default:
      return [];
  }

  if (ids.size === 0) return [];

  const { data } = await supabase
    .from('contacts')
    .select('id, email, name, last_name, tag, status')
    .in('id', Array.from(ids))
    .order('email');
  return (data ?? []) as RecipientRow[];
}
