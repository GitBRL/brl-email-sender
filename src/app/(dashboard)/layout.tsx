import Link from 'next/link';
import { BarChart3, Users, ListChecks, Mail, FileText, Settings, LogOut } from 'lucide-react';
import { requireProfile } from '@/lib/auth';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Middleware already gated unauth'd users. Use requireProfile to sign-out + redirect
  // any auth'd user that has no profile row (prevents redirect loops).
  const profile = await requireProfile();

  return (
    <div className="min-h-screen flex bg-brl-bg text-brl-dark">
      <aside className="w-60 bg-brl-dark text-zinc-100 flex flex-col">
        <div className="px-5 pt-6 pb-8">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-brl-yellow" />
            <span className="font-semibold tracking-tight">BRL Email</span>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1 text-sm">
          <NavLink href="/dashboard" icon={<BarChart3 size={16} />}>Dashboard</NavLink>
          <NavLink href="/contacts"  icon={<Users size={16} />}>Contacts</NavLink>
          <NavLink href="/lists"     icon={<ListChecks size={16} />}>Lists</NavLink>
          <NavLink href="/campaigns" icon={<Mail size={16} />}>Campaigns</NavLink>
          <NavLink href="/templates" icon={<FileText size={16} />}>Templates</NavLink>
          <NavLink href="/settings"  icon={<Settings size={16} />}>Settings</NavLink>
        </nav>
        <div className="px-4 py-4 border-t border-white/10">
          <div className="text-xs text-zinc-300 truncate" title={profile.email}>
            {profile.name ?? profile.email}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-zinc-400">
            {profile.role}
          </div>
          <form action="/auth/signout" method="post" className="mt-3">
            <button className="text-xs text-zinc-300 hover:text-brl-yellow inline-flex items-center gap-1">
              <LogOut size={12} /> Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {!profile?.role || profile.role === 'viewer' ? null : null}
        {children}
      </main>
    </div>
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
