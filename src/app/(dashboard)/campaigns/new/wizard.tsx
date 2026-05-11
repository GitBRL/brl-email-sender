'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, Users, Send, Settings, Palette, Sparkles, Megaphone, Tag, Rocket } from 'lucide-react';
import { createCampaign, updateCampaign, previewRecipients, sendCampaign, useStarterForCampaign } from '../actions';
import type { ContactTag } from '@/types';
import { cn } from '@/lib/utils';
import type { BrandKit } from '@/lib/brand-kits';
import { BrandKitPicker } from '@/components/brand-kit-picker';

type Template = { id: string; name: string; updated_at: string; brand_kit_id: string | null };
type List = { id: string; name: string; contact_count: number };
type StarterMeta = { id: string; name: string; description: string; category: string };

const STEPS = ['Kit', 'Settings', 'Template', 'Audience', 'Review'] as const;
type Step = (typeof STEPS)[number];

/** Match a starter to a Lucide icon based on its built-in id suffix. */
function starterIcon(id: string) {
  if (id.includes('announcement') || id.includes('message')) return Megaphone;
  if (id.includes('promo')) return Tag;
  if (id.includes('launch')) return Rocket;
  return Sparkles;
}

export function Wizard({
  templates,
  lists,
  kits,
  starters,
  defaultFromName,
  defaultFromEmail,
}: {
  templates: Template[];
  lists: List[];
  kits: BrandKit[];
  starters: StarterMeta[];
  defaultFromName: string;
  defaultFromEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('Kit');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [brandKitId, setBrandKitId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState(defaultFromName);
  const [fromEmail, setFromEmail] = useState(defaultFromEmail);
  const [replyTo, setReplyTo] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [starterId, setStarterId] = useState<string | null>(null);
  const [listIds, setListIds] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<ContactTag | ''>('');

  // Filter the templates shown in step 'Template' to those matching the
  // selected brand kit (plus templates with no kit, since they're brand-agnostic).
  const eligibleTemplates = brandKitId
    ? templates.filter((t) => !t.brand_kit_id || t.brand_kit_id === brandKitId)
    : templates;
  const selectedKit = brandKitId ? kits.find((k) => k.id === brandKitId) ?? null : null;

  // Recipient preview
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [recipientSample, setRecipientSample] = useState<string[]>([]);

  // Refresh recipient preview when audience changes (in step 4)
  useEffect(() => {
    if (step !== 'Review') return;
    let cancelled = false;
    previewRecipients(listIds, (filterTag || null) as ContactTag | null).then((r) => {
      if (cancelled) return;
      setRecipientCount(r.count);
      setRecipientSample(r.sample);
    });
    return () => { cancelled = true; };
  }, [step, listIds, filterTag]);

  function gotoTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('name', name);
    fd.set('subject', subject);
    fd.set('from_name', fromName);
    fd.set('from_email', fromEmail);
    fd.set('reply_to', replyTo);
    if (brandKitId) fd.set('brand_kit_id', brandKitId);
    start(async () => {
      if (campaignId) {
        const res = await updateCampaign(campaignId, {
          name, subject, from_name: fromName, from_email: fromEmail, reply_to: replyTo || null,
          brand_kit_id: brandKitId,
        });
        if (!res.ok) return setError(res.error ?? 'Failed to save');
      } else {
        const res = await createCampaign({ ok: false }, fd);
        if (!res.ok || !res.id) return setError(res.error ?? 'Failed to create');
        setCampaignId(res.id);
      }
      setStep('Template');
    });
  }

  function gotoAudience() {
    setError(null);
    if (!templateId && !starterId) return setError('Escolha um modelo ou template antes de continuar.');
    start(async () => {
      // Two paths: a starter is cloned + themed + linked in one server action;
      // an existing template is linked directly via updateCampaign.
      if (starterId) {
        const res = await useStarterForCampaign(campaignId!, starterId);
        if (!res.ok) return setError(res.error ?? 'Failed to apply starter');
      } else {
        const res = await updateCampaign(campaignId!, { template_id: templateId });
        if (!res.ok) return setError(res.error ?? 'Failed to save');
      }
      setStep('Audience');
    });
  }

  function gotoReview() {
    setError(null);
    start(async () => {
      const res = await updateCampaign(campaignId!, {
        list_ids: listIds,
        filter_tag: (filterTag || null) as ContactTag | null,
      });
      if (!res.ok) return setError(res.error ?? 'Failed to save');
      setStep('Review');
    });
  }

  function send() {
    if (!campaignId) return;
    if (!confirm(`Send to ${recipientCount ?? '?'} recipient(s)? This cannot be undone.`)) return;
    setError(null);
    start(async () => {
      const res = await sendCampaign(campaignId);
      if (!res.ok) return setError(res.error ?? 'Send failed');
      router.push(`/campaigns/${campaignId}`);
      router.refresh();
    });
  }

  function gotoSettings() {
    setError(null);
    if (!brandKitId) return setError('Selecione um produto antes de continuar.');
    setStep('Settings');
  }

  return (
    <div>
      <Stepper current={step} />

      <div className="bg-white rounded-lg border border-zinc-200 p-6">
        {step === 'Kit' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Selecionar produto</h2>
              <p className="text-sm text-zinc-500 mt-0.5">
                A identidade visual (cores, logo) é aplicada automaticamente no editor.
              </p>
            </div>
            <BrandKitPicker kits={kits} selectedId={brandKitId} onSelect={setBrandKitId} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <span />
              <button
                type="button"
                disabled={!brandKitId}
                onClick={gotoSettings}
                className={primaryBtn}
              >
                Continuar →
              </button>
            </Footer>
          </div>
        )}

        {step === 'Settings' && (
          <form onSubmit={gotoTemplate} className="space-y-4">
            <Field label="Campaign name (internal)">
              <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} placeholder="e.g. Salus Online — Outubro 2026" />
            </Field>
            <Field label="Subject line">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} required className={inputCls} placeholder='You can use {{name}} for personalisation' />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From name">
                <input value={fromName} onChange={(e) => setFromName(e.target.value)} required className={inputCls} />
              </Field>
              <Field label="From email">
                <input type="email" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} required className={inputCls} />
              </Field>
            </div>
            <Field label="Reply-to (optional)">
              <input type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} className={inputCls} placeholder="leave blank to use From email" />
            </Field>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Kit')} className={secondaryBtn}>← Voltar</button>
              <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Saving…' : 'Continue →'}</button>
            </Footer>
          </form>
        )}

        {step === 'Template' && (
          <div className="space-y-5">
            {/* Starter templates — auto-themed with the chosen kit on selection */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5">
                <Sparkles size={12} className="text-brl-yellow" />
                Modelos prontos
                {selectedKit && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium normal-case tracking-normal text-zinc-600">
                    pré-configurados para
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                      style={{
                        background: selectedKit.color_header_bg,
                        color:
                          selectedKit.color_header_bg.toLowerCase() === '#ffffff'
                            ? selectedKit.color_primary
                            : selectedKit.color_cta_text,
                      }}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: selectedKit.color_primary }}
                      />
                      {selectedKit.name}
                    </span>
                  </span>
                )}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {starters.map((s) => {
                  const Icon = starterIcon(s.id);
                  const isSelected = starterId === s.id;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setStarterId(s.id);
                          setTemplateId(null); // mutually exclusive with custom template
                        }}
                        className={cn(
                          'w-full text-left rounded-lg border-2 overflow-hidden transition bg-white',
                          isSelected ? 'border-brl-yellow shadow-md' : 'border-zinc-200 hover:border-zinc-300',
                        )}
                      >
                        {/* Themed mini-preview */}
                        <StarterPreview kit={selectedKit} variant={s.id} />
                        <div className="p-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} className="text-zinc-500 shrink-0" />
                            <div className="font-semibold text-sm truncate">{s.name}</div>
                            {isSelected && (
                              <Check size={14} className="ml-auto text-brl-yellow shrink-0" strokeWidth={3} />
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2">{s.description}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* User templates (only shown if any exist) */}
            {eligibleTemplates.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2 flex items-center gap-1.5">
                  <FileText size={12} />
                  Seus templates salvos
                </h3>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {eligibleTemplates.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setTemplateId(t.id);
                          setStarterId(null);
                        }}
                        className={cn(
                          'w-full text-left rounded-lg border-2 p-4 hover:border-brl-yellow transition flex gap-3 items-center',
                          templateId === t.id ? 'border-brl-yellow bg-brl-yellow/10' : 'border-zinc-200 bg-white',
                        )}
                      >
                        <FileText size={18} className="text-zinc-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{t.name}</div>
                          <div className="text-xs text-zinc-500">
                            Atualizado em {new Date(t.updated_at).toLocaleDateString('pt-BR')}
                          </div>
                        </div>
                        {templateId === t.id && <Check size={14} className="text-brl-yellow shrink-0" strokeWidth={3} />}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Settings')} className={secondaryBtn}>← Voltar</button>
              <button
                type="button"
                disabled={pending || (!templateId && !starterId)}
                onClick={gotoAudience}
                className={primaryBtn}
              >
                {pending ? 'Salvando…' : 'Continuar →'}
              </button>
            </Footer>
          </div>
        )}

        {step === 'Audience' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-2">Lists</h3>
              {lists.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  No lists yet (you can still send to all subscribed contacts via tag filter).{' '}
                  <a href="/lists" className="underline">Create lists →</a>
                </p>
              ) : (
                <div className="space-y-1">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm py-1">
                      <input
                        type="checkbox"
                        checked={listIds.includes(l.id)}
                        onChange={(e) => {
                          setListIds((prev) =>
                            e.target.checked ? [...prev, l.id] : prev.filter((x) => x !== l.id),
                          );
                        }}
                        className="accent-brl-yellow"
                      />
                      <span className="font-medium">{l.name}</span>
                      <span className="text-xs text-zinc-500">({l.contact_count})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Filter by tag (optional)</h3>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value as ContactTag | '')} className={inputCls}>
                <option value="">All tags</option>
                <option value="hot">hot only</option>
                <option value="warm">warm only</option>
                <option value="cold">cold only</option>
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                Leave both empty to send to every subscribed contact.
              </p>
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Template')} className={secondaryBtn}>← Back</button>
              <button type="button" disabled={pending} onClick={gotoReview} className={primaryBtn}>{pending ? 'Saving…' : 'Continue →'}</button>
            </Footer>
          </div>
        )}

        {step === 'Review' && (
          <div className="space-y-4">
            <Stat label="Recipients" value={recipientCount === null ? '—' : recipientCount.toLocaleString('pt-BR')} />
            {recipientSample.length > 0 && (
              <p className="text-xs text-zinc-500">
                e.g. {recipientSample.slice(0, 3).join(', ')}{recipientSample.length > 3 ? '…' : ''}
              </p>
            )}
            <dl className="bg-zinc-50 rounded-md border border-zinc-200 p-4 text-sm divide-y divide-zinc-200">
              <Row label="Subject" value={subject} />
              <Row label="From" value={`${fromName} <${fromEmail}>`} />
              {replyTo && <Row label="Reply-to" value={replyTo} />}
              <Row
                label="Template"
                value={
                  templateId
                    ? templates.find((t) => t.id === templateId)?.name ?? '—'
                    : starterId
                      ? `${starters.find((s) => s.id === starterId)?.name ?? 'Modelo'} (auto-temado)`
                      : '—'
                }
              />
              <Row label="Lists" value={listIds.length === 0 ? 'all' : `${listIds.length} selected`} />
              <Row label="Tag filter" value={filterTag || 'all'} />
            </dl>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Audience')} className={secondaryBtn}>← Back</button>
              <button
                type="button"
                disabled={pending || !recipientCount}
                onClick={send}
                className="inline-flex items-center gap-1 rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50"
              >
                <Send size={14} /> {pending ? 'Sending…' : `Send now`}
              </button>
            </Footer>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  const ICONS = [Palette, Settings, FileText, Users, Send];
  return (
    <ol className="flex items-center mb-6 text-xs">
      {STEPS.map((s, i) => {
        const Icon = ICONS[i];
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s} className="flex items-center flex-1">
            <span
              className={cn(
                'w-7 h-7 rounded-full grid place-items-center shrink-0',
                done ? 'bg-brl-yellow text-brl-dark' : active ? 'bg-brl-dark text-white' : 'bg-zinc-200 text-zinc-500',
              )}
            >
              {done ? <Check size={14} /> : <Icon size={14} />}
            </span>
            <span className={cn('ml-2 mr-3 font-medium', active ? 'text-brl-dark' : 'text-zinc-500')}>{s}</span>
            {i < STEPS.length - 1 && <span className={cn('flex-1 h-px', i < idx ? 'bg-brl-yellow' : 'bg-zinc-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium text-right truncate max-w-md">{value}</dd>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-brl-yellow/10 border border-brl-yellow/40 rounded-md p-4">
      <div className="text-xs uppercase tracking-wide text-brl-dark/60">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}
function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-between pt-4 border-t border-zinc-100">{children}</div>;
}
function ErrorBox({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-brl-error bg-red-50 border border-red-100 rounded px-3 py-2">{children}</p>;
}

/**
 * Stylised mini preview of a starter template, themed with the currently
 * selected brand kit. Each variant draws a tiny stand-in for the actual
 * template's structure (announcement / promo / launch) so the user can pick
 * by visual rhythm rather than reading three card titles.
 */
function StarterPreview({ kit, variant }: { kit: BrandKit | null; variant: string }) {
  const colors = {
    headerBg: kit?.color_header_bg ?? '#2b2b2b',
    bg: kit?.color_background ?? '#ffffff',
    text: kit?.color_text ?? '#2b2b2b',
    ctaBg: kit?.color_cta_bg ?? '#ffcd01',
    ctaText: kit?.color_cta_text ?? '#2b2b2b',
    primary: kit?.color_primary ?? '#ffcd01',
  };

  // ---- Promo variant: big top banner + centered headline + CTA ----
  if (variant.includes('promo')) {
    return (
      <div className="aspect-[3/2]" style={{ background: colors.bg }}>
        <div className="h-1/3 grid place-items-center" style={{ background: colors.primary }}>
          <span className="text-[8px] font-bold text-white/90 tracking-wider">OFERTA</span>
        </div>
        <div className="px-3 py-2 space-y-1">
          <div className="h-1.5 rounded w-3/4 mx-auto" style={{ background: colors.text, opacity: 0.75 }} />
          <div className="h-1 rounded w-1/2 mx-auto" style={{ background: colors.text, opacity: 0.35 }} />
          <div className="h-1 rounded w-2/3 mx-auto" style={{ background: colors.text, opacity: 0.35 }} />
          <div className="pt-1 grid place-items-center">
            <span
              className="inline-block rounded text-[7px] font-bold px-2 py-1"
              style={{ background: colors.ctaBg, color: colors.ctaText }}
            >
              GARANTIR
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---- Launch variant: header bar + tagline + image placeholder + 3 features + CTA ----
  if (variant.includes('launch')) {
    return (
      <div className="aspect-[3/2]" style={{ background: colors.bg }}>
        <div className="px-3 pt-2 space-y-1">
          <div className="h-1 rounded w-1/3 mx-auto" style={{ background: colors.text, opacity: 0.3 }} />
          <div className="h-2 rounded w-2/3 mx-auto" style={{ background: colors.text, opacity: 0.8 }} />
        </div>
        <div className="mx-3 mt-1.5 h-8 rounded grid place-items-center" style={{ background: colors.primary, opacity: 0.85 }}>
          <span className="text-[7px] text-white/80 font-medium">imagem</span>
        </div>
        <div className="px-3 py-1 space-y-0.5">
          <div className="h-1 rounded w-2/3" style={{ background: colors.text, opacity: 0.55 }} />
          <div className="h-1 rounded w-1/2" style={{ background: colors.text, opacity: 0.55 }} />
          <div className="h-1 rounded w-3/5" style={{ background: colors.text, opacity: 0.55 }} />
        </div>
      </div>
    );
  }

  // ---- Default (announcement) variant: logo + headline + 2 paragraphs + CTA ----
  return (
    <div className="aspect-[3/2]" style={{ background: colors.bg }}>
      <div className="h-7 grid place-items-center" style={{ background: colors.headerBg }}>
        {kit?.logo_url ? (
          <img src={kit.logo_url} alt="" className="max-h-4 max-w-[60%] object-contain" />
        ) : (
          <span
            className="text-[7px] font-bold tracking-tight"
            style={{ color: colors.headerBg.toLowerCase() === '#ffffff' ? colors.primary : colors.ctaText }}
          >
            {kit?.name?.toUpperCase() ?? 'BRAND'}
          </span>
        )}
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="h-1.5 rounded w-3/4" style={{ background: colors.text, opacity: 0.8 }} />
        <div className="h-1 rounded w-full" style={{ background: colors.text, opacity: 0.35 }} />
        <div className="h-1 rounded w-5/6" style={{ background: colors.text, opacity: 0.35 }} />
        <div className="pt-1">
          <span
            className="inline-block rounded text-[7px] font-bold px-2 py-1"
            style={{ background: colors.ctaBg, color: colors.ctaText }}
          >
            Saiba mais
          </span>
        </div>
      </div>
    </div>
  );
}

const inputCls = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark';
const primaryBtn = 'rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50';
const secondaryBtn = 'rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm hover:bg-zinc-50';
