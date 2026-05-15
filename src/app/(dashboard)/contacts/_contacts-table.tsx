'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, ArrowUpDown, Trash2, FolderPlus, ListPlus, X } from 'lucide-react';
import { TagSelect } from '@/components/tag-select';
import { StatusBadge } from '@/components/status-badge';
import type { Contact } from '@/types';
import { DeleteContactButton } from './_delete-button';
import {
  bulkDeleteContacts,
  addContactsToExistingList,
  createListAndAssignContacts,
} from './actions';

type SortKey = 'name' | 'last_name' | 'email' | 'company' | 'created_at';
type SortDir = 'asc' | 'desc';
type ListLite = { id: string; name: string };

/**
 * Wraps the contacts table with row selection + a sticky bottom action bar
 * that surfaces 'Add to existing list', 'Create new list with selected', and
 * 'Delete selected' once at least one row is checked.
 *
 * Selection lives only in component state — it doesn't persist across pages
 * or sort/filter changes (clearing avoids confusing 'silently selected on
 * other page' bugs). The header checkbox toggles every visible row.
 */
export function ContactsTable({
  contacts,
  lists,
  canEdit,
  canDelete,
  sort,
  dir,
  sortHrefs,
}: {
  contacts: Contact[];
  lists: ListLite[];
  canEdit: boolean;
  canDelete: boolean;
  sort: SortKey;
  dir: SortDir;
  /** Precomputed `?...` hrefs per column. Server-rendered into a plain object
   *  because functions can't cross the server-client boundary. */
  sortHrefs: Record<SortKey, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');

  const allSelected = contacts.length > 0 && selected.size === contacts.length;
  const someSelected = selected.size > 0 && !allSelected;

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(contacts.map((c) => c.id)));
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
    setError(null);
    setInfo(null);
    setShowCreateList(false);
    setNewListName('');
  }

  function handleDelete() {
    const ids = Array.from(selected);
    if (
      !confirm(
        `Excluir ${ids.length} contato${ids.length === 1 ? '' : 's'}? Esta ação não pode ser desfeita.`,
      )
    )
      return;
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await bulkDeleteContacts(ids);
      if (!res.ok) {
        setError(res.error ?? 'Falha ao excluir.');
        return;
      }
      setInfo(`${res.deleted} contato${res.deleted === 1 ? '' : 's'} excluído${res.deleted === 1 ? '' : 's'}.`);
      clearSelection();
      router.refresh();
    });
  }

  function handleAssignToExisting(listId: string) {
    const ids = Array.from(selected);
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await addContactsToExistingList(listId, ids);
      if (!res.ok) {
        setError(res.error ?? 'Falha ao adicionar à lista.');
        return;
      }
      const listName = lists.find((l) => l.id === listId)?.name ?? 'lista';
      setInfo(`${res.assigned ?? 0} contato(s) adicionados a "${listName}".`);
      clearSelection();
      router.refresh();
    });
  }

  function handleCreateList() {
    const name = newListName.trim();
    const ids = Array.from(selected);
    if (!name) {
      setError('Digite um nome para a nova lista.');
      return;
    }
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await createListAndAssignContacts(name, ids);
      if (!res.ok) {
        setError(res.error ?? 'Falha ao criar lista.');
        return;
      }
      setInfo(`Lista "${name}" criada com ${res.assigned ?? 0} contato(s).`);
      clearSelection();
      router.refresh();
    });
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        {contacts.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">No contacts.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-zinc-500 uppercase tracking-wide bg-zinc-50">
                <tr>
                  {canEdit && (
                    <th className="px-3 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        ref={(el) => { if (el) el.indeterminate = someSelected; }}
                        onChange={toggleAll}
                        aria-label={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                        className="accent-brl-yellow cursor-pointer"
                      />
                    </th>
                  )}
                  <SortHeader label="Email"     active={sort === 'email'}      dir={dir} href={sortHrefs['email']} />
                  <SortHeader label="Name"      active={sort === 'name'}       dir={dir} href={sortHrefs['name']} />
                  <SortHeader label="Last name" active={sort === 'last_name'}  dir={dir} href={sortHrefs['last_name']} />
                  <SortHeader label="Company"   active={sort === 'company'}    dir={dir} href={sortHrefs['company']} />
                  <th className="text-left font-medium px-4 py-3">Tag</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                  <SortHeader label="Added"     active={sort === 'created_at'} dir={dir} href={sortHrefs['created_at']} />
                  <th className="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {contacts.map((c) => {
                  const isSelected = selected.has(c.id);
                  return (
                    <tr key={c.id} className={isSelected ? 'bg-brl-yellow/10' : 'hover:bg-zinc-50'}>
                      {canEdit && (
                        <td className="px-3 py-3 align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(c.id)}
                            aria-label={`Selecionar ${c.email}`}
                            className="accent-brl-yellow cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${c.id}`} className="text-brl-dark hover:underline font-medium">
                          {c.email}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{c.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-700">{c.last_name ?? '—'}</td>
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
                          <Link href={`/contacts/${c.id}`} className="text-xs text-zinc-600 hover:text-brl-dark">
                            View
                          </Link>
                          {canEdit && (
                            <Link href={`/contacts/${c.id}/edit`} className="text-xs text-zinc-600 hover:text-brl-dark">
                              Edit
                            </Link>
                          )}
                          {canDelete && <DeleteContactButton id={c.id} email={c.email} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky action bar — appears when at least one row is selected */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-60 right-0 z-40 px-6 py-3 bg-brl-dark text-white shadow-lg border-t border-black/20">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">
              {selected.size} contato{selected.size === 1 ? '' : 's'} selecionado{selected.size === 1 ? '' : 's'}
            </span>

            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-zinc-300 hover:text-white inline-flex items-center gap-1 underline-offset-2 hover:underline"
            >
              <X size={12} /> Limpar seleção
            </button>

            <span className="flex-1" />

            {/* Add to existing list — inline select */}
            {lists.length > 0 && (
              <div className="inline-flex items-center gap-1.5">
                <FolderPlus size={14} className="text-zinc-400" />
                <select
                  defaultValue=""
                  disabled={pending}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAssignToExisting(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="rounded-md bg-white text-brl-dark text-xs px-2 py-1.5 border border-zinc-300 max-w-[180px] truncate"
                >
                  <option value="">Adicionar a lista existente…</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Create new list */}
            {showCreateList ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleCreateList();
                }}
                className="inline-flex items-center gap-1.5"
              >
                <input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="Nome da nova lista"
                  autoFocus
                  className="rounded-md bg-white text-brl-dark text-xs px-2 py-1.5 border border-zinc-300 w-48"
                />
                <button
                  type="submit"
                  disabled={pending || !newListName.trim()}
                  className="rounded-md bg-brl-yellow text-brl-dark text-xs font-semibold px-3 py-1.5 hover:bg-brl-yellow-hover disabled:opacity-50"
                >
                  Criar
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateList(false)}
                  className="text-xs text-zinc-300 hover:text-white px-1"
                >
                  cancelar
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowCreateList(true)}
                disabled={pending}
                className="rounded-md bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ListPlus size={13} /> Criar nova lista com selecionados
              </button>
            )}

            {/* Delete */}
            {canDelete && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 size={13} /> Excluir
              </button>
            )}
          </div>
          {(error || info) && (
            <div className="max-w-7xl mx-auto mt-2 text-xs">
              {error && <span className="text-red-300">{error}</span>}
              {info && <span className="text-emerald-300">{info}</span>}
            </div>
          )}
          {/* Bottom spacer so the bar doesn't cover the last row */}
        </div>
      )}
      {/* When the bar is visible, leave space below the table so the last
          row isn't permanently hidden behind it. */}
      {selected.size > 0 && <div aria-hidden className="h-20" />}
    </>
  );
}

function SortHeader({
  label,
  active,
  dir,
  href,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  href: string;
}) {
  return (
    <th className="text-left font-medium px-4 py-3">
      <Link
        href={href}
        className={`inline-flex items-center gap-1 hover:text-brl-dark transition ${
          active ? 'text-brl-dark' : 'text-zinc-500'
        }`}
      >
        {label}
        {active ? (
          dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        ) : (
          <ArrowUpDown size={11} className="opacity-30" />
        )}
      </Link>
    </th>
  );
}
