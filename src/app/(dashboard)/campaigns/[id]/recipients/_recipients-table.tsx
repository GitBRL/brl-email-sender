'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ListPlus, Send, X } from 'lucide-react';
import { TagBadge } from '@/components/tag-badge';
import { StatusBadge } from '@/components/status-badge';
import {
  createListAndAssignContacts,
  addContactsToExistingList,
} from '@/app/(dashboard)/contacts/actions';
import { TagsInput } from '@/app/(dashboard)/lists/_tags-input';
import type { RecipientRow } from '../../actions';

type ListLite = { id: string; name: string };

/**
 * Recipient drill-down table — one row per contact in the selected funnel
 * cohort, with select-all + sticky bottom action bar identical in spirit to
 * the bulk actions on /contacts. The two cohort-specific actions are:
 *
 *   1. 'Criar nova lista com selecionados' — name + tags inline, creates
 *      the list and assigns the selection in one shot. Tags default to
 *      [campaign-name, group] so re-engagement audiences are easy to find
 *      later.
 *   2. 'Criar nova campanha' — first creates the list (same form), then
 *      redirects straight to /campaigns/new — operator picks the new list
 *      in the audience step (it's pre-named, so easy to spot).
 */
export function RecipientsTable({
  rows,
  campaignName,
  group,
  groupLabel,
  existingLists,
  tagSuggestions,
  canEdit,
}: {
  rows: RecipientRow[];
  campaignName: string;
  group: string;
  groupLabel: string;
  existingLists: ListLite[];
  tagSuggestions: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showCreatePanel, setShowCreatePanel] = useState<null | 'list' | 'campaign'>(null);
  const [newListName, setNewListName] = useState('');

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Suggest a sensible default name based on the cohort.
  const defaultListName = `${campaignName} — ${groupLabel}`;
  const suggestedTags = [
    slugify(campaignName).slice(0, 40),
    slugify(group).slice(0, 40),
  ].filter(Boolean);

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
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
    setShowCreatePanel(null);
    setNewListName('');
  }

  function openCreatePanel(mode: 'list' | 'campaign') {
    setError(null);
    setInfo(null);
    setShowCreatePanel(mode);
    setNewListName(defaultListName);
  }

  function handleAssignToExisting(listId: string) {
    const ids = Array.from(selected);
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await addContactsToExistingList(listId, ids);
      if (!res.ok) return setError(res.error ?? 'Falha ao adicionar.');
      const listName = existingLists.find((l) => l.id === listId)?.name ?? 'lista';
      setInfo(`${res.assigned ?? 0} contato(s) adicionado(s) a "${listName}".`);
      clearSelection();
      router.refresh();
    });
  }

  function handleCreate(formData: FormData) {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const name = String(formData.get('name') ?? '').trim() || defaultListName;
    const tagsRaw = String(formData.get('tags') ?? '');
    const tags = tagsRaw
      .split(/[,\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0 && s.length <= 40);
    const mode = showCreatePanel;
    setError(null);
    setInfo(null);
    start(async () => {
      const res = await createListAndAssignContacts(name, ids);
      if (!res.ok || !res.listId) return setError(res.error ?? 'Falha ao criar lista.');
      // Persist the tags too — createListAndAssignContacts doesn't take tags
      // (it's also used by the contacts bulk bar) so we patch via updateList
      // immediately after. Cheap, and keeps the action surface small.
      if (tags.length > 0) {
        const { updateList } = await import('@/app/(dashboard)/lists/actions');
        await updateList(res.listId, { tags });
      }
      if (mode === 'campaign') {
        // Jump straight into the wizard — operator picks the freshly-named
        // list in the audience step.
        router.push(`/campaigns/new`);
      } else {
        router.push(`/lists/${res.listId}`);
      }
    });
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">
            Nenhum contato neste grupo.
          </div>
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
                        aria-label="Selecionar todos"
                        className="accent-brl-yellow cursor-pointer"
                      />
                    </th>
                  )}
                  <th className="text-left font-medium px-4 py-3">Email</th>
                  <th className="text-left font-medium px-4 py-3">Nome</th>
                  <th className="text-left font-medium px-4 py-3">Sobrenome</th>
                  <th className="text-left font-medium px-4 py-3">Tag</th>
                  <th className="text-left font-medium px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => {
                  const isSelected = selected.has(r.id);
                  return (
                    <tr key={r.id} className={isSelected ? 'bg-brl-yellow/10' : 'hover:bg-zinc-50'}>
                      {canEdit && (
                        <td className="px-3 py-3 align-middle">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(r.id)}
                            aria-label={`Selecionar ${r.email}`}
                            className="accent-brl-yellow cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <Link href={`/contacts/${r.id}`} className="text-brl-dark hover:underline font-medium">
                          {r.email}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-zinc-700">{r.name ?? '—'}</td>
                      <td className="px-4 py-3 text-zinc-700">{r.last_name ?? '—'}</td>
                      <td className="px-4 py-3"><TagBadge tag={r.tag} /></td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      {selected.size > 0 && canEdit && (
        <div className="fixed bottom-0 left-60 right-0 z-40 px-6 py-3 bg-brl-dark text-white shadow-lg border-t border-black/20">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">
                {selected.size} contato{selected.size === 1 ? '' : 's'} selecionado{selected.size === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-zinc-300 hover:text-white inline-flex items-center gap-1"
              >
                <X size={12} /> Limpar
              </button>
              <span className="flex-1" />

              {existingLists.length > 0 && (
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
                  {existingLists.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => openCreatePanel('list')}
                disabled={pending}
                className="rounded-md bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <ListPlus size={13} /> Criar nova lista
              </button>

              <button
                type="button"
                onClick={() => openCreatePanel('campaign')}
                disabled={pending}
                className="rounded-md bg-brl-yellow text-brl-dark font-semibold text-xs px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send size={13} /> Nova campanha com estes
              </button>
            </div>

            {/* Inline create-list panel (used by both 'criar lista' + 'nova campanha' flows) */}
            {showCreatePanel && (
              <form
                action={handleCreate}
                className="mt-3 bg-white text-brl-dark rounded-md p-3 grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end"
              >
                <label className="block">
                  <span className="text-[10px] font-semibold text-zinc-600 mb-1 block">Nome da lista</span>
                  <input
                    name="name"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    autoFocus
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm outline-none focus:border-brl-dark"
                  />
                </label>
                <div>
                  <span className="text-[10px] font-semibold text-zinc-600 mb-1 block">Tags</span>
                  <TagsInput
                    name="tags"
                    defaultValue={suggestedTags}
                    suggestions={tagSuggestions}
                    placeholder="re-engajamento, follow-up…"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={pending || !newListName.trim()}
                    className="rounded-md bg-brl-yellow text-brl-dark font-semibold text-xs px-3 py-2 hover:bg-brl-yellow-hover disabled:opacity-50 whitespace-nowrap"
                  >
                    {pending
                      ? 'Criando…'
                      : showCreatePanel === 'campaign'
                        ? 'Criar lista + abrir wizard →'
                        : 'Criar lista'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreatePanel(null)}
                    className="rounded-md text-xs px-2 py-2 text-zinc-500 hover:text-zinc-900"
                  >
                    cancelar
                  </button>
                </div>
              </form>
            )}

            {(error || info) && (
              <div className="mt-2 text-xs">
                {error && <span className="text-red-300">{error}</span>}
                {info && <span className="text-emerald-300">{info}</span>}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Spacer so the last row isn't hidden by the sticky bar */}
      {selected.size > 0 && <div aria-hidden className="h-32" />}
    </>
  );
}

/** Lowercase + strip accents + collapse non-alphanumerics to single dashes. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
