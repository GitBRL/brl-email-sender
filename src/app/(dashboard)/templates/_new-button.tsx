'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { createTemplate } from './actions';
import { BrandKitPicker } from '@/components/brand-kit-picker';
import type { BrandKit } from '@/lib/brand-kits';

/**
 * Two-step modal for creating a new template:
 *   1. Pick a brand kit
 *   2. Type a name
 * Then redirect into the editor with the kit-themed default doc.
 */
export function NewTemplateButton({ kits }: { kits: BrandKit[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'kit' | 'name'>('kit');
  const [kitId, setKitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setStep('kit');
    setKitId(null);
    setName('');
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!kitId) return setError('Select a brand kit first.');
    const fd = new FormData();
    fd.set('name', name);
    fd.set('brand_kit_id', kitId);
    start(async () => {
      const res = await createTemplate({ ok: false }, fd);
      if (!res.ok || !res.id) setError(res.error ?? 'Failed to create');
      else router.push(`/templates/${res.id}/edit`);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow px-3 py-2 text-sm font-semibold text-brl-dark hover:bg-brl-yellow-hover"
      >
        <Plus size={14} /> New template
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <div>
                <h2 className="text-lg font-semibold">
                  {step === 'kit' ? 'Escolha o produto' : 'Nome do template'}
                </h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {step === 'kit'
                    ? 'O kit define cores, logo e blocos padrão do template.'
                    : `Kit: ${kits.find((k) => k.id === kitId)?.name ?? '—'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="text-zinc-500 hover:text-zinc-900 w-8 h-8 grid place-items-center rounded"
              >
                <X size={18} />
              </button>
            </header>

            <div className="overflow-y-auto p-6 flex-1">
              {step === 'kit' && (
                <BrandKitPicker
                  kits={kits}
                  selectedId={kitId}
                  onSelect={(id) => setKitId(id)}
                />
              )}
              {step === 'name' && (
                <form id="new-tpl-form" onSubmit={submit}>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600 mb-1 block">
                      Nome do template
                    </span>
                    <input
                      autoFocus
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ex. Aviso Salus 2026 — abertura"
                      required
                      className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-brl-dark"
                    />
                  </label>
                  {error && (
                    <p className="mt-3 text-xs text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">
                      {error}
                    </p>
                  )}
                </form>
              )}
            </div>

            <footer className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <button
                type="button"
                onClick={step === 'kit' ? close : () => setStep('kit')}
                className="text-sm text-zinc-600 hover:text-zinc-900"
              >
                {step === 'kit' ? 'Cancelar' : '← Voltar'}
              </button>
              {step === 'kit' ? (
                <button
                  type="button"
                  disabled={!kitId}
                  onClick={() => setStep('name')}
                  className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
                >
                  Continuar →
                </button>
              ) : (
                <button
                  type="submit"
                  form="new-tpl-form"
                  disabled={pending || !name.trim()}
                  className="rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
                >
                  {pending ? 'Criando…' : 'Criar template'}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
