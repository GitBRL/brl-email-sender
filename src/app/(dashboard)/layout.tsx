import { Suspense } from 'react';
import { requireProfile } from '@/lib/auth';
import { Sidebar } from './_sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Middleware already gated unauth'd users. Use requireProfile to sign-out + redirect
  // any auth'd user that has no profile row (prevents redirect loops).
  const profile = await requireProfile();

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
        />
      </Suspense>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
