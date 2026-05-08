'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { compileTemplate } from '@/lib/compile-template';
import { DEFAULT_DOCUMENT, type TemplateDocument } from '@/lib/blocks';

export type ActionState = { ok: boolean; error?: string; id?: string };

const NameOnly = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});

function fd(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v;
  return o;
}

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole('editor');
  const parsed = NameOnly.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: parsed.data.name,
      json_content: DEFAULT_DOCUMENT,
      html_content: compileTemplate(DEFAULT_DOCUMENT),
      created_by: profile.id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/templates');
  return { ok: true, id: data.id };
}

export async function saveTemplate(id: string, name: string, doc: TemplateDocument): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('templates')
    .update({
      name,
      json_content: doc,
      html_content: compileTemplate(doc),
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/templates');
  revalidatePath(`/templates/${id}/edit`);
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<ActionState> {
  await requireRole('admin');
  const supabase = createServiceClient();
  const { error } = await supabase.from('templates').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/templates');
  return { ok: true };
}

export async function duplicateTemplate(id: string): Promise<ActionState> {
  const profile = await requireRole('editor');
  const supabase = createServiceClient();
  const { data: orig, error: readErr } = await supabase
    .from('templates')
    .select('name, json_content, html_content')
    .eq('id', id)
    .maybeSingle();
  if (readErr || !orig) return { ok: false, error: readErr?.message ?? 'Template not found' };

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: `${orig.name} (copy)`,
      json_content: orig.json_content,
      html_content: orig.html_content,
      created_by: profile.id,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/templates');
  return { ok: true, id: data.id };
}
