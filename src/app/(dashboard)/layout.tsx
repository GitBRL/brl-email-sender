import { Suspense } from 'react';
import { requireProfile } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { Sidebar } from './_sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Middleware already gated unauth'd users. Use requireProfile to sign-out + redirect
  // any auth'd user that has no profile row (prevents redirect loops).
  const profile = await requireProfile();

  // Fetch the BRL master logo (from the seeded 'brl' brand kit) to render in
  // the sidebar header. Falls back to a text wordmark when not yet uploaded
  // (Settings → Brand Kits → BRL Educação → Logo padrão).
  const supabase = createServiceClient();
  const { data: brlKit } = await supabase
    .from('brand_kits')
    .select('logo_url')
    .eq('slug', 'brl')
    .maybeSingle();

  return (
    <div className="min-h-screen flex bg-brl-bg text-brl-dark">
      {/* Sidebar is a client component so it can read ?embedded=1 and hide
          itself when the editor is iframed inside the campaign wizard.
          Suspense is required because useSearchParams() suspends. */}
      <Suspense fallback={null}>
        <Sidebar
          profileName={profile.name}
          profileEmail={profile.email}
          profileRole={profile.role}
          brandLogoUrl={brlKit?.logo_url ?? null}
        />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
