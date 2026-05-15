import Link from 'next/link';
import { Plus, Upload, Search } from 'lucide-react';
import { BulkSplitButton } from './_bulk-split-button';
import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import type { Contact, ContactStatus, ContactTag } from '@/types';
import { ContactsFilters } from './_filters';
import { ContactsTable } from './_contacts-table';

const PAGE_SIZE = 25;

type SortKey = 'name' | 'last_name' | 'email' | 'company' | 'created_at';
type SortDir = 'asc' | 'desc';

type Search = {
  tag?: string;
  status?: string;
  q?: string;
  page?: string;
  sort?: string;
  dir?: string;
};

const SORTABLE: ReadonlySet<SortKey> = new Set(['name', 'last_name', 'email', 'company', 'created_at']);

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

  // Sort: defaults to created_at desc (newest first). Clicking a column header
  // toggles asc/desc or switches sort key. ?sort=name&dir=asc is the canonical
  // 'A→Z by first name' selector.
  const sort: SortKey = SORTABLE.has(sp.sort as SortKey) ? (sp.sort as SortKey) : 'created_at';
  const dir: SortDir = sp.dir === 'asc' ? 'asc' : 'desc';

  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact' })
    .order(sort, { ascending: dir === 'asc', nullsFirst: false })
    .range(from, to);

  // Stable secondary sort by id so paging doesn't shuffle rows that share a value.
  if (sort !== 'created_at') {
    query = query.order('created_at', { ascending: false });
  }

  if (tag) query = query.eq('tag', tag);
  if (status) query = query.eq('status', status);
  if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,last_name.ilike.%${q}%,company.ilike.%${q}%`);

  const [{ data: contacts, count }, { data: listsRaw }] = await Promise.all([
    query,
    // Lists fed to the bulk action bar's "Add to existing list" dropdown
    supabase.from('lists').select('id, name').order('name'),
  ]);
  const total = count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const lists = (listsRaw ?? []) as Array<{ id: string; name: string }>;

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  // Precompute hrefs for every sortable column so we can hand the client
  // component a plain object (functions can't cross the server-client boundary).
  const sortHrefs: Record<SortKey, string> = {} as Record<SortKey, string>;
  for (const key of ['name', 'last_name', 'email', 'company', 'created_at'] as SortKey[]) {
    const sameKey = sort === key;
    const nextDir: SortDir = sameKey ? (dir === 'asc' ? 'desc' : 'asc') : key === 'created_at' ? 'desc' : 'asc';
    const params = new URLSearchParams({
      ...(tag ? { tag } : {}),
      ...(status ? { status } : {}),
      ...(q ? { q } : {}),
      sort: key,
      dir: nextDir,
    });
    sortHrefs[key] = `?${params.toString()}`;
  }

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
          <div className="flex items-start gap-2">
            <BulkSplitButton />
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

      {(contacts ?? []).length === 0 ? (
        <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center">
          <Search size={20} className="text-zinc-400 inline-block" />
          <p className="text-sm text-zinc-500 mt-2">
            No contacts found{q || tag || status ? ' with these filters' : ''}.
          </p>
        </div>
      ) : (
        <ContactsTable
          contacts={(contacts ?? []) as Contact[]}
          lists={lists}
          canEdit={canEdit}
          canDelete={canDelete}
          sort={sort}
          dir={dir}
          sortHrefs={sortHrefs}
        />
      )}

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
                  sort,
                  dir,
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
                  sort,
                  dir,
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

