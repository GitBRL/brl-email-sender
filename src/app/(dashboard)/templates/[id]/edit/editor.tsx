'use client';

import { useState, useTransition, useCallback, useEffect, createContext, useContext, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { BrandKit } from '@/lib/brand-kits';
import { kitPalette } from '@/lib/brand-kits';

const BrandKitContext = createContext<BrandKit | null>(null);
import {
  Type, Heading1, Image as ImageIcon, MousePointerClick, Minus, Square, Mail, Trash2, ChevronUp, ChevronDown, Eye, Save, GripVertical,
  Building2, Upload, Link as LinkIcon, X, List,
} from 'lucide-react';
import {
  type Block, type TemplateDocument, type ButtonBlock, type ImageBlock, type HeaderBlock, type TextBlock,
  type DividerBlock, type SpacerBlock, type FooterBlock, type BulletsBlock, makeBlock, makeLogo,
} from '@/lib/blocks';
import { saveTemplate, uploadEmailImage } from '../../actions';
import { cn } from '@/lib/utils';

/** Palette item. Either `type` (uses makeBlock) or `make` (custom preset like Logo). */
type PaletteItem = {
  label: string;
  icon: React.ReactNode;
} & ({ type: Block['type'] } | { make: () => Block });

const PALETTE: PaletteItem[] = [
  { type: 'header',  label: 'Heading',  icon: <Heading1 size={16} /> },
  { type: 'text',    label: 'Text',     icon: <Type size={16} /> },
  { type: 'bullets', label: 'Bullets',  icon: <List size={16} /> },
  { make: makeLogo,  label: 'Logo',     icon: <Building2 size={16} /> },
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
  initialIsStarter,
  canMarkStarter,
  brandKit,
}: {
  templateId: string;
  initialName: string;
  initialDoc: TemplateDocument;
  initialIsStarter: boolean;
  /** Only admins can promote a template to the shared starter gallery. */
  canMarkStarter: boolean;
  /** Brand kit linked to this template (themes color swatches + shows badge in toolbar). */
  brandKit: BrandKit | null;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [doc, setDoc] = useState<TemplateDocument>(initialDoc);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [isStarter, setIsStarter] = useState(initialIsStarter);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Bumping this forces the preview iframe to re-fetch the preview HTML after
  // we re-open (since the same URL won't reload without a cache-buster).
  const [previewKey, setPreviewKey] = useState(0);

  const selected = doc.blocks.find((b) => b.id === selectedId) ?? null;

  const addBlock = useCallback((item: PaletteItem) => {
    const block = 'make' in item ? item.make() : makeBlock(item.type);
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
      const res = await saveTemplate(templateId, name, doc, { is_starter: isStarter });
      if (!res.ok) setError(res.error ?? 'Failed to save');
      else {
        setSavedAt(new Date().toLocaleTimeString('pt-BR'));
        router.refresh();
      }
    });
  }

  // Auto-save after every change in the document (or name / starter flag),
  // debounced 1.2s. Without this, users could spend minutes editing in the
  // wizard's iframed editor, then click Continuar without clicking Save —
  // and their changes would never reach the Review preview / send pipeline.
  // The leading-edge guard (initial-render skip) prevents a no-op save on
  // first mount.
  const initialMount = useRef(true);
  useEffect(() => {
    if (initialMount.current) {
      initialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      save();
    }, 1200);
    return () => clearTimeout(timer);
    // save() is intentionally not in deps — capturing the latest doc / name /
    // isStarter via closure is enough, and depending on a freshly-bound save
    // would create a noisy loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, name, isStarter]);

  function preview() {
    // Save first so the preview iframe reads the latest html_content, then
    // open the in-page modal. The 400ms delay gives the save round-trip
    // time to finish before the preview iframe refetches.
    save();
    setTimeout(() => {
      setPreviewKey((k) => k + 1);
      setPreviewOpen(true);
    }, 400);
  }

  return (
    <BrandKitContext.Provider value={brandKit}>
    <div className="h-full grid grid-cols-[200px_1fr_380px]">
      {/* Palette */}
      <aside className="border-r border-zinc-200 bg-white p-3 overflow-y-auto">
        {brandKit && (
          <div className="mb-3 rounded-md border border-zinc-200 overflow-hidden">
            <div
              className="h-6 flex items-center justify-center px-2"
              style={{ background: brandKit.color_header_bg }}
            >
              <span
                className="text-[10px] font-bold uppercase tracking-wide truncate"
                style={{
                  color:
                    brandKit.color_header_bg.toLowerCase() === '#ffffff'
                      ? brandKit.color_primary
                      : brandKit.color_cta_text,
                }}
              >
                {brandKit.name}
              </span>
            </div>
            <div className="p-1.5 flex items-center gap-1 bg-white">
              {kitPalette(brandKit).map((c) => (
                <span
                  key={c.label}
                  className="inline-block w-4 h-4 rounded-full border border-black/10"
                  style={{ background: c.value }}
                  title={`${c.label}: ${c.value}`}
                />
              ))}
            </div>
          </div>
        )}
        <h2 className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold mb-2 px-1">Blocks</h2>
        <div className="space-y-1">
          {PALETTE.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => addBlock(p)}
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
          {canMarkStarter && (
            <label className="flex items-center gap-2 mb-3 text-xs bg-white border border-zinc-200 rounded-md px-3 py-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isStarter}
                onChange={(e) => setIsStarter(e.target.checked)}
                className="accent-brl-orange"
              />
              <span className="font-medium">Save as starter template</span>
              <span className="text-zinc-500">
                — appears in the gallery for everyone on your team to clone.
              </span>
            </label>
          )}
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

    {/* Preview modal — iframes /templates/[id]/preview in the same page.
        Click backdrop or Esc to close. Re-keys on every open() so the iframe
        re-fetches the freshly-saved html_content.
        Sizing: max-w-4xl gives ~896px (wider than the email's 600px container
        so it never wraps tight). max-h is 95dvh on tall screens and adapts
        down to 100% on shorter mobiles. The iframe is the flex remainder so
        it consumes all available height; the email scrolls inside it. */}
    {previewOpen && (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-2 sm:p-4"
        onClick={(e) => e.target === e.currentTarget && setPreviewOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setPreviewOpen(false)}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="bg-white rounded-lg shadow-2xl w-full flex flex-col overflow-hidden"
          style={{ maxWidth: 'min(96vw, 56rem)', height: 'min(95dvh, 1000px)' }}
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-2 text-sm">
              <Eye size={14} className="text-zinc-500" />
              <span className="font-medium">Preview do email</span>
              <span className="text-zinc-400 text-xs">(como será enviado)</span>
            </div>
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="text-zinc-500 hover:text-zinc-900 w-8 h-8 grid place-items-center rounded"
              aria-label="Fechar preview"
            >
              <X size={18} />
            </button>
          </header>
          <iframe
            key={previewKey}
            src={`/templates/${templateId}/preview`}
            title="Preview do template"
            className="block flex-1 w-full bg-zinc-50 min-h-0"
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    )}
    </BrandKitContext.Provider>
  );
}

/** Mirror compile-template.ts inlineFormat — runs in the editor preview so
 *  what-you-see matches the sent email. Renders **bold**, *italic*, and
 *  [text](url) inline. */
function renderInline(raw: string): React.ReactNode[] {
  // Process bold first, then italic, then links — each pass walks the
  // tree and re-splits text nodes around matches.
  const nodes: React.ReactNode[] = [raw];

  function splitWith(
    pattern: RegExp,
    wrap: (groups: string[], key: string) => React.ReactNode,
  ) {
    const out: React.ReactNode[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (typeof n !== 'string') {
        out.push(n);
        continue;
      }
      let last = 0;
      let m: RegExpExecArray | null;
      pattern.lastIndex = 0;
      let matchIdx = 0;
      while ((m = pattern.exec(n)) !== null) {
        if (m.index > last) out.push(n.slice(last, m.index));
        out.push(wrap(m.slice(1), `inl-${i}-${matchIdx++}`));
        last = m.index + m[0].length;
        if (pattern.lastIndex === m.index) pattern.lastIndex++;
      }
      if (last < n.length) out.push(n.slice(last));
    }
    nodes.length = 0;
    nodes.push(...out);
  }

  // [text](url)
  splitWith(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, ([label, url], key) => (
    <a key={key} href={url} style={{ color: 'inherit', textDecoration: 'underline' }}>{label}</a>
  ));
  // **bold**
  splitWith(/\*\*([^*]+)\*\*/g, ([t], key) => <strong key={key}>{t}</strong>);
  // *italic*
  splitWith(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, ([t], key) => <em key={key}>{t}</em>);

  // Replace \n with <br/> at the end
  const final: React.ReactNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (typeof n === 'string') {
      const parts = n.split('\n');
      parts.forEach((p, j) => {
        if (j > 0) final.push(<br key={`br-${i}-${j}`} />);
        if (p) final.push(p);
      });
    } else {
      final.push(n);
    }
  }
  return final;
}

const HEADING_SIZES = { h1: 28, h2: 22, h3: 18 } as const;
const PREVIEW_FONT_STACK = '"Sora", Inter, Arial, sans-serif';

function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case 'header': {
      const T = block.size as keyof React.JSX.IntrinsicElements;
      const fontSize = block.font_size ?? HEADING_SIZES[block.size];
      const fontWeight = block.bold === false ? 600 : 700;
      const fontStyle = block.italic ? 'italic' : 'normal';
      return (
        <div style={{ padding: '8px 24px', textAlign: block.align }}>
          <T style={{ margin: 0, color: block.color, fontFamily: PREVIEW_FONT_STACK, fontSize, fontWeight, fontStyle, lineHeight: 1.25 }}>
            {renderInline(block.text)}
          </T>
        </div>
      );
    }
    case 'text': {
      const fontSize = block.font_size ?? 15;
      const fontWeight = block.bold ? 700 : 400;
      const fontStyle = block.italic ? 'italic' : 'normal';
      return (
        <div style={{ padding: '8px 24px', textAlign: block.align }}>
          <p style={{ margin: 0, color: block.color, fontFamily: PREVIEW_FONT_STACK, fontSize, fontWeight, fontStyle, lineHeight: 1.6 }}>
            {renderInline(block.text)}
          </p>
        </div>
      );
    }
    case 'image': {
      // Mirror compile-template.ts: real email clients ignore CSS text-align
      // on block-level images, so we set the margin explicitly. Both the
      // wrapping td's text-align AND the img's margin must follow `align`
      // for the editor preview to match the sent email exactly.
      const align = block.align ?? 'center';
      const margin =
        align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';
      const fit = block.fit ?? 'contain';
      const sizing: React.CSSProperties = block.height
        ? { height: block.height, objectFit: fit }
        : { height: 'auto' };
      // eslint-disable-next-line @next/next/no-img-element
      return (
        <div style={{ padding: '8px 24px', textAlign: align }}>
          <img
            src={block.src}
            alt={block.alt}
            width={block.width}
            style={{ display: 'block', maxWidth: '100%', margin, ...sizing }}
          />
        </div>
      );
    }
    case 'button':
      return (
        <div style={{ padding: '16px 24px', textAlign: block.align }}>
          <span style={{ display: 'inline-block', background: block.background, color: block.color, padding: '12px 22px', borderRadius: 6, fontFamily: PREVIEW_FONT_STACK, fontWeight: 600, fontSize: 14 }}>
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
        <div style={{ padding: 24, textAlign: 'center', color: '#999', fontFamily: PREVIEW_FONT_STACK, fontSize: 12 }}>
          {block.text}
        </div>
      );
    case 'bullets': {
      const fontSize = block.font_size ?? 15;
      const fontWeight = block.bold ? 700 : 400;
      const fontStyle = block.italic ? 'italic' : 'normal';
      const ListTag = block.style === 'numbered' ? 'ol' : 'ul';
      return (
        <div style={{ padding: '8px 24px', textAlign: block.align }}>
          <ListTag
            style={{
              margin: 0,
              padding: '0 0 0 24px',
              color: block.color,
              fontFamily: PREVIEW_FONT_STACK,
              fontSize,
              fontWeight,
              fontStyle,
              lineHeight: 1.6,
            }}
          >
            {block.items
              .filter((s) => s && s.trim() !== '')
              .map((line, i) => (
                <li key={i} style={{ margin: '0 0 6px 0' }}>{renderInline(line)}</li>
              ))}
          </ListTag>
        </div>
      );
    }
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
          <FormattedTextarea
            label="Text"
            rows={4}
            minClass="min-h-[5rem]"
            value={block.text}
            onChange={(v) => onChange({ text: v } as Partial<HeaderBlock>)}
          />
          <p className="text-[10px] text-zinc-500 -mt-1">
            Selecione um trecho e clique <strong>B</strong>/<strong>I</strong>/🔗 para formatar parte do texto.
          </p>
          <Field label="Heading level">
            <select
              value={block.size}
              onChange={(e) =>
                // Clear any custom font_size override so the new level's
                // default size kicks in immediately (otherwise an existing
                // override would visually freeze the heading at the old size).
                onChange({
                  size: e.target.value as HeaderBlock['size'],
                  font_size: undefined,
                } as Partial<HeaderBlock>)
              }
              className={inputCls}
            >
              <option value="h1">H1 — grande (28px)</option>
              <option value="h2">H2 — médio (22px)</option>
              <option value="h3">H3 — pequeno (18px)</option>
            </select>
          </Field>
          <FormattingRow
            bold={block.bold !== false}
            italic={!!block.italic}
            fontSize={block.font_size ?? null}
            defaultFontSize={HEADING_SIZES[block.size]}
            onBold={(v) => onChange({ bold: v } as Partial<HeaderBlock>)}
            onItalic={(v) => onChange({ italic: v } as Partial<HeaderBlock>)}
            onFontSize={(v) => onChange({ font_size: v } as Partial<HeaderBlock>)}
          />
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<HeaderBlock>)} />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<HeaderBlock>)} />
        </div>
      );
    case 'text':
      return (
        <div className="space-y-3">
          <Section title="Text" />
          <FormattedTextarea
            label="Content"
            rows={12}
            minClass="min-h-[18rem]"
            value={block.text}
            onChange={(v) => onChange({ text: v } as Partial<TextBlock>)}
          />
          <p className="text-[10px] text-zinc-500 -mt-1">
            Selecione um trecho e clique <strong>B</strong>/<strong>I</strong>/🔗 — ou digite <code>{'{{name}}'}</code> para merge tag.
          </p>
          <FormattingRow
            bold={!!block.bold}
            italic={!!block.italic}
            fontSize={block.font_size ?? null}
            defaultFontSize={15}
            onBold={(v) => onChange({ bold: v } as Partial<TextBlock>)}
            onItalic={(v) => onChange({ italic: v } as Partial<TextBlock>)}
            onFontSize={(v) => onChange({ font_size: v } as Partial<TextBlock>)}
          />
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<TextBlock>)} />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<TextBlock>)} />
        </div>
      );
    case 'image':
      return (
        <div className="space-y-3">
          <Section title="Image" />
          <ImageUploader
            value={block.src}
            onChange={(v) => onChange({ src: v } as Partial<ImageBlock>)}
          />
          <Field label="Alt text"><input value={block.alt} onChange={(e) => onChange({ alt: e.target.value } as Partial<ImageBlock>)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Width (px)">
              <input
                type="number" min={50} max={1200}
                value={block.width}
                onChange={(e) => onChange({ width: parseInt(e.target.value, 10) || 600 } as Partial<ImageBlock>)}
                className={inputCls}
              />
            </Field>
            <Field label="Height (px) — opcional">
              <input
                type="number" min={20} max={1200}
                value={block.height ?? ''}
                placeholder="auto"
                onChange={(e) => {
                  const v = e.target.value;
                  onChange({
                    height: v === '' ? undefined : Math.max(20, Math.min(1200, parseInt(v, 10) || 0)),
                  } as Partial<ImageBlock>);
                }}
                className={inputCls}
              />
            </Field>
          </div>
          {block.height ? (
            <Field label="Ajuste (quando height fixo)">
              <select
                value={block.fit ?? 'contain'}
                onChange={(e) => onChange({ fit: e.target.value as 'contain' | 'cover' } as Partial<ImageBlock>)}
                className={inputCls}
              >
                <option value="contain">Contain — mostra a imagem inteira (sem cortar)</option>
                <option value="cover">Cover — preenche o quadro (pode cortar)</option>
              </select>
            </Field>
          ) : (
            <p className="text-[10px] text-zinc-500 -mt-1">
              Sem altura → a imagem mantém a proporção original. Defina altura para travar o tamanho do bloco (ex: 120 para um banner) — assim uma nova imagem fica no mesmo espaço.
            </p>
          )}
          <AlignField value={block.align ?? 'center'} onChange={(v) => onChange({ align: v } as Partial<ImageBlock>)} />
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
    case 'bullets':
      return (
        <div className="space-y-3">
          <Section title="Lista" />
          <Field label="Estilo">
            <div className="flex gap-1">
              {(['bullet', 'numbered'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ style: s } as Partial<BulletsBlock>)}
                  className={cn(
                    'flex-1 rounded-md border px-2 py-1.5 text-xs',
                    block.style === s
                      ? 'bg-brl-yellow border-brl-yellow text-brl-dark font-semibold'
                      : 'border-zinc-300 bg-white hover:bg-zinc-50',
                  )}
                >
                  {s === 'bullet' ? '• Bullets' : '1. Numerada'}
                </button>
              ))}
            </div>
          </Field>
          <BulletsItemsEditor
            items={block.items}
            style={block.style}
            onChange={(items) => onChange({ items } as Partial<BulletsBlock>)}
          />
          <p className="text-[10px] text-zinc-500">
            Selecione um trecho e use <strong>B</strong> / <strong>I</strong> / 🔗 acima do item, ou digite <code>**negrito**</code> / <code>*itálico*</code> / <code>[texto](url)</code> direto.
          </p>
          <FormattingRow
            bold={!!block.bold}
            italic={!!block.italic}
            fontSize={block.font_size ?? null}
            defaultFontSize={15}
            onBold={(v) => onChange({ bold: v } as Partial<BulletsBlock>)}
            onItalic={(v) => onChange({ italic: v } as Partial<BulletsBlock>)}
            onFontSize={(v) => onChange({ font_size: v } as Partial<BulletsBlock>)}
          />
          <AlignField value={block.align} onChange={(v) => onChange({ align: v } as Partial<BulletsBlock>)} />
          <ColorField label="Color" value={block.color} onChange={(v) => onChange({ color: v } as Partial<BulletsBlock>)} />
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
/**
 * Image picker for image-block properties: shows a thumbnail of the current
 * image, an "Upload" button that opens the OS file picker (no URL knowledge
 * needed), and a small disclosure for pasting a URL when the user genuinely
 * wants one (e.g. an external CDN). Uploads go through the uploadEmailImage
 * server action and the resulting public URL is set as block.src.
 */
/**
 * Apply a markdown wrap (bold/italic/link) to the current selection inside
 * the supplied input/textarea. If nothing is selected, the wrappers are
 * inserted at the cursor and the caret is parked between them so the user
 * can immediately type the styled text. Returns the new value + the new
 * selection range so the caller can call setSelectionRange.
 */
function wrapSelectionMd(
  el: HTMLInputElement | HTMLTextAreaElement,
  wrapStart: string,
  wrapEnd: string,
): { value: string; selStart: number; selEnd: number } {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const before = el.value.slice(0, start);
  const sel = el.value.slice(start, end);
  const after = el.value.slice(end);
  const value = `${before}${wrapStart}${sel}${wrapEnd}${after}`;
  const selStart = start + wrapStart.length;
  const selEnd = selStart + sel.length;
  return { value, selStart, selEnd };
}

/**
 * B / I / Link toolbar that operates on the focused input. The parent passes
 * a ref-getter so the toolbar can find the active element; the parent also
 * supplies an onChange that receives the new whole-field value (so it can
 * route into the right state setter for the right block / item).
 */
function MdToolbar({
  getEl,
  onChange,
  size = 'md',
}: {
  getEl: () => HTMLInputElement | HTMLTextAreaElement | null;
  onChange: (newValue: string) => void;
  size?: 'sm' | 'md';
}) {
  function apply(start: string, end: string) {
    const el = getEl();
    if (!el) return;
    const { value, selStart, selEnd } = wrapSelectionMd(el, start, end);
    onChange(value);
    // Restore selection after React re-renders the controlled input.
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(selStart, selEnd);
    }, 0);
  }
  const btn = cn(
    'rounded border border-zinc-200 bg-white hover:bg-zinc-100 transition shrink-0 grid place-items-center',
    size === 'sm' ? 'w-6 h-6 text-[11px]' : 'w-7 h-7 text-xs',
  );
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => apply('**', '**')} className={cn(btn, 'font-bold')} title="Negrito (**texto**)">
        B
      </button>
      <button type="button" onClick={() => apply('*', '*')} className={cn(btn, 'italic')} title="Itálico (*texto*)">
        I
      </button>
      <button
        type="button"
        onClick={() => apply('[', '](https://)')}
        className={btn}
        title="Link ([texto](url))"
      >
        <LinkIcon size={11} />
      </button>
    </div>
  );
}

/**
 * Textarea + B/I/Link toolbar paired together. The toolbar wraps the
 * current selection inside the textarea with markdown — so users can bold
 * a single word or just a phrase inside a longer paragraph without learning
 * the markdown syntax.
 */
function FormattedTextarea({
  label,
  value,
  onChange,
  rows = 5,
  minClass = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  minClass?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500 font-semibold">{label}</span>
        <MdToolbar size="sm" getEl={() => ref.current} onChange={onChange} />
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputCls, minClass, 'resize-y leading-relaxed')}
      />
    </div>
  );
}

/**
 * Row-per-item editor for the Bullets block. Each row shows the bullet/number
 * marker on the left, an input on the right, and a small format toolbar that
 * appears for the focused row. Enter at end of input adds a new row below;
 * Backspace on an empty input removes the row and focuses the previous one.
 */
function BulletsItemsEditor({
  items,
  style,
  onChange,
}: {
  items: string[];
  style: 'bullet' | 'numbered';
  onChange: (items: string[]) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);

  function set(i: number, value: string) {
    const next = items.slice();
    next[i] = value;
    onChange(next);
  }
  function addAfter(i: number) {
    const next = items.slice();
    next.splice(i + 1, 0, '');
    onChange(next);
    setTimeout(() => refs.current[i + 1]?.focus(), 0);
  }
  function removeAt(i: number) {
    if (items.length <= 1) {
      // Keep at least one row — just clear it
      set(i, '');
      return;
    }
    const next = items.slice();
    next.splice(i, 1);
    onChange(next);
    setTimeout(() => refs.current[Math.max(0, i - 1)]?.focus(), 0);
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const marker = style === 'numbered' ? `${i + 1}.` : '•';
        const isFocused = focusedIdx === i;
        return (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-zinc-500 w-6 text-right shrink-0 select-none">
                {marker}
              </span>
              <input
                ref={(el) => {
                  refs.current[i] = el;
                }}
                value={item}
                onChange={(e) => set(i, e.target.value)}
                onFocus={() => setFocusedIdx(i)}
                onBlur={() => setTimeout(() => setFocusedIdx((c) => (c === i ? null : c)), 100)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addAfter(i);
                  } else if (e.key === 'Backspace' && item === '') {
                    e.preventDefault();
                    removeAt(i);
                  } else if (e.key === 'ArrowUp' && (e.currentTarget.selectionStart ?? 0) === 0) {
                    e.preventDefault();
                    refs.current[Math.max(0, i - 1)]?.focus();
                  } else if (
                    e.key === 'ArrowDown' &&
                    (e.currentTarget.selectionStart ?? 0) === e.currentTarget.value.length
                  ) {
                    e.preventDefault();
                    refs.current[Math.min(items.length - 1, i + 1)]?.focus();
                  }
                }}
                placeholder={`Item ${i + 1}`}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brl-dark"
              />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="shrink-0 w-6 h-6 grid place-items-center text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded"
                title="Remover item"
                tabIndex={-1}
              >
                <X size={12} />
              </button>
            </div>
            {isFocused && (
              <div className="ml-7">
                <MdToolbar
                  size="sm"
                  getEl={() => refs.current[i]}
                  onChange={(v) => set(i, v)}
                />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => addAfter(items.length - 1)}
        className="ml-7 text-xs text-zinc-500 hover:text-brl-dark inline-flex items-center gap-1"
      >
        + Adicionar item
      </button>
    </div>
  );
}

function ImageUploader({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const res = await uploadEmailImage(fd);
      if (!res.ok || !res.url) {
        setError(res.error ?? 'Upload falhou');
      } else {
        onChange(res.url);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-zinc-600">Imagem</div>

      {/* Preview */}
      <div className="aspect-[4/3] rounded-md border border-zinc-200 bg-zinc-50 grid place-items-center overflow-hidden">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Preview" className="max-w-full max-h-full object-contain" />
        ) : (
          <div className="text-center text-zinc-400 text-xs px-3">
            <ImageIcon size={28} className="mx-auto mb-1" />
            Nenhuma imagem
          </div>
        )}
      </div>

      {/* Upload action row */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-2 text-xs hover:bg-brl-yellow-hover disabled:opacity-50"
        >
          <Upload size={12} />
          {uploading ? 'Enviando…' : value ? 'Trocar imagem' : 'Enviar imagem'}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={uploading}
            className="rounded-md border border-zinc-300 bg-white px-2 py-2 text-xs hover:bg-zinc-50 disabled:opacity-50"
            title="Remover imagem"
          >
            <X size={12} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = ''; // allow re-uploading the same filename
        }}
      />

      {error && <p className="text-[11px] text-brl-error">{error}</p>}

      {/* URL fallback (collapsed by default — most users never need this) */}
      <button
        type="button"
        onClick={() => setShowUrl((v) => !v)}
        className="text-[11px] text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
      >
        <LinkIcon size={10} />
        {showUrl ? 'Ocultar URL' : 'Usar URL externa'}
      </button>
      {showUrl && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…"
          className={inputCls}
        />
      )}
      <p className="text-[10px] text-zinc-400">PNG, JPG, SVG, WebP ou GIF · até 10MB</p>
    </div>
  );
}

/**
 * Per-block formatting: bold, italic, font-size. Compact toolbar-style row.
 * `defaultFontSize` is shown as the placeholder in the size input so the
 * user can see what value will be used when the override field is empty.
 */
function FormattingRow({
  bold,
  italic,
  fontSize,
  defaultFontSize,
  onBold,
  onItalic,
  onFontSize,
}: {
  bold: boolean;
  italic: boolean;
  fontSize: number | null;
  defaultFontSize: number;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
  onFontSize: (v: number | undefined) => void;
}) {
  return (
    <Field label="Format">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onBold(!bold)}
          aria-pressed={bold}
          className={cn(
            'w-9 h-9 rounded-md border text-sm font-bold transition',
            bold ? 'bg-brl-yellow border-brl-yellow text-brl-dark' : 'border-zinc-300 bg-white hover:bg-zinc-50',
          )}
          title="Negrito"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => onItalic(!italic)}
          aria-pressed={italic}
          className={cn(
            'w-9 h-9 rounded-md border text-sm italic transition',
            italic ? 'bg-brl-yellow border-brl-yellow text-brl-dark' : 'border-zinc-300 bg-white hover:bg-zinc-50',
          )}
          title="Itálico"
        >
          I
        </button>
        <div className="flex items-center gap-1 ml-2 flex-1">
          <span className="text-[10px] text-zinc-500">Tamanho</span>
          <input
            type="number"
            min={9}
            max={72}
            value={fontSize ?? ''}
            placeholder={String(defaultFontSize)}
            onChange={(e) => {
              const v = e.target.value;
              onFontSize(v === '' ? undefined : Math.max(9, Math.min(72, parseInt(v, 10) || defaultFontSize)));
            }}
            className="w-16 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brl-dark"
          />
          <span className="text-[10px] text-zinc-500">px</span>
        </div>
      </div>
    </Field>
  );
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
  const kit = useContext(BrandKitContext);
  const swatches = kit ? kitPalette(kit) : [];
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded border border-zinc-300 cursor-pointer" />
          <input value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
        </div>
        {swatches.length > 0 && (
          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="text-[10px] text-zinc-500 mr-0.5">Kit:</span>
            {swatches.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onChange(s.value)}
                title={`${s.label}: ${s.value}`}
                className={cn(
                  'w-5 h-5 rounded-full border border-black/15 hover:scale-110 transition shrink-0',
                  value.toLowerCase() === s.value.toLowerCase() && 'ring-2 ring-brl-yellow ring-offset-1',
                )}
                style={{ background: s.value }}
              />
            ))}
          </div>
        )}
      </div>
    </Field>
  );
}
