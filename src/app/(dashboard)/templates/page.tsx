import Link from 'next/link';
import { FileText, Sparkles, Star } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth';
import { STARTER_TEMPLATES } from '@/lib/starter-templates';
import type { BrandKit } from '@/lib/brand-kits';
import { NewTemplateButton } from './_new-button';
import { TemplateRowActions } from './_row-actions';
import { UseStarterButton } from './_use-starter-button';

type TemplateRow = {
  id: string;
  name: string;
  is_starter: boolean;
  created_at: string;
  updated_at: string;
};

export default async function TemplatesPage() {
  const profile = await requireProfile();
  const supabase = createServiceClient();
  const [{ data }, { data: kitsData }] = await Promise.all([
    supabase
      .from('templates')
      .select('id, name, is_starter, created_at, updated_at')
      .order('updated_at', { ascending: false }),
    supabase.from('brand_kits').select('*').order('is_custom').order('name'),
  ]);
  const all = (data ?? []) as TemplateRow[];
  const kits = (kitsData ?? []) as BrandKit[];
  const teamStarters = all.filter((t) => t.is_starter);
  const userTemplates = all.filter((t) => !t.is_starter);

  const canEdit = profile.role === 'admin' || profile.role === 'editor';
  const canDelete = profile.role === 'admin';

  return (
    <div className="p-8 max-w-6xl space-y-10">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Templates</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Designs reutilizáveis montados no editor de blocos.
          </p>
        </div>
        {canEdit && <NewTemplateButton kits={kits} />}
      </header>

      {/* Built-in starter gallery */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3 flex items-center gap-2">
          <Sparkles size={14} className="text-brl-orange" />
          Modelos prontos
        </h2>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STARTER_TEMPLATES.map((s) => (
            <li
              key={s.id}
              className="bg-white rounded-lg border border-zinc-200 overflow-hidden flex flex-col"
            >
              <div className="aspect-[4/3] bg-gradient-to-br from-zinc-50 to-zinc-100 grid place-items-center">
                <div className="text-center px-4">
                  <span className="inline-block text-[10px] uppercase tracking-wide font-semibold text-brl-orange bg-orange-50 px-2 py-0.5 rounded-full mb-3">
                    {s.category}
                  </span>
                  <div className="text-sm font-bold text-zinc-700">{s.name}</div>
                </div>
              </div>
              <div className="p-4 flex flex-col gap-3 flex-1">
                <p className="text-xs text-zinc-600 leading-relaxed flex-1">{s.description}</p>
                {canEdit && <UseStarterButton starterId={s.id} />}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Team-promoted starters */}
      {teamStarters.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3 flex items-center gap-2">
            <Star size={14} className="text-amber-500" />
            Modelos da equipe
            <span className="text-zinc-400 text-xs font-normal">
              ({teamStarters.length})
            </span>
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamStarters.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                canEdit={canEdit}
                canDelete={canDelete}
                showStar
                showUseButton={canEdit}
              />
            ))}
          </ul>
        </section>
      )}

      {/* User's own templates */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">
          Meus templates
        </h2>
        {userTemplates.length === 0 ? (
          <div className="bg-white border border-dashed border-zinc-300 rounded-lg p-12 text-center">
            <FileText size={24} className="mx-auto text-zinc-400 mb-2" />
            <h3 className="text-sm font-semibold">Nenhum template ainda</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Clique em <strong>&quot;Use this template&quot;</strong> em um modelo pronto acima — ou crie um do zero.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {userTemplates.map((t) => (
              <TemplateCard
                key={t.id}
                t={t}
                canEdit={canEdit}
                canDelete={canDelete}
                showStar={false}
                showUseButton={false}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TemplateCard({
  t,
  canEdit,
  canDelete,
  showStar,
  showUseButton,
}: {
  t: TemplateRow;
  canEdit: boolean;
  canDelete: boolean;
  showStar: boolean;
  showUseButton: boolean;
}) {
  return (
    <li className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
      <Link
        href={canEdit ? `/templates/${t.id}/edit` : `/templates/${t.id}/preview`}
        className="block aspect-[4/3] bg-gradient-to-br from-zinc-50 to-zinc-100 grid place-items-center hover:from-zinc-100 hover:to-zinc-200 transition relative"
      >
        <FileText size={36} className="text-zinc-400" />
        {showStar && (
          <Star
            size={16}
            className="absolute top-3 right-3 text-amber-500 fill-amber-500"
            aria-label="Team starter"
          />
        )}
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
            Atualizado {new Date(t.updated_at).toLocaleDateString('pt-BR')}
          </div>
          {showUseButton && (
            <div className="mt-2">
              <UseStarterButton starterId={t.id} label="Use as base" />
            </div>
          )}
        </div>
        {canEdit && <TemplateRowActions id={t.id} name={t.name} canDelete={canDelete} />}
      </div>
    </li>
  );
}
