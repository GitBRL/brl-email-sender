import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { requireRole } from '@/lib/auth';
import { ListForm } from '../_form';

export default async function NewListPage() {
  await requireRole('editor');
  return (
    <div className="p-8 max-w-xl">
      <Link href="/lists" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to lists
      </Link>
      <h1 className="text-2xl font-bold mb-6">New list</h1>
      <ListForm />
    </div>
  );
}
