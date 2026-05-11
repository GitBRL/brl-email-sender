import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Mail, Building2, Phone, Calendar } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { TagBadge } from '@/components/tag-badge';
import { StatusBadge } from '@/components/status-badge';
import type { Contact, EmailEvent } from '@/types';

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle<Contact>();
  if (!contact) notFound();

  const { data: events } = await supabase
    .from('email_events')
    .select('*')
    .eq('contact_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  const canEdit = profile.role === 'admin' || profile.role === 'editor';

  return (
    <div className="p-8 max-w-4xl">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to contacts
      </Link>

      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">{contact.name ?? contact.email}</h1>
          <p className="text-sm text-zinc-500 mt-1">{contact.email}</p>
        </div>
        {canEdit && (
          <Link
            href={`/contacts/${contact.id}/edit`}
            className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
          >
            Edit
          </Link>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500 mb-3">Tag</div>
          <TagBadge tag={contact.tag} />
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500 mb-3">Status</div>
          <StatusBadge status={contact.status} />
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500 mb-3">Added</div>
          <div className="text-sm">{new Date(contact.created_at).toLocaleDateString('pt-BR')}</div>
        </div>
      </div>

      <section className="bg-white rounded-lg border border-zinc-200 p-6 mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-4">Details</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-3 text-sm">
          <Detail icon={<Mail size={14} />} label="Email" value={contact.email} />
          <Detail icon={<Phone size={14} />} label="Phone" value={contact.phone ?? '—'} />
          <Detail icon={<Building2 size={14} />} label="Company" value={contact.company ?? '—'} />
          <Detail
            icon={<Calendar size={14} />}
            label="Last updated"
            value={new Date(contact.updated_at).toLocaleString('pt-BR')}
          />
        </dl>
      </section>

      {contact.custom_fields && Object.keys(contact.custom_fields).length > 0 && (
        <section className="bg-white rounded-lg border border-zinc-200 p-6 mb-8">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Custom fields
            </h2>
            <span className="text-[10px] text-zinc-400">
              usable as <code className="bg-zinc-100 px-1 rounded">{'{{merge_tag}}'}</code> in campaigns
            </span>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-y-2.5 text-sm">
            {Object.entries(contact.custom_fields).map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-[11px] text-blue-700">{'{{'}{k}{'}}'}</dt>
                <dd className="text-zinc-800 truncate">{String(v ?? '')}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Activity ({events?.length ?? 0})
        </h2>
        <div className="bg-white rounded-lg border border-zinc-200">
          {!events || events.length === 0 ? (
            <p className="p-6 text-sm text-zinc-500 text-center">No events yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {(events as EmailEvent[]).map((e) => (
                <li key={e.id} className="px-4 py-3 text-sm flex items-center justify-between">
                  <div>
                    <span className="font-medium capitalize">{e.event_type}</span>
                    {e.link_url && (
                      <span className="text-zinc-500 ml-2 text-xs truncate max-w-md inline-block align-middle">
                        {e.link_url}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-500">
                    {new Date(e.created_at).toLocaleString('pt-BR')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <dt className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
        {icon} {label}
      </dt>
      <dd className="text-zinc-800 mt-0.5">{value}</dd>
    </div>
  );
}
