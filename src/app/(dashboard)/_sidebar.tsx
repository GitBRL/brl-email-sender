'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BarChart3, Users, ListChecks, Mail, FileText, Settings, LogOut } from 'lucide-react';

/**
 * Dashboard sidebar — hides itself when the page is loaded with ?embedded=1
 * (used when the editor is iframed inside the campaign wizard, where we
 * already have the wizard chrome around it).
 *
 * `brandLogoUrl` is the BRL Educação master logo, fetched by the layout
 * from the brl brand_kit row. Falls back to a text wordmark when absent
 * (e.g. before the user has uploaded it via Settings → Brand Kits).
 */
export function Sidebar({
  profileName,
  profileEmail,
  profileRole,
  brandLogoUrl,
}: {
  profileName: string | null;
  profileEmail: string;
  profileRole: string;
  brandLogoUrl: string | null;
}) {
  const sp = useSearchParams();
  const embedded = sp.get('embedded') === '1' || sp.get('embedded') === 'true';
  if (embedded) return null;

  return (
    <aside className="w-60 bg-brl-dark text-zinc-100 flex flex-col">
      <div className="px-5 pt-6 pb-8">
        <Link href="/campaigns" className="block">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={brandLogoUrl}
              alt="BRL Educação"
              className="max-h-10 max-w-full object-contain object-left"
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-brl-yellow" />
              <span className="font-semibold tracking-tight">BRL Educação</span>
            </div>
          )}
        </Link>
      </div>
      <nav className="flex-1 px-3 space-y-1 text-sm">
        <NavLink href="/campaigns" icon={<Mail size={16} />}>Campaigns</NavLink>
        <NavLink href="/dashboard" icon={<BarChart3 size={16} />}>Dashboard</NavLink>
        <NavLink href="/contacts"  icon={<Users size={16} />}>Contacts</NavLink>
        <NavLink href="/lists"     icon={<ListChecks size={16} />}>Lists</NavLink>
        <NavLink href="/templates" icon={<FileText size={16} />}>Templates</NavLink>
        <NavLink href="/settings"  icon={<Settings size={16} />}>Settings</NavLink>
      </nav>
      <div className="px-4 py-4 border-t border-white/10">
        <div className="text-xs text-zinc-300 truncate" title={profileEmail}>
          {profileName ?? profileEmail}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-400">{profileRole}</div>
        <form action="/auth/signout" method="post" className="mt-3">
          <button className="text-xs text-zinc-300 hover:text-brl-yellow inline-flex items-center gap-1">
            <LogOut size={12} /> Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-zinc-200 hover:text-white hover:bg-white/5 transition"
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
