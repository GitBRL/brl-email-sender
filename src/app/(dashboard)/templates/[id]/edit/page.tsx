import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { DEFAULT_DOCUMENT, type TemplateDocument } from '@/lib/blocks';
import { TemplateEditor } from './editor';

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole('editor');
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: template } = await supabase
    .from('templates')
    .select('id, name, json_content, is_starter')
    .eq('id', id)
    .maybeSingle();
  if (!template) notFound();

  const doc: TemplateDocument =
    template.json_content && typeof template.json_content === 'object'
      ? (template.json_content as TemplateDocument)
      : DEFAULT_DOCUMENT;

  return (
    <div className="h-screen flex flex-col bg-brl-bg">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="text-zinc-500 hover:text-brl-dark inline-flex items-center gap-1 text-sm">
            <ChevronLeft size={14} /> Templates
          </Link>
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <TemplateEditor
          templateId={template.id}
          initialName={template.name}
          initialDoc={doc}
          initialIsStarter={!!template.is_starter}
          canMarkStarter={profile.role === 'admin'}
        />
      </div>
    </div>
  );
}
