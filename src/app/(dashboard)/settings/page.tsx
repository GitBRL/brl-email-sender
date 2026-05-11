import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { FROM_EMAIL, FROM_NAME, APP_URL } from '@/lib/resend';
import type { BrandKit } from '@/lib/brand-kits';
import { RoleSelect } from './_role-select';
import { InviteForm } from './_invite-form';
import { RemoveMemberButton } from './_remove-button';
import { DefaultsForm, type AppSettingsRow } from './_defaults-form';
import { BrandKitsSection } from './_brand-kits-section';

type ProfileRow = {
  id: string;
  email: string;
  name: string | null;
  role: 'admin' | 'editor' | 'viewer';
  created_at: string;
};

const ROLE_DESCRIPTIONS = {
  admin: 'Full access — manage users, delete data, send campaigns',
  editor: 'Create + send campaigns, manage contacts, lists & templates',
  viewer: 'Read-only access to all data — cannot send or modify',
} as const;

export default async function SettingsPage() {
  const profile = await requireProfile();
  const isAdmin = profile.role === 'admin';
  const supabase = createServiceClient();

  // Fetch team members + app settings + brand kits in parallel
  const [profilesRes, settingsRes, kitsRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, role, created_at')
      .order('created_at', { ascending: true }),
    supabase
      .from('app_settings')
      .select('from_name, from_email, reply_to, unsub_heading, unsub_body')
      .eq('id', true)
      .maybeSingle<AppSettingsRow>(),
    supabase
      .from('brand_kits')
      .select('*')
      .order('is_custom')
      .order('name'),
  ]);

  const members = (profilesRes.data ?? []) as ProfileRow[];
  const kits = (kitsRes.data ?? []) as BrandKit[];
  const settings: AppSettingsRow = settingsRes.data ?? {
    from_name: null,
    from_email: null,
    reply_to: null,
    unsub_heading: null,
    unsub_body: null,
  };

  const fromDomain = FROM_EMAIL.split('@')[1] ?? '—';
  const hasWebhookSecret = !!process.env.RESEND_WEBHOOK_SECRET;
  const effectiveFromName = settings.from_name ?? FROM_NAME;
  const effectiveFromEmail = settings.from_email ?? FROM_EMAIL;

  return (
    <div className="p-8 max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Manage your team, sending identity, and integrations.
        </p>
      </header>

      {/* Account */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Your account
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <Field label="Name" value={profile.name ?? '—'} />
          <Field label="Email" value={profile.email} />
          <Field label="Role" value={profile.role} highlight />
        </dl>
      </section>

      {/* Team members */}
      <section className="bg-white rounded-lg border border-zinc-200">
        <div className="flex items-baseline justify-between p-6 pb-3">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Team members
            </h2>
            <p className="text-xs text-zinc-500 mt-1">
              {members.length} member{members.length === 1 ? '' : 's'}.{' '}
              {!isAdmin && '(Admins can change roles + invite.)'}
            </p>
          </div>
        </div>
        <ul className="divide-y divide-zinc-100">
          {members.map((m) => (
            <li key={m.id} className="px-6 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{m.name ?? m.email}</div>
                {m.name && (
                  <div className="text-xs text-zinc-500 truncate">{m.email}</div>
                )}
                <div className="text-[10px] text-zinc-400 mt-0.5">
                  Joined {new Date(m.created_at).toLocaleDateString('pt-BR')}
                  {m.id === profile.id && (
                    <span className="ml-2 text-brl-orange font-medium">(you)</span>
                  )}
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                {isAdmin ? (
                  <>
                    <RoleSelect
                      userId={m.id}
                      currentRole={m.role}
                      isSelf={m.id === profile.id}
                    />
                    {m.id !== profile.id && (
                      <RemoveMemberButton userId={m.id} label={m.name ?? m.email} />
                    )}
                  </>
                ) : (
                  <span className="text-xs uppercase tracking-wide font-medium px-2 py-1 rounded-full bg-zinc-100 text-zinc-700">
                    {m.role}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="border-t border-zinc-100 px-6 py-4 bg-zinc-50/50">
            <h3 className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-3">
              Invite a teammate
            </h3>
            <InviteForm />
            <p className="text-[10px] text-zinc-500 mt-2">
              They&apos;ll receive an email with a link to set their password and sign in.
            </p>
          </div>
        )}
      </section>

      {/* Role guide */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Role permissions
        </h2>
        <dl className="space-y-2 text-sm">
          {(['admin', 'editor', 'viewer'] as const).map((r) => (
            <div key={r} className="flex gap-3">
              <dt
                className={`shrink-0 inline-flex items-center justify-center min-w-[60px] px-2 py-0.5 rounded-full text-[10px] uppercase font-medium tracking-wide ${
                  r === 'admin'
                    ? 'bg-red-50 text-red-700'
                    : r === 'editor'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-zinc-100 text-zinc-700'
                }`}
              >
                {r}
              </dt>
              <dd className="text-zinc-600">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Sending defaults — editable by admins */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Sending defaults &amp; unsubscribe page
          </h2>
          <span className="text-xs text-zinc-500">
            Effective: <span className="font-mono">{effectiveFromName} &lt;{effectiveFromEmail}&gt;</span>
          </span>
        </div>
        {isAdmin ? (
          <DefaultsForm current={settings} envFromName={FROM_NAME} envFromEmail={FROM_EMAIL} />
        ) : (
          <p className="text-sm text-zinc-500 italic">
            Only admins can change sending defaults.
          </p>
        )}
      </section>

      {/* Brand kits */}
      <BrandKitsSection
        kits={kits}
        canEdit={isAdmin || profile.role === 'editor'}
        canDelete={isAdmin}
      />

      {/* Integrations status — read-only */}
      <section className="bg-white rounded-lg border border-zinc-200 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">
          Integrations &amp; environment
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-4">
          <Field label="Sending domain" value={fromDomain} mono />
          <Field label="App URL" value={APP_URL} mono />
        </dl>
        <ul className="space-y-3 text-sm">
          <IntegrationRow
            name="Resend"
            description="Transactional email API"
            ok={true}
            note="API key configured via env var"
          />
          <IntegrationRow
            name="Resend webhook"
            description="Delivery / bounce / complaint events"
            ok={hasWebhookSecret}
            note={
              hasWebhookSecret
                ? 'Signing secret present — incoming requests are verified'
                : 'No RESEND_WEBHOOK_SECRET set — events accepted without verification'
            }
          />
          <IntegrationRow
            name="Supabase"
            description="Authentication + database"
            ok={true}
            note="Connected"
          />
        </ul>
        <p className="text-xs text-zinc-500 mt-4">
          Sensitive credentials (API keys, signing secrets) live in Netlify environment
          variables, not in the database. Rotate by updating them in Netlify → Site
          configuration → Environment variables and triggering a redeploy.
        </p>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd
        className={`mt-0.5 ${highlight ? 'font-semibold' : ''} ${mono ? 'font-mono text-xs' : 'text-sm'} text-zinc-800 truncate`}
      >
        {value}
      </dd>
    </div>
  );
}

function IntegrationRow({
  name,
  description,
  ok,
  note,
}: {
  name: string;
  description: string;
  ok: boolean;
  note: string;
}) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{name}</div>
        <div className="text-xs text-zinc-500">{description}</div>
      </div>
      <div className="text-xs text-zinc-500 max-w-xs text-right">{note}</div>
    </li>
  );
}
