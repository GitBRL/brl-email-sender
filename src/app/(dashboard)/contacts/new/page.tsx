import { requireRole } from '@/lib/auth';
import { ContactForm } from '../_form';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

export default async function NewContactPage() {
  await requireRole('editor');
  return (
    <div className="p-8 max-w-2xl">
      <Link href="/contacts" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-brl-dark mb-4">
        <ChevronLeft size={14} /> Back to contacts
      </Link>
      <h1 className="text-2xl font-bold mb-6">Add contact</h1>
      <ContactForm />
    </div>
  );
}
