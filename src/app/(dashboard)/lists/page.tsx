import Link from 'next/link';
import { Plus, ListChecks } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';

type ListRow = {
  id: string;
  name: string;
  description: string | null;
  contact_count: number;
  created_at: string;
};

export default async function ListsPage() {
  const profile = await requireProfile();
  const supabase = createServiceClient();
  const { data: lists } = await supabase
    .from('list_counts')
    .select('*')
    .order('created_at', { ascending: false });

  const canEdit = profile.role === 'admin' || profile.role === 'editor';

  return (
    <div className="p-8 max-w-6xl">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Lists</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Group contacts to target specific audiences with campaigns.
          </p>
        </div>
        {canEdit && (
          <Link
            href="/lists/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover"
          >
            <Plus size={14} /> New list
          </Link>
        )}
      </header>

      {(lists ?? []).length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-12 text-center">
          <ListChecks size={24} className="mx-auto text-zinc-400 mb-2" />
          <h2 className="text-sm font-semibold">No lists yet</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Create your first list to organise contacts.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(lists as ListRow[]).map((l) => (
            <li key={l.id}>
              <Link
                href={`/lists/${l.id}`}
                className="block bg-white rounded-lg border border-zinc-200 p-5 hover:border-brl-yellow transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{l.name}</h3>
                    {l.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{l.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-2xl font-bold text-brl-dark">{l.contact_count}</div>
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      {l.contact_count === 1 ? 'contact' : 'contacts'}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-zinc-400 mt-3">
                  Created {new Date(l.created_at).toLocaleDateString('pt-BR')}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
