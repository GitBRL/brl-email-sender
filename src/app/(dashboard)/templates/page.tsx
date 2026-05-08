import Link from 'next/link';
import { Plus, FileText } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { NewTemplateButton } from './_new-button';
import { TemplateRowActions } from './_row-actions';

type TemplateRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export default async function TemplatesPage() {
  const profile = await requireProfile();
  const supabase = createServiceClient();
  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, created_at, updated_at')
    .order('updated_at', { ascending: false });

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  return (
    <div className="p-8 max-w-6xl">
      <header className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Reusable email designs built with the block editor.
          </p>
        </div>
        {canEdit && <NewTemplateButton />}
      </header>

      {(templates ?? []).length === 0 ? (
        <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-12 text-center">
          <FileText size={24} className="mx-auto text-zinc-400 mb-2" />
          <h2 className="text-sm font-semibold">No templates yet</h2>
          <p className="text-xs text-zinc-500 mt-1">Create your first template to start designing emails.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(templates as TemplateRow[]).map((t) => (
            <li key={t.id} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
              <Link
                href={canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/preview`}
                className="block aspect-[4/3] bg-gradient-to-br from-zinc-50 to-zinc-100 grid place-items-center hover:from-zinc-100 hover:to-zinc-200 transition"
              >
                <FileText size={36} className="text-zinc-400" />
              </Link>
              <div className="p-4 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    href={canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/preview`}
                    className="font-semibold truncate block hover:underline"
                  >
                    {t.name}
                  </Link>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    Updated {new Date(t.updated_at).toLocaleDateString('pt-BR')}
                  </div>
                </div>
                {canEdit && (
                  <TemplateRowActions id={t.id} name={t.name} canDelete={canDelete} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
