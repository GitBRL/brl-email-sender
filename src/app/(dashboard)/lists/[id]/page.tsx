import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Users, Upload } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { TagBadge } from '@/components/tag-badge';
import { StatusBadge } from '@/components/status-badge';
import type { Contact, ContactList } from '@/types';
import { AddContactsToList } from './_add-contacts';
import { RemoveFromList } from './_remove';
import { ListHeader } from './_header';

export default async function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: list } = await supabase
    .from('list_counts')
    .select('*')
    .eq('id', id)
    .maybeSingle<ContactList>();
  if (!list) notFound();

  // Members of this list
  const { data: members } = await supabase
    .from('contacts')
    .select('*')
    .contains('lists', [id])
    .order('created_at', { ascending: false });

  // Non-members for the picker (limit for performance)
  const memberIds = new Set((members ?? []).map((m) => m.id));
  const { data: nonMembers } = await supabase
    .from('contacts')
    .select('id, email, name, tag, status')
    .order('created_at', { ascending: false })
    .limit(500);
  const eligible = (nonMembers ?? []).filter((c) => !memberIds.has(c.id));

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  // Tag suggestions for the inline edit form (every tag used across all lists)
  const { data: allTagsRows } = await supabase.from('lists').select('tags');
  const tagSet = new Set<string>();
  for (const r of (allTagsRows ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of r.tags ?? []) tagSet.add(t);
  }
  const tagSuggestions = Array.from(tagSet).sort();

  return (
    <div className="p-8 max-w-5xl">
      <Link href="/lists" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to lists
      </Link>

      <ListHeader list={list} canEdit={canEdit} canDelete={canDelete} tagSuggestions={tagSuggestions} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500">Subscribed</div>
          <div className="text-2xl font-bold mt-1">{list.contact_count}</div>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500">Total members</div>
          <div className="text-2xl font-bold mt-1">{members?.length ?? 0}</div>
        </div>
        <div className="bg-white rounded-lg border border-zinc-200 p-5">
          <div className="text-xs text-zinc-500">Created</div>
          <div className="text-sm mt-1">
            {new Date(list.created_at).toLocaleDateString('pt-BR')}
          </div>
        </div>
      </div>

      {canEdit && (
        <div className="mb-6 flex flex-wrap items-center gap-3 bg-white rounded-lg border border-zinc-200 p-4">
          <Link
            href={`/contacts/import?list=${list.id}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-2 text-sm hover:bg-brl-yellow-hover"
          >
            <Upload size={14} /> Importar contatos para esta lista
          </Link>
          <span className="text-xs text-zinc-500">
            Sobe um CSV — todos os contatos vão direto pra lista <strong>{list.name}</strong>.
          </span>
        </div>
      )}

      {canEdit && eligible.length > 0 && (
        <div className="mb-6">
          <AddContactsToList listId={list.id} eligible={eligible} />
        </div>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Members ({members?.length ?? 0})
        </h2>
        <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
          {!members || members.length === 0 ? (
            <div className="p-12 text-center">
              <Users size={20} className="text-zinc-400 inline-block" />
              <p className="text-sm text-zinc-500 mt-2">No contacts in this list yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-zinc-500 uppercase tracking-wide bg-zinc-50">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Email</th>
                    <th className="text-left font-medium px-4 py-3">Name</th>
                    <th className="text-left font-medium px-4 py-3">Tag</th>
                    <th className="text-left font-medium px-4 py-3">Status</th>
                    <th className="text-right font-medium px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {(members as Contact[]).map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="font-medium hover:underline">
                          {c.email}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{c.name ?? '—'}</td>
                      <td className="px-4 py-3"><TagBadge tag={c.tag} /></td>
                      <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                      <td className="px-4 py-3 text-right">
                        {canEdit && <RemoveFromList listId={list.id} contactId={c.id} email={c.email} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
