import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { DEFAULT_DOCUMENT, type TemplateDocument } from '@/lib/blocks';
import type { BrandKit } from '@/lib/brand-kits';
import { TemplateEditor } from './editor';

export default async function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireRole('editor');
  const { id } = await params;
  const supabase = createServiceClient();
  const { data: template } = await supabase
    .from('templates')
    .select('id, name, json_content, is_starter, brand_kit_id')
    .eq('id', id)
    .maybeSingle();
  if (!template) notFound();

  const doc: TemplateDocument =
    template.json_content && typeof template.json_content === 'object'
      ? (template.json_content as TemplateDocument)
      : DEFAULT_DOCUMENT;

  let kit: BrandKit | null = null;
  if (template.brand_kit_id) {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('id', template.brand_kit_id)
      .maybeSingle<BrandKit>();
    kit = data;
  }

  return (
    <div className="h-screen flex flex-col bg-brl-bg">
      <header className="flex items-center justify-between px-6 py-3 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <Link href="/templates" className="text-zinc-500 hover:text-brl-dark inline-flex items-center gap-1 text-sm">
            <ChevronLeft size={14} /> Templates
          </Link>
          {kit && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{
                background: kit.color_header_bg,
                color:
                  kit.color_header_bg.toLowerCase() === '#ffffff'
                    ? kit.color_primary
                    : kit.color_cta_text,
              }}
              title="Brand kit aplicado a este template"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: kit.color_primary }}
              />
              {kit.name}
            </span>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <TemplateEditor
          templateId={template.id}
          initialName={template.name}
          initialDoc={doc}
          initialIsStarter={!!template.is_starter}
          canMarkStarter={profile.role === 'admin'}
          brandKit={kit}
        />
      </div>
    </div>
  );
}
