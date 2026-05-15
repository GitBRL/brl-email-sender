import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { createServiceClient } from '@/lib/supabase/server';
import { ListForm } from '../_form';

export default async function NewListPage() {
  await requireRole('editor');
  // Pull every tag used across existing lists so the form can suggest
  // reusable tags inline (helps keep tagging vocabulary consistent).
  const supabase = createServiceClient();
  const { data: rows } = await supabase.from('lists').select('tags');
  const tagSet = new Set<string>();
  for (const r of (rows ?? []) as Array<{ tags: string[] | null }>) {
    for (const t of r.tags ?? []) tagSet.add(t);
  }
  const suggestions = Array.from(tagSet).sort();

  return (
    <div className="p-8 max-w-xl">
      <Link href="/lists" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to lists
      </Link>
      <h1 className="text-2xl font-bold mb-6">Nova lista</h1>
      <ListForm tagSuggestions={suggestions} />
    </div>
  );
}
