'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

/** Normalise a free-form tags string (comma or newline separated) into a
 *  lowercase, deduped, sorted array. Empty strings collapse to []. */
function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(
      new Set(
        raw
          .map((s) => String(s).trim().toLowerCase())
          .filter((s) => s.length > 0 && s.length <= 40),
      ),
    ).sort();
  }
  if (typeof raw === 'string') {
    return Array.from(
      new Set(
        raw
          .split(/[,\n]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.length > 0 && s.length <= 40),
      ),
    ).sort();
  }
  return [];
}

const ListInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.string().trim().max(500).optional().or(z.literal('')).transform((v) => v || null),
  tags: z.unknown().transform((v) => parseTags(v)),
});

export type ActionState = { ok: boolean; error?: string; id?: string };

function fd(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v;
  return o;
}

export async function createList(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('editor');
  const parsed = ListInput.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();
  const { data, error } = await supabase.from('lists').insert(parsed.data).select('id').single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/lists');
  return { ok: true, id: data.id };
}

export async function updateList(
  id: string,
  patch: { name?: string; description?: string | null; tags?: string[] },
): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  // Normalise tags on update so callers don't have to remember the rules
  const normalised = { ...patch };
  if (patch.tags !== undefined) normalised.tags = parseTags(patch.tags);
  const { error } = await supabase.from('lists').update(normalised).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/lists');
  revalidatePath(`/lists/${id}`);
  return { ok: true };
}

export async function deleteList(id: string): Promise<ActionState> {
  await requireRole('admin');
  const supabase = createServiceClient();
  // Strip the list id from any contact.lists arrays first
  const { data: members } = await supabase
    .from('contacts')
    .select('id, lists')
    .contains('lists', [id]);
  for (const c of (members ?? []) as Array<{ id: string; lists: string[] }>) {
    await supabase
      .from('contacts')
      .update({ lists: c.lists.filter((x) => x !== id) })
      .eq('id', c.id);
  }

  const { error } = await supabase.from('lists').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/lists');
  return { ok: true };
}

/** Add the given list id to each contact's `lists` array (no duplicates). */
export async function addContactsToList(listId: string, contactIds: string[]): Promise<ActionState> {
  await requireRole('editor');
  if (contactIds.length === 0) return { ok: true };
  const supabase = createServiceClient();

  const { data: contacts, error: readErr } = await supabase
    .from('contacts')
    .select('id, lists')
    .in('id', contactIds);
  if (readErr) return { ok: false, error: readErr.message };

  const updates = (contacts ?? []).map((c) => {
    const next = Array.from(new Set([...(c.lists ?? []), listId]));
    return supabase.from('contacts').update({ lists: next }).eq('id', c.id);
  });
  const results = await Promise.all(updates);
  const firstErr = results.find((r) => r.error);
  if (firstErr?.error) return { ok: false, error: firstErr.error.message };

  revalidatePath(`/lists/${listId}`);
  revalidatePath('/lists');
  return { ok: true };
}

export async function removeContactFromList(listId: string, contactId: string): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { data: contact, error: readErr } = await supabase
    .from('contacts')
    .select('lists')
    .eq('id', contactId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!contact) return { ok: false, error: 'Contact not found' };

  const next = (contact.lists ?? []).filter((x: string) => x !== listId);
  const { error } = await supabase.from('contacts').update({ lists: next }).eq('id', contactId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/lists/${listId}`);
  return { ok: true };
}
