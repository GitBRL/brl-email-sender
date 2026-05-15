'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { ContactStatus, ContactTag } from '@/types';
import { splitFullName } from '@/lib/contact-cleaning';

const ContactInput = z.object({
  email: z.string().email(),
  name: z.string().trim().optional().or(z.literal('')).transform((v) => v || null),
  last_name: z.string().trim().optional().or(z.literal('')).transform((v) => v || null),
  phone: z.string().trim().optional().or(z.literal('')).transform((v) => v || null),
  company: z.string().trim().optional().or(z.literal('')).transform((v) => v || null),
  tag: z.enum(['hot', 'warm', 'cold']).default('cold'),
  status: z.enum(['subscribed', 'unsubscribed', 'bounced']).default('subscribed'),
});

export type ActionState = { ok: boolean; error?: string };

function fd(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v;
  return o;
}

export async function createContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('editor');
  const parsed = ContactInput.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = await createClient();
  const { error } = await supabase.from('contacts').insert(parsed.data);
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'A contact with this email already exists.' };
    return { ok: false, error: error.message };
  }
  revalidatePath('/contacts');
  return { ok: true };
}

export async function updateContact(
  id: string,
  patch: Partial<{ tag: ContactTag; status: ContactStatus; name: string; phone: string; company: string }>,
): Promise<ActionState> {
  await requireRole('editor');
  const supabase = await createClient();
  const { error } = await supabase.from('contacts').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/contacts');
  revalidatePath(`/contacts/${id}`);
  return { ok: true };
}

export async function deleteContact(id: string): Promise<ActionState> {
  await requireRole('admin');
  const supabase = await createClient();
  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/contacts');
  return { ok: true };
}

/** Reserved keys that the importer treats as standard contact columns, not custom fields. */
const STANDARD_KEYS = new Set(['email', 'name', 'last_name', 'phone', 'company', 'tag', 'status']);

/** A single row coming from the importer. Standard fields live at top-level, custom fields nested. */
export type ImportRowInput = {
  email?: string;
  name?: string;
  last_name?: string;
  phone?: string;
  company?: string;
  tag?: string;
  status?: string;
  custom_fields?: Record<string, string>;
};

export type ImportListAssignment =
  | { kind: 'none' }
  | { kind: 'existing'; id: string }
  | { kind: 'new'; name: string };

export async function bulkImportContacts(
  rows: ImportRowInput[],
  listAssignment: ImportListAssignment = { kind: 'none' },
): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[]; listId?: string; listName?: string }> {
  await requireRole('editor');
  const supabase = await createClient();

  type ContactPayload = z.infer<typeof ContactInput> & {
    custom_fields: Record<string, string>;
  };
  const valid: ContactPayload[] = [];
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    const parsed = ContactInput.safeParse({
      email: row.email?.trim().toLowerCase(),
      name: row.name?.trim() || '',
      last_name: row.last_name?.trim() || '',
      phone: row.phone?.trim() || '',
      company: row.company?.trim() || '',
      tag: (row.tag?.trim().toLowerCase() as ContactTag) || 'cold',
      status: (row.status?.trim().toLowerCase() as ContactStatus) || 'subscribed',
    });
    if (!parsed.success) {
      errors.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message}`);
      continue;
    }

    // Sanitize custom fields: drop empty values, drop any key colliding with a standard one.
    const custom: Record<string, string> = {};
    const incoming = row.custom_fields ?? {};
    for (const [k, v] of Object.entries(incoming)) {
      const cleanKey = k.trim();
      const cleanVal = (v ?? '').trim();
      if (!cleanKey || STANDARD_KEYS.has(cleanKey.toLowerCase())) continue;
      if (cleanVal === '') continue;
      custom[cleanKey] = cleanVal;
    }
    valid.push({ ...parsed.data, custom_fields: custom });
  }

  if (valid.length === 0) return { ok: false, imported: 0, skipped: rows.length, errors };

  // Upsert by email so re-imports update tags/status without duplicates.
  // For custom_fields we MERGE rather than replace, so partial re-imports
  // (e.g. only a `course` column) don't blow away previously-imported keys.
  // Strategy: fetch existing custom_fields for the rows we're upserting,
  // shallow-merge in JS, then upsert.
  const emails = valid.map((v) => v.email);
  const { data: existing } = await supabase
    .from('contacts')
    .select('email, custom_fields')
    .in('email', emails);
  const existingMap = new Map<string, Record<string, unknown>>();
  for (const e of existing ?? []) {
    existingMap.set(e.email, (e.custom_fields ?? {}) as Record<string, unknown>);
  }
  const merged = valid.map((v) => ({
    ...v,
    custom_fields: { ...(existingMap.get(v.email) ?? {}), ...v.custom_fields },
  }));

  const { error, count } = await supabase
    .from('contacts')
    .upsert(merged, { onConflict: 'email', count: 'exact' });
  if (error) return { ok: false, imported: 0, skipped: rows.length, errors: [...errors, error.message] };

  // ----- List assignment -----
  // After upsert, optionally tag every imported contact with a list (either
  // an existing one or a freshly created one). We append the list id to each
  // contact's `lists` uuid[] column without disturbing other memberships.
  let listId: string | undefined;
  let listName: string | undefined;
  if (listAssignment.kind !== 'none') {
    if (listAssignment.kind === 'new') {
      const trimmed = listAssignment.name.trim();
      if (trimmed) {
        const { data: created, error: listErr } = await supabase
          .from('lists')
          .insert({ name: trimmed })
          .select('id, name')
          .single();
        if (listErr) errors.push(`Falha ao criar lista: ${listErr.message}`);
        else {
          listId = created.id;
          listName = created.name;
        }
      }
    } else if (listAssignment.kind === 'existing') {
      const { data: found } = await supabase
        .from('lists')
        .select('id, name')
        .eq('id', listAssignment.id)
        .maybeSingle();
      if (found) {
        listId = found.id;
        listName = found.name;
      } else {
        errors.push('Lista existente não encontrada.');
      }
    }

    if (listId) {
      // Fetch current lists arrays so we can append rather than replace.
      const { data: contactRows } = await supabase
        .from('contacts')
        .select('id, lists')
        .in('email', emails);
      if (contactRows && contactRows.length > 0) {
        // Batch updates one-by-one — postgres array ops via Supabase REST
        // don't have a true "append if missing" primitive, so we patch each.
        for (const c of contactRows) {
          const current = (c.lists ?? []) as string[];
          if (current.includes(listId)) continue;
          await supabase
            .from('contacts')
            .update({ lists: [...current, listId] })
            .eq('id', c.id);
        }
      }
      revalidatePath('/lists');
      revalidatePath(`/lists/${listId}`);
    }
  }

  revalidatePath('/contacts');
  return {
    ok: true,
    imported: count ?? valid.length,
    skipped: rows.length - valid.length,
    errors,
    listId,
    listName,
  };
}

/**
 * One-shot data fix: for every contact whose `name` contains a space and
 * whose `last_name` is null, split the full name at the first whitespace and
 * write back name=first / last_name=rest. Idempotent — re-running won't
 * change rows already split. Used to backfill data imported before the
 * "Split full name" toggle existed.
 */
export async function bulkSplitExistingNames(): Promise<{
  ok: boolean;
  processed: number;
  skipped: number;
  error?: string;
}> {
  await requireRole('editor');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, last_name')
    .is('last_name', null)
    .like('name', '% %');
  if (error) return { ok: false, processed: 0, skipped: 0, error: error.message };

  const rows = data ?? [];
  let processed = 0;
  let skipped = 0;
  for (const row of rows) {
    const { first, last } = splitFullName(row.name ?? '');
    if (!first || !last) {
      skipped++;
      continue;
    }
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ name: first, last_name: last })
      .eq('id', row.id);
    if (updErr) skipped++;
    else processed++;
  }

  revalidatePath('/contacts');
  return { ok: true, processed, skipped };
}

/**
 * Hard-delete a batch of contacts by id. Cascades through any FKs (campaign_recipients
 * are linked to email events, not contacts directly, so no cleanup needed).
 *
 * No-op when the id list is empty. Returns the count actually deleted so the UI
 * can show a confirmation toast.
 */
export async function bulkDeleteContacts(
  ids: string[],
): Promise<{ ok: boolean; deleted: number; error?: string }> {
  await requireRole('admin');
  if (ids.length === 0) return { ok: true, deleted: 0 };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from('contacts')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) return { ok: false, deleted: 0, error: error.message };
  revalidatePath('/contacts');
  revalidatePath('/lists');
  return { ok: true, deleted: count ?? ids.length };
}

/**
 * Create a brand-new list and append the given contact ids to its `lists`
 * uuid[] column in one shot. Used by the bulk "Pull selected into new list"
 * action on the contacts page.
 */
export async function createListAndAssignContacts(
  listName: string,
  contactIds: string[],
): Promise<{ ok: boolean; listId?: string; assigned?: number; error?: string }> {
  await requireRole('editor');
  const trimmed = listName.trim();
  if (!trimmed) return { ok: false, error: 'Nome da lista é obrigatório.' };
  if (contactIds.length === 0) return { ok: false, error: 'Nenhum contato selecionado.' };

  const supabase = await createClient();
  const { data: list, error: listErr } = await supabase
    .from('lists')
    .insert({ name: trimmed })
    .select('id')
    .single();
  if (listErr || !list) return { ok: false, error: listErr?.message ?? 'Falha ao criar lista.' };

  // Append the new list id to each contact's `lists` array (skip dupes).
  const { data: rows } = await supabase
    .from('contacts')
    .select('id, lists')
    .in('id', contactIds);
  let assigned = 0;
  for (const row of rows ?? []) {
    const current = (row.lists ?? []) as string[];
    if (current.includes(list.id)) continue;
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ lists: [...current, list.id] })
      .eq('id', row.id);
    if (!updErr) assigned++;
  }

  revalidatePath('/contacts');
  revalidatePath('/lists');
  revalidatePath(`/lists/${list.id}`);
  return { ok: true, listId: list.id, assigned };
}

/**
 * Append a batch of contacts to an existing list. Mirror of the importer's
 * list-assignment logic — idempotent (skips contacts already in the list).
 */
export async function addContactsToExistingList(
  listId: string,
  contactIds: string[],
): Promise<{ ok: boolean; assigned?: number; error?: string }> {
  await requireRole('editor');
  if (contactIds.length === 0) return { ok: false, error: 'Nenhum contato selecionado.' };
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('contacts')
    .select('id, lists')
    .in('id', contactIds);
  let assigned = 0;
  for (const row of rows ?? []) {
    const current = (row.lists ?? []) as string[];
    if (current.includes(listId)) continue;
    const { error: updErr } = await supabase
      .from('contacts')
      .update({ lists: [...current, listId] })
      .eq('id', row.id);
    if (!updErr) assigned++;
  }
  revalidatePath('/contacts');
  revalidatePath('/lists');
  revalidatePath(`/lists/${listId}`);
  return { ok: true, assigned };
}
