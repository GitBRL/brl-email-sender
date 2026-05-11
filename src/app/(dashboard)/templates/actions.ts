'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { compileTemplate } from '@/lib/compile-template';
import { DEFAULT_DOCUMENT, uid, type TemplateDocument, type Block, type ButtonBlock } from '@/lib/blocks';
import { findStarter } from '@/lib/starter-templates';

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

export async function saveTemplate(
  id: string,
  name: string,
  doc: TemplateDocument,
  options?: { is_starter?: boolean },
): Promise<ActionState> {
  await requireRole('editor');
  const supabase = createServiceClient();
  type Patch = {
    name: string;
    json_content: TemplateDocument;
    html_content: string;
    is_starter?: boolean;
  };
  const patch: Patch = { name, json_content: doc, html_content: compileTemplate(doc) };
  if (options && typeof options.is_starter === 'boolean') {
    patch.is_starter = options.is_starter;
  }
  const { error } = await supabase.from('templates').update(patch).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/templates');
  revalidatePath(`/templates/${id}/edit`);
  return { ok: true };
}

/**
 * Create a new editable template by cloning a starter — either a built-in one
 * (id starts with `builtin:`) or another DB template that has been promoted
 * with `is_starter = true`. Block ids and link_ids are regenerated so the
 * cloned template has its own click-attribution identity.
 */
export async function cloneStarter(starterId: string): Promise<ActionState> {
  const profile = await requireRole('editor');
  const supabase = createServiceClient();

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

  // Deep-clone blocks with fresh ids + button link_ids (so clicks attribute
  // to the new template, not the source).
  const freshBlocks: Block[] = sourceDoc.blocks.map((b) => {
    if (b.type === 'button') {
      const btn: ButtonBlock = { ...b, id: uid(), link_id: uid() };
      return btn;
    }
    return { ...b, id: uid() } as Block;
  });
  const doc: TemplateDocument = { ...sourceDoc, blocks: freshBlocks };

  const { data: inserted, error: insertErr } = await supabase
    .from('templates')
    .insert({
      name: `${sourceName} (copy)`,
      json_content: doc,
      html_content: compileTemplate(doc),
      created_by: profile.id,
      is_starter: false, // clones are not auto-starters
    })
    .select('id')
    .single();

  if (insertErr) return { ok: false, error: insertErr.message };
  revalidatePath('/templates');
  return { ok: true, id: inserted.id };
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
