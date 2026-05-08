import { redirect } from 'next/navigation';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Profile, UserRole } from '@/types';

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Bypass RLS for this internal lookup. Safe: we just verified the user via the cookie session
  // and only read the row keyed to that verified user.id.
  const admin = createServiceClient();
  const { data, error } = await admin
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.error('[auth] profile lookup failed:', error.message);
    return null;
  }
  return (data as Profile) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    // Authenticated but no profile (or no user) — sign out to break any redirect loop.
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect('/login?error=profile_missing');
  }
  return profile;
}

const RANK: Record<UserRole, number> = { admin: 3, editor: 2, viewer: 1 };

export function hasAtLeast(role: UserRole, minimum: UserRole) {
  return RANK[role] >= RANK[minimum];
}

export async function requireRole(minimum: UserRole): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasAtLeast(profile.role, minimum)) {
    redirect('/?error=forbidden');
  }
  return profile;
}
