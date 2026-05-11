'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile, requireRole } from '@/lib/auth';
import { APP_URL } from '@/lib/resend';

const RoleSchema = z.enum(['admin', 'editor', 'viewer']);

export type ActionState = { ok: boolean; error?: string; info?: string };

/**
 * Change a user's role.
 * - Only admins can call this.
 * - An admin cannot demote themselves (prevents locking the account out).
 * - If you're removing the last admin, the action is refused.
 */
export async function changeUserRole(
  targetId: string,
  newRole: z.infer<typeof RoleSchema>,
): Promise<ActionState> {
  await requireRole('admin');
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: 'Not authenticated.' };

  const parsed = RoleSchema.safeParse(newRole);
  if (!parsed.success) return { ok: false, error: 'Invalid role.' };

  if (targetId === me.id && parsed.data !== 'admin') {
    return { ok: false, error: 'You cannot demote yourself.' };
  }

  const supabase = createServiceClient();

  // If we're removing an admin (someone else), make sure at least one remains
  if (parsed.data !== 'admin') {
    const { data: target } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', targetId)
      .maybeSingle();
    if (target?.role === 'admin') {
      const { count: adminCount } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');
      if ((adminCount ?? 0) <= 1) {
        return { ok: false, error: 'Cannot remove the last admin.' };
      }
    }
  }

  const { error } = await supabase.from('profiles').update({ role: parsed.data }).eq('id', targetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Invite a new teammate. Creates the auth user via the admin API and emails
 * them an invitation link to set their password. Defaults the new user to
 * `viewer`; admin can promote afterwards.
 */
export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole('admin');
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const name = String(formData.get('name') ?? '').trim();
  const role = String(formData.get('role') ?? 'viewer');

  const parsedEmail = z.string().email().safeParse(email);
  if (!parsedEmail.success) return { ok: false, error: 'Invalid email address.' };
  const parsedRole = RoleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: 'Invalid role.' };

  const supabase = createServiceClient();

  // Don't double-invite an existing user
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', parsedEmail.data)
    .maybeSingle();
  if (existing) return { ok: false, error: 'A user with this email already exists.' };

  // Generate invite link via Supabase admin API
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(parsedEmail.data, {
    redirectTo: `${APP_URL}/login`,
    data: name ? { name } : undefined,
  });

  if (error) return { ok: false, error: error.message };

  // Set the initial role on the freshly-created profile (handle_new_user trigger
  // creates it with the default role).
  if (data?.user?.id) {
    await supabase
      .from('profiles')
      .update({ role: parsedRole.data, name: name || null })
      .eq('id', data.user.id);
  }

  revalidatePath('/settings');
  return { ok: true, info: `Invitation sent to ${parsedEmail.data}.` };
}

/**
 * Remove a team member. Deletes the underlying auth user, which cascades to
 * the profile. Guards: cannot remove yourself; cannot remove the last admin.
 */
export async function removeMember(targetId: string): Promise<ActionState> {
  await requireRole('admin');
  const me = await getCurrentProfile();
  if (!me) return { ok: false, error: 'Not authenticated.' };
  if (me.id === targetId) return { ok: false, error: 'You cannot remove yourself.' };

  const supabase = createServiceClient();

  const { data: target } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', targetId)
    .maybeSingle();
  if (!target) return { ok: false, error: 'User not found.' };

  if (target.role === 'admin') {
    const { count: adminCount } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if ((adminCount ?? 0) <= 1) {
      return { ok: false, error: 'Cannot remove the last admin.' };
    }
  }

  // Deleting the auth user cascades to public.profiles via the FK on profiles.id
  const { error } = await supabase.auth.admin.deleteUser(targetId);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  return { ok: true };
}

/**
 * Update app-wide sending defaults and unsubscribe-page copy. Empty strings
 * are stored as null so the env-var fallback kicks in for that field.
 */
export async function updateAppSettings(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole('admin');
  const norm = (k: string) => {
    const v = String(formData.get(k) ?? '').trim();
    return v === '' ? null : v;
  };
  const supabase = createServiceClient();
  const { error } = await supabase.from('app_settings').upsert({
    id: true,
    from_name: norm('from_name'),
    from_email: norm('from_email'),
    reply_to: norm('reply_to'),
    unsub_heading: norm('unsub_heading'),
    unsub_body: norm('unsub_body'),
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true, info: 'Settings saved.' };
}
