'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { ContactStatus, ContactTag } from '@/types';

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

export async function bulkImportContacts(
  rows: ImportRowInput[],
): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[] }> {
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

  revalidatePath('/contacts');
  return { ok: true, imported: count ?? valid.length, skipped: rows.length - valid.length, errors };
}
