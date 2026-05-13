import { requireRole } from '@/lib/auth';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { CsvImporter } from './csv-importer';

export default async function ImportContactsPage() {
  await requireRole('editor');
  const supabase = createServiceClient();
  const { data: lists } = await supabase
    .from('lists')
    .select('id, name')
    .order('name');
  return (
    <div className="p-8 max-w-3xl">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to contacts
      </Link>
      <h1 className="text-2xl font-bold">Import contacts from CSV</h1>
      <p className="text-sm text-zinc-500 mt-1">
        Upload a CSV file. We&apos;ll let you map the columns to contact fields. Existing contacts (matched by email) will be updated.
      </p>
      <div className="mt-6">
        <CsvImporter existingLists={(lists ?? []) as Array<{ id: string; name: string }>} />
      </div>
    </div>
  );
}
