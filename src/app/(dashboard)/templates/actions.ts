'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { compileTemplate } from '@/lib/compile-template';
import { DEFAULT_DOCUMENT, uid, type TemplateDocument, type Block, type ButtonBlock } from '@/lib/blocks';
import { findStarter } from '@/lib/starter-templates';
import { defaultDocForKit, type BrandKit } from '@/lib/brand-kits';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB (matches storage bucket cap)
const ALLOWED_IMAGE_MIMES = new Set([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

export type ActionState = { ok: boolean; error?: string; id?: string };

const CreateTemplateInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  brand_kit_id: z.string().uuid().optional().or(z.literal('')).transform((v) => v || null),
});

function fd(form: FormData) {
  const o: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) o[k] = v;
  return o;
}

export async function createTemplate(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const profile = await requireRole('editor');
  const parsed = CreateTemplateInput.safeParse(fd(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();

  // If a brand kit is selected, pre-populate the document with kit-themed blocks
  // (header / hero / body / CTA / divider / footer). Otherwise fall back to empty.
  let doc = DEFAULT_DOCUMENT;
  if (parsed.data.brand_kit_id) {
    const { data: kit } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('id', parsed.data.brand_kit_id)
      .maybeSingle<BrandKit>();
    if (kit) doc = defaultDocForKit(kit);
  }

  const { data, error } = await supabase
    .from('templates')
    .insert({
      name: parsed.data.name,
      json_content: doc,
      html_content: compileTemplate(doc),
      created_by: profile.id,
      brand_kit_id: parsed.data.brand_kit_id,
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

/**
 * Upload an image from the editor to the `email-images` storage bucket and
 * return its public URL. The editor's ImageUploader calls this when the user
 * picks a file, then stuffs the returned URL into block.src — so editors
 * never have to know what a URL is, let alone an HTML tag.
 *
 * Returns { ok, url, error } so the calling client can render a friendly
 * inline error without throwing.
 */
export async function uploadEmailImage(formData: FormData): Promise<{ ok: boolean; url?: string; error?: string }> {
  await requireRole('editor');

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Nenhum arquivo recebido.' };
  if (file.size === 0) return { ok: false, error: 'Arquivo vazio.' };
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `Imagem muito grande (máx ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB).`,
    };
  }
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return {
      ok: false,
      error: `Tipo de arquivo não suportado (${file.type || 'desconhecido'}). Use PNG, JPEG, SVG, WebP ou GIF.`,
    };
  }

  // Path: `<yyyy-mm>/<uuid>.<ext>` keeps things tidy in the bucket and lets
  // us scope monthly cleanup later if needed.
  const ext = (() => {
    switch (file.type) {
      case 'image/png': return 'png';
      case 'image/svg+xml': return 'svg';
      case 'image/jpeg': return 'jpg';
      case 'image/webp': return 'webp';
      case 'image/gif': return 'gif';
      default: return file.name.split('.').pop() ?? 'bin';
    }
  })();
  const today = new Date();
  const folder = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const path = `${folder}/${uid()}.${ext}`;

  const supabase = createServiceClient();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from('email-images')
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: `Upload falhou: ${upErr.message}` };

  const { data: pub } = supabase.storage.from('email-images').getPublicUrl(path);
  return { ok: true, url: pub.publicUrl };
}
