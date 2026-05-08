'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { resend, FROM_EMAIL, FROM_NAME } from '@/lib/resend';
import { prepareCampaignHtml, personalize, personalizeSubject } from '@/lib/tracking';
import type { ContactTag } from '@/types';

export type ActionState = { ok: boolean; error?: string; id?: string; sent?: number; failed?: number };

const Settings = z.object({
  name: z.string().trim().min(1).max(160),
  subject: z.string().trim().min(1).max(200),
  from_name: z.string().trim().min(1).max(120),
  from_email: z.string().email(),
  reply_to: z.string().email().optional().or(z.literal('')).transform((v) => v || null),
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

  // Resolve recipients
  let recipientsQuery = supabase
    .from('contacts')
    .select('id, email, name')
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

  // Send (sequential to respect Resend rate limits; can be parallelised later)
  const fromHeader = `${campaign.from_name || FROM_NAME} <${campaign.from_email || FROM_EMAIL}>`;
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const html = personalize(prepared.html, { id: r.id, email: r.email, name: r.name });
    const subject = personalizeSubject(campaign.subject, { name: r.name, email: r.email });

    try {
      const { data: sentRes, error: sendErr } = await resend.emails.send({
        from: fromHeader,
        to: r.email,
        subject,
        html,
        replyTo: campaign.reply_to ?? undefined,
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
