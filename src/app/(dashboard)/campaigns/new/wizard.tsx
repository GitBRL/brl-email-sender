'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check, FileText, Users, Send, Settings, Palette, Sparkles, Megaphone, Tag, Rocket,
  Pencil, ExternalLink, RefreshCw, Upload, Mail,
} from 'lucide-react';
import {
  createCampaign, updateCampaign, previewRecipients, sendCampaign,
  useStarterForCampaign, getCampaignPreviewHtml, sendTestEmail,
} from '../actions';
import type { ContactTag } from '@/types';
import { cn } from '@/lib/utils';
import type { BrandKit } from '@/lib/brand-kits';
import { BrandKitPicker } from '@/components/brand-kit-picker';

type Template = { id: string; name: string; updated_at: string; brand_kit_id: string | null };
type List = { id: string; name: string; contact_count: number };
type StarterMeta = { id: string; name: string; description: string; category: string };

const STEPS = ['Kit', 'Settings', 'Template', 'Edit', 'Audience', 'Review'] as const;
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
  // After useStarterForCampaign clones a starter we keep the resulting template
  // id here so the Edit/Review steps can deep-link to /templates/<id>/edit and
  // call getCampaignPreviewHtml() against it.
  const [clonedTemplateId, setClonedTemplateId] = useState<string | null>(null);
  const effectiveTemplateId = templateId ?? clonedTemplateId;

  const [listIds, setListIds] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<ContactTag | ''>('');

  // Live preview state (used by Edit + Review steps)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewSubject, setPreviewSubject] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Send-test field state (Review step)
  const [testEmail, setTestEmail] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [testMessage, setTestMessage] = useState<string | null>(null);

  // Filter the templates shown in step 'Template' to those matching the
  // selected brand kit (plus templates with no kit, since they're brand-agnostic).
  const eligibleTemplates = brandKitId
    ? templates.filter((t) => !t.brand_kit_id || t.brand_kit_id === brandKitId)
    : templates;
  const selectedKit = brandKitId ? kits.find((k) => k.id === brandKitId) ?? null : null;

  /** Re-fetch the rendered HTML for the iframe. Memoised so we can call it
   *  from both useEffect (auto on entering Edit/Review) and from buttons. */
  const refreshPreview = useCallback(async () => {
    if (!campaignId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    const res = await getCampaignPreviewHtml(campaignId);
    setPreviewLoading(false);
    if (!res.ok) {
      setPreviewError(res.error);
      return;
    }
    setPreviewHtml(res.html);
    setPreviewSubject(res.subject);
  }, [campaignId]);

  // Auto-refresh the preview when entering Review (the user may have edited
  // the template in the inline editor on the previous step).
  useEffect(() => {
    if (step === 'Review') refreshPreview();
  }, [step, refreshPreview]);

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

  // After Template selection: persist the choice (clone the starter if needed)
  // and advance to the Edit step where the user customises the rendered email.
  function gotoEdit() {
    setError(null);
    if (!templateId && !starterId) return setError('Escolha um modelo ou template antes de continuar.');
    start(async () => {
      if (starterId) {
        const res = await useStarterForCampaign(campaignId!, starterId);
        if (!res.ok || !res.id) return setError(res.error ?? 'Failed to apply starter');
        setClonedTemplateId(res.id);
        setStarterId(null); // starter is now a real template; future visits use clonedTemplateId
      } else {
        const res = await updateCampaign(campaignId!, { template_id: templateId });
        if (!res.ok) return setError(res.error ?? 'Failed to save');
      }
      setStep('Edit');
    });
  }

  // From Edit step → just advance; the template is already saved
  function gotoAudience() {
    setError(null);
    setStep('Audience');
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
                onClick={gotoEdit}
                className={primaryBtn}
              >
                {pending ? 'Salvando…' : 'Continuar →'}
              </button>
            </Footer>
          </div>
        )}

        {step === 'Edit' && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Edite o template</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Arraste blocos da lateral esquerda, edite no centro, ajuste cores/imagens à direita.
                  Use o botão <strong>Salvar</strong> dentro do editor — depois clique em Continuar.
                </p>
              </div>
              <a
                href={effectiveTemplateId ? `/templates/${effectiveTemplateId}/edit` : '#'}
                target="_blank"
                rel="noreferrer"
                className={secondaryBtn + ' inline-flex items-center gap-1.5 shrink-0'}
                title="Abrir editor em nova aba (tela cheia)"
              >
                <ExternalLink size={13} />
                Tela cheia
              </a>
            </div>

            {/* Inline editor — same component as /templates/[id]/edit, just
                wrapped in an iframe with ?embedded=1 so the dashboard sidebar
                + page header are stripped, leaving only the 3-column editor
                (palette / canvas / properties). Iframe gives perfect CSS
                isolation without refactoring the editor for embedding.

                Sizing: dvh (dynamic viewport height) accounts for mobile
                browser UI chrome that vh doesn't. We subtract ~280px to
                leave room for the wizard's stepper + step header + footer
                buttons, with a generous 640px floor so the 3-column editor
                stays usable. Width 100% lets the editor flex from mobile
                up to the wizard's max-w container. On small viewports the
                iframe scrolls horizontally (the editor needs ~1100px to
                show all 3 columns side-by-side; below that, scroll). */}
            {effectiveTemplateId ? (
              <div className="rounded-md border border-zinc-200 overflow-hidden bg-white">
                <iframe
                  src={`/templates/${effectiveTemplateId}/edit?embedded=1`}
                  title="Editor de template"
                  className="block w-full bg-white"
                  style={{ height: 'min(calc(100dvh - 280px), 1000px)', minHeight: 'min(640px, 70dvh)' }}
                />
              </div>
            ) : (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-8 text-center text-sm text-zinc-500">
                Carregando editor…
              </div>
            )}

            <Footer>
              <button type="button" onClick={() => setStep('Template')} className={secondaryBtn}>← Voltar</button>
              <button type="button" onClick={gotoAudience} className={primaryBtn}>Continuar →</button>
            </Footer>
          </div>
        )}

        {step === 'Audience' && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-sm font-semibold">Listas</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className={secondaryBtn + ' inline-flex items-center gap-1.5'}
                  title="Re-buscar listas após importar"
                >
                  <RefreshCw size={12} /> Atualizar
                </button>
                <a
                  href="/contacts/import"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-3 py-1.5 text-xs hover:bg-brl-yellow-hover"
                >
                  <Upload size={12} /> Importar contatos
                </a>
              </div>
            </div>
            <select
              value={listIds[0] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) setListIds([]);
                else setListIds([v]);
              }}
              className={inputCls}
            >
              <option value="">— Todos os contatos inscritos —</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.contact_count} contatos)
                </option>
              ))}
            </select>
            {lists.length > 1 && (
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer hover:text-zinc-700">Selecionar várias listas</summary>
                <div className="mt-2 space-y-1 pl-2 border-l border-zinc-200">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm py-0.5">
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
              </details>
            )}
            {lists.length === 0 && (
              <p className="text-xs text-zinc-500">
                Nenhuma lista cadastrada ainda. Use <strong>Importar contatos</strong> acima para subir um CSV — ele cria contatos e (opcionalmente) uma lista nova. Você também pode criar listas manualmente em <a href="/lists" target="_blank" className="underline">/lists</a>.
              </p>
            )}
            <div>
              <h3 className="text-sm font-semibold mb-2">Filtrar por tag (opcional)</h3>
              <select value={filterTag} onChange={(e) => setFilterTag(e.target.value as ContactTag | '')} className={inputCls}>
                <option value="">Todas as tags</option>
                <option value="hot">somente hot</option>
                <option value="warm">somente warm</option>
                <option value="cold">somente cold</option>
              </select>
              <p className="text-[11px] text-zinc-500 mt-1">
                Sem lista e sem tag = envia para todos os contatos com status &ldquo;subscribed&rdquo;.
              </p>
            </div>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Edit')} className={secondaryBtn}>← Voltar</button>
              <button type="button" disabled={pending} onClick={gotoReview} className={primaryBtn}>{pending ? 'Salvando…' : 'Continuar →'}</button>
            </Footer>
          </div>
        )}

        {step === 'Review' && (
          <div className="space-y-5">
            {/* Top bar with primary Send button */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Revisar e enviar</h2>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Veja exatamente como o email vai chegar, envie um teste e dispare a campanha.
                </p>
              </div>
              <button
                type="button"
                disabled={pending || !recipientCount}
                onClick={send}
                className="inline-flex items-center gap-1.5 rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50 shrink-0 shadow-sm"
                title={!recipientCount ? 'Nenhum destinatário corresponde a este público' : `Enviar para ${recipientCount} destinatário(s)`}
              >
                <Send size={14} /> {pending ? 'Enviando…' : `Enviar campanha${recipientCount ? ` (${recipientCount})` : ''}`}
              </button>
            </div>

            {/* Headline counters */}
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Destinatários" value={recipientCount === null ? '—' : recipientCount.toLocaleString('pt-BR')} />
              <div className="bg-zinc-50 border border-zinc-200 rounded-md p-4">
                <div className="text-xs uppercase tracking-wide text-zinc-500">Amostra</div>
                <div className="text-xs text-zinc-700 mt-1 leading-snug">
                  {recipientSample.length > 0
                    ? recipientSample.slice(0, 3).join(', ') + (recipientSample.length > 3 ? '…' : '')
                    : '—'}
                </div>
              </div>
            </div>

            {/* Live email preview (iframe — full HTML rendered exactly as it'll be sent) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Preview do email</h3>
                <button
                  type="button"
                  onClick={refreshPreview}
                  disabled={previewLoading}
                  className="text-[11px] text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1"
                >
                  <RefreshCw size={11} className={previewLoading ? 'animate-spin' : ''} />
                  Atualizar
                </button>
              </div>
              <PreviewPane
                html={previewHtml}
                loading={previewLoading}
                error={previewError}
                subject={previewSubject}
                from={`${fromName} <${fromEmail}>`}
              />
            </div>

            {/* Send a test */}
            <div className="rounded-md border border-zinc-200 bg-zinc-50/50 p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 flex items-center gap-1.5 mb-1.5">
                <Mail size={12} /> Enviar teste
              </h3>
              <p className="text-[11px] text-zinc-500 mb-2">
                Envia uma cópia única para o endereço informado. Não cria registro de envio nem afeta as métricas.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!campaignId) {
                    setTestStatus('error');
                    setTestMessage('Campanha ainda não foi salva. Volte para Settings, salve, e tente novamente.');
                    return;
                  }
                  const addr = testEmail.trim();
                  if (!addr) {
                    setTestStatus('error');
                    setTestMessage('Digite um endereço de email.');
                    return;
                  }
                  setTestStatus('sending');
                  setTestMessage(null);
                  sendTestEmail(campaignId, addr)
                    .then((res) => {
                      if (res.ok) {
                        setTestStatus('sent');
                        setTestMessage(`Enviado para ${addr}. Cheque a caixa de entrada (e a pasta de spam).`);
                      } else {
                        setTestStatus('error');
                        setTestMessage(res.error ?? 'Falha no envio (sem detalhes).');
                        // Surface the raw error in the browser console for debugging
                        console.error('[test-send] failed:', res.error);
                      }
                    })
                    .catch((err: unknown) => {
                      // Catches uncaught throws from the server action (network, Resend SDK explosions, etc.)
                      setTestStatus('error');
                      const msg = err instanceof Error ? err.message : String(err);
                      setTestMessage(`Erro inesperado: ${msg}`);
                      console.error('[test-send] uncaught:', err);
                    });
                }}
                className="flex gap-2"
              >
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => {
                    setTestEmail(e.target.value);
                    setTestStatus('idle');
                    setTestMessage(null);
                  }}
                  placeholder="seu-email@exemplo.com"
                  className={inputCls}
                  required
                />
                <button
                  type="submit"
                  disabled={testStatus === 'sending' || !testEmail.trim()}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50 shrink-0 inline-flex items-center gap-1.5"
                >
                  <Send size={13} /> {testStatus === 'sending' ? 'Enviando…' : 'Enviar teste'}
                </button>
              </form>
              {testMessage && (
                <p
                  className={cn(
                    'text-xs mt-2',
                    testStatus === 'sent' ? 'text-emerald-700' : 'text-brl-error',
                  )}
                >
                  {testMessage}
                </p>
              )}
            </div>

            {/* Summary */}
            <details>
              <summary className="text-xs font-semibold uppercase tracking-wide text-zinc-500 cursor-pointer hover:text-zinc-900 mb-2">
                Resumo da campanha
              </summary>
              <dl className="bg-white rounded-md border border-zinc-200 p-4 text-sm divide-y divide-zinc-200 mt-2">
                <Row label="Subject" value={subject} />
                <Row label="From" value={`${fromName} <${fromEmail}>`} />
                {replyTo && <Row label="Reply-to" value={replyTo} />}
                <Row
                  label="Template"
                  value={
                    templateId
                      ? templates.find((t) => t.id === templateId)?.name ?? '—'
                      : clonedTemplateId
                        ? `Modelo ${starters.find((s) => s.id === starterId)?.name ?? ''} (auto-temado)`
                        : '—'
                  }
                />
                <Row label="Listas" value={listIds.length === 0 ? 'todas' : `${listIds.length} selecionada(s)`} />
                <Row label="Tag" value={filterTag || 'todas'} />
              </dl>
            </details>

            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Audience')} className={secondaryBtn}>← Voltar</button>
              <span />
            </Footer>
          </div>
        )}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  const ICONS = [Palette, Settings, FileText, Pencil, Users, Send];
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
 * Browser-frame style preview of the rendered campaign HTML. Uses iframe
 * srcDoc so the email's own <style> tags + tables don't bleed into the
 * surrounding wizard layout. Shows the From/Subject in a fake email header
 * above the iframe so the user has the full visual context.
 */
function PreviewPane({
  html,
  loading,
  error,
  subject,
  from,
}: {
  html: string | null;
  loading: boolean;
  error: string | null;
  subject: string;
  from: string;
}) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
      <div className="border-b border-zinc-100 px-4 py-2.5 bg-zinc-50/60 text-xs space-y-0.5">
        <div className="flex gap-2">
          <span className="text-zinc-500 w-12 shrink-0">From:</span>
          <span className="font-medium text-zinc-800 truncate">{from}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-zinc-500 w-12 shrink-0">Assunto:</span>
          <span className="font-semibold text-zinc-900 truncate">{subject || '(sem assunto)'}</span>
        </div>
      </div>
      <div className="bg-zinc-100 p-4">
        {loading && (
          <div className="h-[600px] grid place-items-center text-sm text-zinc-500">
            <span className="inline-flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Carregando preview…
            </span>
          </div>
        )}
        {!loading && error && (
          <div className="h-[200px] grid place-items-center text-sm text-brl-error">
            {error}
          </div>
        )}
        {!loading && !error && html && (
          <iframe
            srcDoc={html}
            title="Email preview"
            sandbox="allow-same-origin"
            className="w-full h-[680px] bg-white rounded shadow-sm border border-zinc-200"
          />
        )}
      </div>
    </div>
  );
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
