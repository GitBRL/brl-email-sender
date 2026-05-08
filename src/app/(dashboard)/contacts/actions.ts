'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import type { ContactStatus, ContactTag } from '@/types';

const ContactInput = z.object({
  email: z.string().email(),
  name: z.string().trim().optional().or(z.literal('')).transform((v) => v || null),
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

const ImportRow = ContactInput.extend({
  // Allow optional missing fields per row
  email: z.string().email(),
});

export async function bulkImportContacts(
  rows: Array<Record<string, string>>,
): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[] }> {
  await requireRole('editor');
  const supabase = await createClient();

  const valid: Array<z.infer<typeof ImportRow>> = [];
  const errors: string[] = [];
  for (const [i, row] of rows.entries()) {
    const parsed = ImportRow.safeParse({
      email: row.email?.trim().toLowerCase(),
      name: row.name?.trim() || '',
      phone: row.phone?.trim() || '',
      company: row.company?.trim() || '',
      tag: (row.tag?.trim().toLowerCase() as ContactTag) || 'cold',
      status: (row.status?.trim().toLowerCase() as ContactStatus) || 'subscribed',
    });
    if (parsed.success) valid.push(parsed.data);
    else errors.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message}`);
  }

  if (valid.length === 0) return { ok: false, imported: 0, skipped: rows.length, errors };

  // Upsert by email so re-imports update tags/status without duplicates
  const { error, count } = await supabase
    .from('contacts')
    .upsert(valid, { onConflict: 'email', count: 'exact' });
  if (error) return { ok: false, imported: 0, skipped: rows.length, errors: [...errors, error.message] };

  revalidatePath('/contacts');
  return { ok: true, imported: count ?? valid.length, skipped: rows.length - valid.length, errors };
}
