import { requireRole } from '@/lib/auth';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { CsvImporter } from './csv-importer';

export default async function ImportContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ list?: string }>;
}) {
  await requireRole('editor');
  const sp = await searchParams;
  const supabase = createServiceClient();
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .order('name');

  // When ?list=<uuid> is present, the importer pre-selects that list in the
  // 'Salvar em uma lista' card (existing-list mode). Used by the 'Importar
  // contatos para esta lista' button on /lists/[id].
  const targetList = sp.list
    ? (lists ?? []).find((l) => l.id === sp.list) ?? null
    : null;

  return (
    <div className="p-8 max-w-3xl">
      <Link
        href={targetList ? `/lists/${targetList.id}` : '/contacts'}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4"
      >
        <ChevronLeft size={14} />
        {targetList ? `Voltar para "${targetList.name}"` : 'Back to contacts'}
      </Link>
      <h1 className="text-2xl font-bold">
        {targetList
          ? `Importar contatos para "${targetList.name}"`
          : 'Import contacts from CSV'}
      </h1>
      <p className="text-sm text-zinc-500 mt-1">
        {targetList ? (
          <>Os contatos do CSV serão adicionados a esta lista. Existentes (mesmo email) serão atualizados.</>
        ) : (
          <>Upload a CSV file. We&apos;ll let you map the columns to contact fields. Existing contacts (matched by email) will be updated.</>
        )}
      </p>
      <div className="mt-6">
        <CsvImporter
          existingLists={(lists ?? []) as Array<{ id: string; name: string }>}
          initialListAssignment={
            targetList ? { kind: 'existing', id: targetList.id } : undefined
          }
        />
      </div>
    </div>
  );
}
