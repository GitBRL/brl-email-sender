'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';

export type ActionState = { ok: boolean; error?: string; id?: string; url?: string };

// ---- Validation ----------------------------------------------------------

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB hex');

const KitInput = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers, hyphens only'),
  color_primary: Hex,
  color_secondary: Hex,
  color_background: Hex,
  color_text: Hex,
  color_header_bg: Hex,
  color_cta_bg: Hex,
  color_cta_text: Hex,
  color_footer_bg: Hex,
  color_footer_text: Hex,
  logo_url: z.string().url().nullable().or(z.literal('')).transform((v) => v || null),
  logo_dark_url: z.string().url().nullable().or(z.literal('')).transform((v) => v || null),
});

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5MB (matches storage bucket cap)
const ALLOWED_MIMES = new Set(['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']);

// ---- CRUD ----------------------------------------------------------------

export async function updateBrandKit(id: string, patch: Record<string, unknown>): Promise<ActionState> {
  await requireRole('editor');
  const parsed = KitInput.partial().safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();
  const { error } = await supabase.from('brand_kits').update(parsed.data).eq('id', id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

export async function createCustomKit(input: unknown): Promise<ActionState> {
  await requireRole('editor');
  const parsed = KitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  const supabase = createServiceClient();
  // Check for slug collision and return a friendly message rather than the raw PG error.
  const { data: existing } = await supabase
    .from('brand_kits')
    .select('id')
    .eq('slug', parsed.data.slug)
    .maybeSingle();
  if (existing) return { ok: false, error: `Slug "${parsed.data.slug}" already used by another kit.` };

  const { data, error } = await supabase
    .from('brand_kits')
    .insert({ ...parsed.data, is_custom: true })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true, id: data.id };
}

export async function deleteBrandKit(id: string): Promise<ActionState> {
  await requireRole('admin');
  const supabase = createServiceClient();

  // Refuse to delete a kit that's still referenced by campaigns/templates —
  // the FK constraint would error anyway, but the upfront check produces a
  // friendlier message than the raw constraint name.
  const [{ count: campaignCount }, { count: templateCount }, { data: kit }] = await Promise.all([
    supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('brand_kit_id', id),
    supabase.from('templates').select('*', { count: 'exact', head: true }).eq('brand_kit_id', id),
    supabase.from('brand_kits').select('is_custom').eq('id', id).maybeSingle(),
  ]);
  if (!kit) return { ok: false, error: 'Kit not found.' };
  if (!kit.is_custom) return { ok: false, error: 'Default kits cannot be deleted (only custom ones).' };
  if ((campaignCount ?? 0) > 0 || (templateCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Kit is in use by ${(campaignCount ?? 0)} campaign(s) and ${(templateCount ?? 0)} template(s). Reassign them first.`,
    };
  }

  const { error } = await supabase.from('brand_kits').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}

// ---- Logo upload ---------------------------------------------------------

/**
 * Upload a logo image to the `brand-assets` storage bucket and patch the
 * brand kit row with the resulting public URL. `kind` selects which field
 * gets updated (`logo_url` for the standard logo, `logo_dark_url` for the
 * darker variant used on light footers).
 */
export async function uploadKitLogo(formData: FormData): Promise<ActionState> {
  await requireRole('editor');

  const kitId = String(formData.get('kit_id') ?? '');
  const kindRaw = String(formData.get('kind') ?? 'logo_url');
  const kind: 'logo_url' | 'logo_dark_url' =
    kindRaw === 'logo_dark_url' ? 'logo_dark_url' : 'logo_url';
  const file = formData.get('file');

  if (!kitId) return { ok: false, error: 'Missing kit id.' };
  if (!(file instanceof File)) return { ok: false, error: 'No file received.' };
  if (file.size === 0) return { ok: false, error: 'File is empty.' };
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: `File too large (max ${Math.round(MAX_LOGO_BYTES / 1024 / 1024)}MB).` };
  }
  if (!ALLOWED_MIMES.has(file.type)) {
    return { ok: false, error: `Unsupported file type (${file.type || 'unknown'}). Use PNG, SVG, JPEG or WebP.` };
  }

  const supabase = createServiceClient();
  const { data: kit } = await supabase
    .from('brand_kits')
    .select('slug')
    .eq('id', kitId)
    .maybeSingle();
  if (!kit) return { ok: false, error: 'Kit not found.' };

  // Compose a deterministic-but-unique path: `{slug}/{kind}-{timestamp}.{ext}`.
  // Adding the timestamp avoids the public URL being cached forever after
  // a re-upload — each fresh upload gets a different URL.
  const ext = extFromMime(file.type) ?? (file.name.split('.').pop() ?? 'bin');
  const path = `${kit.slug}/${kind === 'logo_dark_url' ? 'dark' : 'logo'}-${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from('brand-assets')
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data: pub } = supabase.storage.from('brand-assets').getPublicUrl(path);
  const publicUrl = pub.publicUrl;

  const { error: updErr } = await supabase
    .from('brand_kits')
    .update({ [kind]: publicUrl })
    .eq('id', kitId);
  if (updErr) return { ok: false, error: `Saved file but failed to update kit: ${updErr.message}` };

  revalidatePath('/settings');
  return { ok: true, url: publicUrl };
}

function extFromMime(mime: string): string | null {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/svg+xml': return 'svg';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    default: return null;
  }
}
