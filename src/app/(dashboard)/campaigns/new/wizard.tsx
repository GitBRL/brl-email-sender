'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText, Users, Send, Settings } from 'lucide-react';
import { createCampaign, updateCampaign, previewRecipients, sendCampaign } from '../actions';
import type { ContactTag } from '@/types';
import { cn } from '@/lib/utils';

type Template = { id: string; name: string; updated_at: string };
type List = { id: string; name: string; contact_count: number };

const STEPS = ['Settings', 'Template', 'Audience', 'Review'] as const;
type Step = (typeof STEPS)[number];

export function Wizard({
  templates,
  lists,
  defaultFromName,
  defaultFromEmail,
}: {
  templates: Template[];
  lists: List[];
  defaultFromName: string;
  defaultFromEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('Settings');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState(defaultFromName);
  const [fromEmail, setFromEmail] = useState(defaultFromEmail);
  const [replyTo, setReplyTo] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [listIds, setListIds] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<ContactTag | ''>('');

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
    start(async () => {
      if (campaignId) {
        const res = await updateCampaign(campaignId, {
          name, subject, from_name: fromName, from_email: fromEmail, reply_to: replyTo || null,
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
    if (!templateId) return setError('Pick a template first.');
    start(async () => {
      const res = await updateCampaign(campaignId!, { template_id: templateId });
      if (!res.ok) return setError(res.error ?? 'Failed to save');
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

  return (
    <div>
      <Stepper current={step} />

      <div className="bg-white rounded-lg border border-zinc-200 p-6">
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
              <button type="submit" disabled={pending} className={primaryBtn}>{pending ? 'Saving…' : 'Continue →'}</button>
            </Footer>
          </form>
        )}

        {step === 'Template' && (
          <div className="space-y-4">
            {templates.length === 0 ? (
              <p className="text-sm text-zinc-500">No templates yet. <a href="/templates" className="underline">Create one →</a></p>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {templates.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        'w-full text-left rounded-lg border-2 p-4 hover:border-brl-yellow transition flex gap-3 items-center',
                        templateId === t.id ? 'border-brl-yellow bg-brl-yellow/10' : 'border-zinc-200 bg-white',
                      )}
                    >
                      <FileText size={18} className="text-zinc-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium truncate">{t.name}</div>
                        <div className="text-xs text-zinc-500">Updated {new Date(t.updated_at).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && <ErrorBox>{error}</ErrorBox>}
            <Footer>
              <button type="button" onClick={() => setStep('Settings')} className={secondaryBtn}>← Back</button>
              <button type="button" disabled={pending || !templateId} onClick={gotoAudience} className={primaryBtn}>{pending ? 'Saving…' : 'Continue →'}</button>
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
              <Row label="Template" value={templates.find((t) => t.id === templateId)?.name ?? '—'} />
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
  const ICONS = [Settings, FileText, Users, Send];
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

const inputCls = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark';
const primaryBtn = 'rounded-md bg-brl-yellow text-brl-dark font-semibold px-4 py-2 text-sm hover:bg-brl-yellow-hover disabled:opacity-50';
const secondaryBtn = 'rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm hover:bg-zinc-50';
