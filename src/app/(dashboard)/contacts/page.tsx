import Link from 'next/link';
import { Plus, Upload, Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { TagSelect } from '@/components/tag-select';
import { StatusBadge } from '@/components/status-badge';
import type { Contact, ContactStatus, ContactTag } from '@/types';
import { ContactsFilters } from './_filters';
import { DeleteContactButton } from './_delete-button';

const PAGE_SIZE = 25;

type Search = {
  tag?: string;
  status?: string;
  q?: string;
  page?: string;
};

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const profile = await requireProfile();
  const sp = await searchParams;
  const supabase = await createClient();

  const tag = (['hot', 'warm', 'cold'] as ContactTag[]).includes(sp.tag as ContactTag)
    ? (sp.tag as ContactTag)
    : null;
  const status = (['subscribed', 'unsubscribed', 'bounced'] as ContactStatus[]).includes(
    sp.status as ContactStatus,
  )
    ? (sp.status as ContactStatus)
    : null;
  const q = (sp.q ?? '').trim();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (tag) query = query.eq('tag', tag);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,company.ilike.%${q}%`);

  const { data: contacts, count } = await query;
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canEdit = profile.role === 'admin' || profile.role === 'editor';

  return (
    <div className="p-8 max-w-7xl">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-zinc-500 mt-1">
            {total.toLocaleString('pt-BR')} {total === 1 ? 'contact' : 'contacts'}
          </p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Link
              href="/contacts/import"
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              <Upload size={14} /> Import CSV
            </Link>
            <Link
              href="/contacts/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover"
            >
              <Plus size={14} /> Add contact
            </Link>
          </div>
        )}
      </header>

      <ContactsFilters tag={tag} status={status} q={q} />

      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        {(contacts ?? []).length === 0 ? (
          <div className="p-12 text-center">
            <Search size={20} className="text-zinc-400 inline-block" />
            <p className="text-sm text-zinc-500 mt-2">
              No contacts found{q || tag || status ? ' with these filters' : ''}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 uppercase tracking-wide bg-zinc-50">
                <tr>
                  <th className="text-left font-medium px-4 py-3">Email</th>
                  <th className="text-left font-medium px-4 py-3">Name</th>
                  <th className="text-left font-medium px-4 py-3">Company</th>
                  <th className="text-left font-medium px-4 py-3">Tag</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <th className="text-left font-medium px-4 py-3">Added</th>
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {(contacts as Contact[]).map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${c.id}`} className="text-brl-dark hover:underline font-medium">
                        {c.email}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{c.name ?? '—'}</td>
                    <td className="px-4 py-3 text-zinc-700">{c.company ?? '—'}</td>
                    <td className="px-4 py-3">
                      {canEdit ? <TagSelect contactId={c.id} value={c.tag} /> : <span>{c.tag}</span>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(c.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/contacts/${c.id}`}
                          className="text-xs text-zinc-600 hover:text-brl-dark"
                        >
                          View
                        </Link>
                        {canEdit && (
                          <Link
                            href={`/contacts/${c.id}/edit`}
                            className="text-xs text-zinc-600 hover:text-brl-dark"
                          >
                            Edit
                          </Link>
                        )}
                        {profile.role === 'admin' && (
                          <DeleteContactButton id={c.id} email={c.email} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <span className="text-zinc-500">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?${new URLSearchParams({
                  ...(tag ? { tag } : {}),
                  ...(status ? { status } : {}),
                  ...(q ? { q } : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
              >
                ← Previous
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`?${new URLSearchParams({
                  ...(tag ? { tag } : {}),
                  ...(status ? { status } : {}),
                  ...(q ? { q } : {}),
                  page: String(page + 1),
                }).toString()}`}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
