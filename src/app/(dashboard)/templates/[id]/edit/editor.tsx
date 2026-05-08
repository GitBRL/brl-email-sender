'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Type, Heading1, Image as ImageIcon, MousePointerClick, Minus, Square, Mail, Trash2, ChevronUp, ChevronDown, Eye, Save, GripVertical,
} from 'lucide-react';
import {
  type Block, type TemplateDocument, type ButtonBlock, type ImageBlock, type HeaderBlock, type TextBlock,
  type DividerBlock, type SpacerBlock, type FooterBlock, makeBlock,
} from '@/lib/blocks';
import { saveTemplate } from '../../actions';
import { cn } from '@/lib/utils';

const PALETTE: Array<{ type: Block['type']; label: string; icon: React.ReactNode }> = [
  { type: 'header',  label: 'Heading',  icon: <Heading1 size={16} /> },
  { type: 'text',    label: 'Text',     icon: <Type size={16} /> },
  { type: 'image',   label: 'Image',    icon: <ImageIcon size={16} /> },
  { type: 'button',  label: 'Button',   icon: <MousePointerClick size={16} /> },
  { type: 'divider', label: 'Divider',  icon: <Minus size={16} /> },
  { type: 'spacer',  label: 'Spacer',   icon: <Square size={16} /> },
  { type: 'footer',  label: 'Footer',   icon: <Mail size={16} /> },
];

export function TemplateEditor({
  templateId,
  initialName,
  initialDoc,
}: {
  templateId: string;
  initialName: string;
  initialDoc: TemplateDocument;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [doc, setDoc] = useState<TemplateDocument>(initialDoc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const selected = doc.blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback((type: Block['type']) => {
    const block = makeBlock(type);
    setDoc((d) => ({ ...d, blocks: [...d.blocks, block] }));
    setSelectedId(block.id);
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<Block>) => {
    setDoc((d) => ({
      ...d,
      blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
    }));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setDoc((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id) }));
    setSelectedId((s) => (s === id ? null : s));
  }, []);

  const moveBlock = useCallback((id: string, dir: -1 | 1) => {
    setDoc((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      if (i < 0) return d;
      const j = i + dir;
      if (j < 0 || j >= d.blocks.length) return d;
      const next = d.blocks.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, blocks: next };
    });
  }, []);

  function reorderTo(srcId: string, destId: string) {
    setDoc((d) => {
      const src = d.blocks.findIndex((b) => b.id === srcId);
      const dest = d.blocks.findIndex((b) => b.id === destId);
      if (src < 0 || dest < 0 || src === dest) return d;
      const next = d.blocks.slice();
      const [moved] = next.splice(src, 1);
      next.splice(dest, 0, moved);
      return { ...d, blocks: next };
    });
  }

  function save() {
    setError(null);
    start(async () => {
      const res = await saveTemplate(templateId, name, doc);
      if (!res.ok) setError(res.error ?? 'Failed to save');
      else {
        setSavedAt(new Date().toLocaleTimeString('pt-BR'));
        router.refresh();
      }
    });
  }

  function preview() {
    save();
    setTimeout(() => window.open(`/templates/${templateId}/preview`, '_blank'), 400);
  }

  return (
    <div className="h-full grid grid-cols-[200px_1fr_300px]">
      {/* Palette */}
      <aside className="border-r border-zinc-200 bg-white p-3 overflow-y-auto">
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1">Blocks</h2>
        <div className="space-y-1">
          {PALETTE.map((p) => (
            <button
              key={p.type}
              type="button"
              onClick={() => addBlock(p.type)}
              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-zinc-100 text-left"
            >
              {p.icon}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <main className="overflow-y-auto bg-zinc-100 p-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 text-lg font-semibold rounded-md border border-zinc-300 bg-white px-3 py-2 outline-none focus:border-brl-dark"
              placeholder="Template name"
            />
            <div className="flex items-center gap-2 shrink-0">
              {savedAt && <span className="text-[10px] text-zinc-500">Saved at {savedAt}</span>}
              <button
                type="button"
                onClick={preview}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
              >
                <Eye size={14} /> Preview
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
              >
                <Save size={14} /> {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2 mb-3">{error}</p>}

          <div
            className="bg-white rounded-lg shadow-sm overflow-hidden"
            style={{ background: doc.contentBackground, border: '1px solid #e5e5e5' }}
          >
            {doc.blocks.length === 0 ? (
              <div className="p-12 text-center text-zinc-400 text-sm">
                Click a block on the left to add it.
              </div>
            ) : (
              doc.blocks.map((b) => (
                <div
                  key={b.id}
                  draggable
                  onDragStart={() => setDragId(b.id)}
                  onDragEnd={() => setDragId(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragId && dragId !== b.id) reorderTo(dragId, b.id);
                  }}
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    'group relative cursor-pointer border-2 transition',
                    selectedId === b.id ? 'border-brl-yellow' : 'border-transparent hover:border-zinc-200',
                    dragId === b.id && 'opacity-40',
                  )}
                >
                  <BlockPreview block={b} />
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 flex gap-0.5 bg-white rounded shadow border border-zinc-200">
                    <span className="px-1 py-1 text-zinc-400 cursor-grab" title="Drag to reorder"><GripVertical size={12} /></span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} className="px-1.5 py-1 hover:bg-zinc-100 text-zinc-600"><ChevronUp size={12} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }} className="px-1.5 py-1 hover:bg-zinc-100 text-zinc-600"><ChevronDown size={12} /></button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} className="px-1.5 py-1 hover:bg-red-50 text-red-600"><Trash2 size={12} /></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Properties */}
      <aside className="border-l border-zinc-200 bg-white p-4 overflow-y-auto">
        {selected ? (
          <BlockProperties
            block={selected}
            onChange={(patch) => updateBlock(selected.id, patch)}
          />
        ) : (
          <div className="text-sm text-zinc-500">Select a block to edit its properties.</div>
        )}
      </aside>
    </div>
  );
}

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'header': {
      const T = block.size as keyof React.JSX.IntrinsicElements;
      return (
        <div style={{ padding: '8px 24px', textAlign: block.align }}>
          <T style={{ margin: 0, color: block.color, fontFamily: 'Inter, Arial, sans-serif', lineHeight: 1.2 }}>{block.text}</T>
        </div>
      );
    }
    case 'text':
      return (
        <div style={{ padding: '8px 24px', textAlign: block.align }}>
          <p style={{ margin: 0, color: block.color, fontFamily: 'Inter, Arial, sans-serif', fontSize: 15, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{block.text}</p>
        </div>
      );
    case 'image':
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <div style={{ padding: '8px 24px', textAlign: 'center' }}>
          <img src={block.src} alt={block.alt} width={block.width} style={{ display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' }} />
        </div>
      );
    case 'button':
      return (
        <div style={{ padding: '16px 24px', textAlign: block.align }}>
          <span style={{ display: 'inline-block', background: block.background, color: block.color, padding: '12px 22px', borderRadius: 6, fontFamily: 'Inter, Arial, sans-serif', fontWeight: 600, fontSize: 14 }}>
            {block.text}
          </span>
        </div>
      );
    case 'divider':
      return (
        <div style={{ padding: '12px 24px' }}>
          <div style={{ height: 1, background: block.color }} />
        </div>
      );
    case 'spacer':
      return <div style={{ height: block.height }} />;
    case 'footer':
      return (
        <div style={{ padding: 24, textAlign: 'center', color: '#999', fontFamily: 'Inter, Arial, sans-serif', fontSize: 12 }}>
          {block.text}
        </div>
      );
    default:
      return null;
  }
}

function BlockProperties({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  switch (block.type) {
    case 'header':
      return (
        <div className="space-y-3">
          <Section title="Heading" />
          <Field label="Text"><textarea rows={2} value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<HeaderBlock>)} className={inputCls} /></Field>
          <Field label="Size">
            <select value={block.size} onChange={(e) => onChange({ size: e.target.value as HeaderBlock['size'] } as Partial<HeaderBlock>)} className={inputCls}>
              <option value="h1">H1 — large</option>
              <option value="h2">H2 — medium</option>
              <option value="h3">H3 — small</option>
            </select>
          </Field>
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<HeaderBlock>)} />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<HeaderBlock>)} />
        </div>
      );
    case 'text':
      return (
        <div className="space-y-3">
          <Section title="Text" />
          <Field label="Content"><textarea rows={5} value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<TextBlock>)} className={inputCls} /></Field>
          <p className="text-[10px] text-zinc-500">
            Tip: use <code>{'{{name}}'}</code> for personalisation merge tags.
          </p>
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<TextBlock>)} />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<TextBlock>)} />
        </div>
      );
    case 'image':
      return (
        <div className="space-y-3">
          <Section title="Image" />
          <Field label="Image URL"><input value={block.src} onChange={(e) => onChange({ src: e.target.value } as Partial<ImageBlock>)} className={inputCls} /></Field>
          <Field label="Alt text"><input value={block.alt} onChange={(e) => onChange({ alt: e.target.value } as Partial<ImageBlock>)} className={inputCls} /></Field>
          <Field label="Width (px)"><input type="number" min={50} max={1200} value={block.width} onChange={(e) => onChange({ width: parseInt(e.target.value, 10) || 600 } as Partial<ImageBlock>)} className={inputCls} /></Field>
          <Field label="Click URL (optional)"><input value={block.href ?? ''} onChange={(e) => onChange({ href: e.target.value } as Partial<ImageBlock>)} className={inputCls} placeholder="https://…" /></Field>
        </div>
      );
    case 'button':
      return (
        <div className="space-y-3">
          <Section title="Button" />
          <Field label="Label"><input value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<ButtonBlock>)} className={inputCls} /></Field>
          <Field label="URL"><input value={block.href} onChange={(e) => onChange({ href: e.target.value } as Partial<ButtonBlock>)} className={inputCls} placeholder="https://…" /></Field>
          <ColorField label="Background" value={block.background} onChange={(v) => onChange({ background: v } as Partial<ButtonBlock>)} />
          <ColorField label="Text color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<ButtonBlock>)} />
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<ButtonBlock>)} />
          <p className="text-[10px] text-zinc-500">
            link_id: <code className="break-all">{block.link_id}</code>
          </p>
        </div>
      );
    case 'divider':
      return (
        <div className="space-y-3">
          <Section title="Divider" />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<DividerBlock>)} />
        </div>
      );
    case 'spacer':
      return (
        <div className="space-y-3">
          <Section title="Spacer" />
          <Field label="Height (px)"><input type="number" min={4} max={200} value={block.height} onChange={(e) => onChange({ height: parseInt(e.target.value, 10) || 24 } as Partial<SpacerBlock>)} className={inputCls} /></Field>
        </div>
      );
    case 'footer':
      return (
        <div className="space-y-3">
          <Section title="Footer" />
          <Field label="Text"><textarea rows={3} value={block.text} onChange={(e) => onChange({ text: e.target.value } as Partial<FooterBlock>)} className={inputCls} /></Field>
          <p className="text-[10px] text-zinc-500">
            <code>{'{{unsubscribe_url}}'}</code> will be replaced when sending.
          </p>
        </div>
      );
    default:
      return null;
  }
}

const inputCls = 'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brl-dark';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold mb-1 block">{label}</span>
      {children}
    </label>
  );
}
function Section({ title }: { title: string }) {
  return <h2 className="text-sm font-semibold border-b border-zinc-200 pb-2">{title}</h2>;
}
function AlignField({ value, onChange }: { value: 'left' | 'center' | 'right'; onChange: (v: 'left' | 'center' | 'right') => void }) {
  return (
    <Field label="Alignment">
      <div className="flex gap-1">
        {(['left', 'center', 'right'] as const).map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => onChange(a)}
            className={cn(
              'flex-1 rounded-md border px-2 py-1.5 text-xs capitalize',
              value === a ? 'bg-brl-yellow border-brl-yellow text-brl-dark font-semibold' : 'border-zinc-300 bg-white hover:bg-zinc-50',
            )}
          >
            {a}
          </button>
        ))}
      </div>
    </Field>
  );
}
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded border border-zinc-300 cursor-pointer" />
        <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      </div>
    </Field>
  );
}
