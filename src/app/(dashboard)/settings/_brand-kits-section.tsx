'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { X, Upload, Plus, Trash2, ImageIcon } from 'lucide-react';
import type { BrandKit } from '@/lib/brand-kits';
import {
  updateBrandKit,
  createCustomKit,
  deleteBrandKit,
  uploadKitLogo,
} from './_brand-kit-actions';

/** Hex fields exposed in the editor, in the order they appear in the modal. */
const COLOR_FIELDS = [
  ['color_primary', 'Primary'],
  ['color_secondary', 'Secondary'],
  ['color_background', 'Email background'],
  ['color_text', 'Body text'],
  ['color_header_bg', 'Header background'],
  ['color_cta_bg', 'CTA button bg'],
  ['color_cta_text', 'CTA button text'],
  ['color_footer_bg', 'Footer background'],
  ['color_footer_text', 'Footer text'],
] as const satisfies ReadonlyArray<[keyof BrandKit & `color_${string}`, string]>;

type ColorKey = (typeof COLOR_FIELDS)[number][0];

export function BrandKitsSection({
  kits,
  canEdit,
  canDelete,
}: {
  kits: BrandKit[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState<BrandKit | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const [pendingDelete, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleDelete(kit: BrandKit) {
    setDeleteError(null);
    if (!confirm(`Apagar o kit "${kit.name}"? Esta ação não pode ser desfeita.`)) return;
    startDelete(async () => {
      const res = await deleteBrandKit(kit.id);
      if (!res.ok) {
        setDeleteError(res.error ?? 'Falha ao apagar');
      } else {
        router.refresh();
      }
    });
  }

  return (
    <section className="bg-white rounded-lg border border-zinc-200">
      <div className="flex items-baseline justify-between p-6 pb-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Brand kits</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Cada kit define cores, logo e blocos padrão aplicados em campanhas e templates desse produto.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-1.5 text-xs hover:bg-brl-yellow-hover"
          >
            <Plus size={12} /> Criar kit personalizado
          </button>
        )}
      </div>

      {deleteError && (
        <div className="mx-6 mb-3 text-xs text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">
          {deleteError}
        </div>
      )}

      <ul className="divide-y divide-zinc-100">
        {kits.map((kit) => (
          <li key={kit.id} className="px-6 py-4 flex items-center gap-4">
            {/* Logo or product-name fallback */}
            <div
              className="w-12 h-12 rounded-md grid place-items-center shrink-0 overflow-hidden border border-black/5"
              style={{ background: kit.color_header_bg }}
            >
              {kit.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={kit.logo_url} alt={kit.name} className="max-w-full max-h-full object-contain" />
              ) : (
                <ImageIcon size={18} className="text-zinc-400" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{kit.name}</span>
                {kit.is_custom && (
                  <span className="text-[9px] font-medium uppercase tracking-wide text-brl-orange bg-orange-50 px-1.5 py-0.5 rounded">
                    Custom
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-500 font-mono">{kit.slug}</div>
              <div className="flex items-center gap-1.5 mt-1.5">
                {COLOR_FIELDS.slice(0, 6).map(([k]) => (
                  <span
                    key={k}
                    className="inline-block w-3.5 h-3.5 rounded-full border border-black/10"
                    style={{ background: kit[k] as string }}
                    title={`${k}: ${kit[k]}`}
                  />
                ))}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(kit)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs hover:bg-zinc-50"
                >
                  Editar
                </button>
              )}
              {canDelete && kit.is_custom && (
                <button
                  type="button"
                  disabled={pendingDelete}
                  onClick={() => handleDelete(kit)}
                  className="rounded-md border border-red-200 bg-white text-red-700 px-2 py-1.5 text-xs hover:bg-red-50 disabled:opacity-50"
                  aria-label={`Apagar kit ${kit.name}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <KitEditModal
          kit={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {creating && (
        <KitEditModal
          kit={null}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Edit / create modal
// --------------------------------------------------------------------------

function KitEditModal({
  kit,
  onClose,
  onSaved,
}: {
  kit: BrandKit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = kit === null;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'logo_url' | 'logo_dark_url' | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const darkFileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();

  const [form, setForm] = useState<{
    name: string;
    slug: string;
    logo_url: string | null;
    logo_dark_url: string | null;
  } & Record<ColorKey, string>>(() => ({
    name: kit?.name ?? '',
    slug: kit?.slug ?? '',
    logo_url: kit?.logo_url ?? null,
    logo_dark_url: kit?.logo_dark_url ?? null,
    color_primary: kit?.color_primary ?? '#FFCD01',
    color_secondary: kit?.color_secondary ?? '#2B2B2B',
    color_background: kit?.color_background ?? '#FFFFFF',
    color_text: kit?.color_text ?? '#2B2B2B',
    color_header_bg: kit?.color_header_bg ?? '#2B2B2B',
    color_cta_bg: kit?.color_cta_bg ?? '#FFCD01',
    color_cta_text: kit?.color_cta_text ?? '#2B2B2B',
    color_footer_bg: kit?.color_footer_bg ?? '#2B2B2B',
    color_footer_text: kit?.color_footer_text ?? '#FFFFFF',
  }));

  function set<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function save() {
    setError(null);
    start(async () => {
      const payload = { ...form };
      const res = isNew
        ? await createCustomKit(payload)
        : await updateBrandKit(kit!.id, payload);
      if (!res.ok) return setError(res.error ?? 'Falha ao salvar');
      onSaved();
    });
  }

  async function uploadLogo(kind: 'logo_url' | 'logo_dark_url', file: File) {
    if (!kit) {
      setError('Salve o kit primeiro antes de enviar a logo.');
      return;
    }
    setError(null);
    setUploading(kind);
    const fd = new FormData();
    fd.set('kit_id', kit.id);
    fd.set('kind', kind);
    fd.set('file', file);
    const res = await uploadKitLogo(fd);
    setUploading(null);
    if (!res.ok) return setError(res.error ?? 'Upload failed');
    if (res.url) set(kind, res.url);
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div>
            <h2 className="text-lg font-semibold">
              {isNew ? 'Novo kit personalizado' : `Editar kit — ${kit?.name}`}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {isNew
                ? 'Defina nome, slug e identidade visual completa.'
                : 'Ajustes aqui se aplicam a futuros templates/campanhas; templates existentes mantêm a cópia capturada no momento da criação.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-900 w-8 h-8 grid place-items-center rounded"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </header>

        <div className="overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 flex-1">
          {/* Form */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 mb-1 block">Nome</span>
                <input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={inputCls}
                  placeholder="ex. Turbo"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600 mb-1 block">
                  Slug{' '}
                  <span className="text-zinc-400 font-normal">(somente letras / números / -)</span>
                </span>
                <input
                  value={form.slug}
                  onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  className={inputCls + ' font-mono'}
                  placeholder="turbo"
                  disabled={!isNew}
                />
              </label>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                Cores ({COLOR_FIELDS.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {COLOR_FIELDS.map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-medium text-zinc-600 mb-1 block">{label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                        className="w-9 h-9 rounded border border-zinc-300 cursor-pointer shrink-0"
                      />
                      <input
                        value={form[key]}
                        onChange={(e) => set(key, e.target.value)}
                        className={inputCls + ' font-mono uppercase'}
                        spellCheck={false}
                      />
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Logos</h3>
              <div className="grid grid-cols-2 gap-3">
                <LogoUploader
                  label="Logo padrão"
                  hint="PNG ou SVG, fundo transparente"
                  url={form.logo_url}
                  uploading={uploading === 'logo_url'}
                  onClickUpload={() => fileInputRef.current?.click()}
                  onRemove={() => set('logo_url', null)}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo('logo_url', f);
                    e.currentTarget.value = '';
                  }}
                />
                <LogoUploader
                  label="Logo variante (dark)"
                  hint="Versão para fundo claro (opcional)"
                  url={form.logo_dark_url}
                  uploading={uploading === 'logo_dark_url'}
                  onClickUpload={() => darkFileInputRef.current?.click()}
                  onRemove={() => set('logo_dark_url', null)}
                />
                <input
                  ref={darkFileInputRef}
                  type="file"
                  accept="image/png,image/svg+xml,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadLogo('logo_dark_url', f);
                    e.currentTarget.value = '';
                  }}
                />
              </div>
              {isNew && (
                <p className="text-[11px] text-zinc-500 mt-2">
                  Salve o kit primeiro para liberar o upload de logos.
                </p>
              )}
            </div>
          </div>

          {/* Live preview */}
          <aside className="lg:sticky lg:top-0 self-start">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2">Preview</h3>
            <MiniEmailPreview form={form} />
          </aside>
        </div>

        <footer className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
          <div className="text-xs text-brl-error min-h-[1rem]">{error ?? ''}</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900 px-3 py-2">
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
            >
              {pending ? 'Salvando…' : isNew ? 'Criar kit' : 'Salvar alterações'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sub-components
// --------------------------------------------------------------------------

function LogoUploader({
  label,
  hint,
  url,
  uploading,
  onClickUpload,
  onRemove,
}: {
  label: string;
  hint: string;
  url: string | null;
  uploading: boolean;
  onClickUpload: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-3 bg-white">
      <div className="text-xs font-medium text-zinc-700">{label}</div>
      <div className="text-[10px] text-zinc-500 mb-2">{hint}</div>
      <div className="aspect-[3/1] rounded bg-zinc-100 grid place-items-center mb-2 overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Logo preview" className="max-w-[90%] max-h-[90%] object-contain" />
        ) : (
          <ImageIcon size={20} className="text-zinc-400" />
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClickUpload}
          disabled={uploading}
          className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs hover:bg-zinc-50 disabled:opacity-50"
        >
          <Upload size={12} /> {uploading ? 'Enviando…' : url ? 'Trocar' : 'Enviar'}
        </button>
        {url && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-xs hover:bg-zinc-50"
            aria-label="Remover logo"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Mini preview of how the kit's colors render in an actual email. */
function MiniEmailPreview({ form }: { form: Record<ColorKey, string> & { name: string; logo_url: string | null } }) {
  return (
    <div className="rounded-md border border-zinc-200 overflow-hidden text-xs">
      {/* Header */}
      <div className="px-4 py-3 grid place-items-center" style={{ background: form.color_header_bg }}>
        {form.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.logo_url} alt={form.name} className="max-h-8 max-w-[60%] object-contain" />
        ) : (
          <span
            className="font-bold tracking-tight"
            style={{
              color: form.color_header_bg.toLowerCase() === '#ffffff' ? form.color_primary : form.color_cta_text,
            }}
          >
            {form.name || 'PRODUCT'}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-4 py-5" style={{ background: form.color_background, color: form.color_text }}>
        <div className="font-bold text-sm mb-1.5" style={{ color: form.color_text }}>
          Assunto principal do email
        </div>
        <p className="text-[11px] leading-snug opacity-80">
          Descrição de apoio em uma ou duas linhas. O corpo do email usa esta cor de texto sobre o fundo configurado.
        </p>
        <div className="mt-3 flex justify-center">
          <span
            className="inline-block rounded px-4 py-2 text-[11px] font-semibold"
            style={{ background: form.color_cta_bg, color: form.color_cta_text }}
          >
            Quero saber mais →
          </span>
        </div>
        <div className="mt-4 h-px" style={{ background: form.color_primary, opacity: 0.3 }} />
      </div>
      {/* Footer */}
      <div className="px-4 py-2.5 text-center" style={{ background: form.color_footer_bg, color: form.color_footer_text }}>
        <div className="text-[10px]">© {new Date().getFullYear()} {form.name || 'Product'} · BRL Educação</div>
        <div className="text-[9px] opacity-70 mt-0.5">Cancelar inscrição</div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brl-dark';
