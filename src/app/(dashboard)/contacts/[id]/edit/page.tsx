import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { EditContactForm } from './edit-form';
import type { Contact } from '@/types';

export default async function EditContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('editor');
  const { id } = await params;
  const supabase = await createClient();
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', id)
    .maybeSingle<Contact>();
  if (!contact) notFound();

  return (
    <div className="p-8 max-w-2xl">
      <Link
        href={`/contacts/${id}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4"
      >
        <ChevronLeft size={14} /> Back to contact
      </Link>
      <h1 className="text-2xl font-bold mb-6">Edit contact</h1>
      <EditContactForm contact={contact} />
    </div>
  );
}
