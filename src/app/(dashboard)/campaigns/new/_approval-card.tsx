'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertTriangle, Clock, Send, RefreshCw, Trash2, ShieldCheck } from 'lucide-react';
import {
  requestApproval,
  cancelApproval,
  resendApproval,
  setRequireAllApprovals,
  listApprovals,
  type ApprovalHistoryRow,
} from '../actions';

/**
 * Stakeholder approval card rendered on the Review step of the campaign wizard.
 *
 * Shows:
 *  - A form to send a new approval request (name + email)
 *  - Toggle: 'exigir aprovação de todos' (controls campaign.approval_require_all)
 *  - Live status pill for the current campaign approval state
 *  - Collapsible history of all past requests with cancel/resend actions
 *
 * Polls the approval list on mount + after each mutation; the wizard's
 * router.refresh() also kicks revalidation when the parent page hydrates.
 */
export function ApprovalCard({
  campaignId,
  initialStatus,
  initialRequireAll,
  initialHistory,
  onStatusChange,
}: {
  campaignId: string;
  initialStatus: 'not_required' | 'pending' | 'approved' | 'changes_requested';
  initialRequireAll: boolean;
  initialHistory: ApprovalHistoryRow[];
  /** Notifies the parent (the wizard) every time the visible status changes,
   *  so the Send-button banner + confirm() prompts stay in sync without a
   *  full page reload. */
  onStatusChange?: (next: 'not_required' | 'pending' | 'approved' | 'changes_requested') => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [history, setHistory] = useState<ApprovalHistoryRow[]>(initialHistory);
  const [requireAll, setRequireAll] = useState(initialRequireAll);
  const [status, setStatus] = useState(initialStatus);

  // Re-fetch history after any mutation so the table stays fresh
  async function refresh() {
    const next = await listApprovals(campaignId);
    setHistory(next);
    // Recompute the visible status from the freshest decisive response
    let computed: typeof status;
    const decisive = next.find((r) => r.status === 'approved' || r.status === 'changes_requested');
    if (decisive) computed = decisive.status as typeof status;
    else if (next.some((r) => r.status === 'pending')) computed = 'pending';
    else computed = 'not_required';
    setStatus(computed);
    // Bubble up so the wizard's Send-button banner + confirm() prompts
    // see the new status without waiting for a router.refresh().
    onStatusChange?.(computed);
  }

  // Lightweight polling so a stakeholder's response shows up without a manual reload
  useEffect(() => {
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function send() {
    if (!email.trim()) {
      setError('Informe o email do stakeholder.');
      return;
    }
    setError(null);
    setSuccess(null);
    start(async () => {
      const res = await requestApproval(campaignId, {
        stakeholderName: name.trim() || undefined,
        stakeholderEmail: email.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(`Aprovação enviada para ${email.trim()}.`);
      setName('');
      setEmail('');
      await refresh();
      router.refresh();
    });
  }

  function toggleRequireAll(value: boolean) {
    setRequireAll(value); // optimistic
    start(async () => {
      const res = await setRequireAllApprovals(campaignId, value);
      if (!res.ok) {
        setRequireAll(!value); // rollback
        setError(res.error ?? 'Falha ao salvar.');
      } else {
        await refresh();
        router.refresh();
      }
    });
  }

  function handleCancel(approvalId: string) {
    if (!confirm('Cancelar este pedido de aprovação? O link enviado vai parar de funcionar.')) return;
    start(async () => {
      const res = await cancelApproval(approvalId);
      if (!res.ok) setError(res.error ?? 'Falha ao cancelar.');
      else {
        await refresh();
        router.refresh();
      }
    });
  }

  function handleResend(approvalId: string) {
    if (!confirm('Reenviar a aprovação? O link antigo vai ser cancelado e um novo será gerado.')) return;
    start(async () => {
      const res = await resendApproval(approvalId);
      if (!res.ok) setError(res.error ?? 'Falha ao reenviar.');
      else {
        await refresh();
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-5">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-1">
        <ShieldCheck size={14} className="text-brl-orange" /> Aprovação de Stakeholder
      </h3>
      <p className="text-[11px] text-zinc-500 mb-4">
        Envie o email para um aprovador antes de disparar para a base. O aprovador verá o email idêntico ao preview e poderá aprovar ou solicitar modificações.
      </p>

      <StatusPill status={status} />

      {/* Send form */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome do Stakeholder (opcional)"
          className={inputCls}
        />
        <input
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setError(null);
            setSuccess(null);
          }}
          placeholder="stakeholder@empresa.com"
          className={inputCls}
        />
        <button
          type="button"
          onClick={send}
          disabled={pending || !email.trim()}
          className="rounded-md px-4 py-2 text-sm font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 shrink-0"
          style={{ background: '#2B2B2B', color: '#FFCD01' }}
        >
          <Send size={13} /> {pending ? 'Enviando…' : 'Enviar para Aprovação →'}
        </button>
      </div>

      {/* Multi-stakeholder rule toggle */}
      <label className="mt-3 flex items-center gap-2 text-[11px] text-zinc-600 cursor-pointer">
        <input
          type="checkbox"
          checked={requireAll}
          onChange={(e) => toggleRequireAll(e.target.checked)}
          className="accent-brl-yellow"
        />
        Exigir aprovação de <strong>todos</strong> os stakeholders (em vez de apenas o último)
      </label>

      {success && <p className="text-xs mt-3 text-emerald-700">{success}</p>}
      {error && <p className="text-xs mt-3 text-brl-error">{error}</p>}

      {/* History */}
      {history.length > 0 && (
        <details className="mt-5">
          <summary className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 cursor-pointer hover:text-zinc-900">
            Histórico de aprovações ({history.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-zinc-200">
                  <th className="text-left font-medium py-2 pr-2">Stakeholder</th>
                  <th className="text-left font-medium py-2 pr-2">Enviado</th>
                  <th className="text-left font-medium py-2 pr-2">Status</th>
                  <th className="text-left font-medium py-2 pr-2">Resposta</th>
                  <th className="text-right font-medium py-2 pl-2">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {history.map((row) => (
                  <tr key={row.id}>
                    <td className="py-2 pr-2 align-top">
                      <div className="font-medium">{row.stakeholder_name ?? '—'}</div>
                      <div className="text-[10px] text-zinc-500">{row.stakeholder_email}</div>
                    </td>
                    <td className="py-2 pr-2 align-top text-zinc-600 whitespace-nowrap">
                      {new Date(row.sent_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="py-2 pr-2 align-top">
                      <RowStatusBadge status={row.status} />
                    </td>
                    <td className="py-2 pr-2 align-top text-zinc-600">
                      {row.responded_at
                        ? new Date(row.responded_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
                      {row.feedback_note && (
                        <div className="mt-1 text-[10px] text-zinc-700 italic max-w-xs">
                          “{row.feedback_note}”
                        </div>
                      )}
                    </td>
                    <td className="py-2 pl-2 align-top text-right">
                      {row.status === 'pending' ? (
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleResend(row.id)}
                            disabled={pending}
                            className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-zinc-100 text-zinc-600"
                            title="Reenviar (cancela link antigo + gera novo)"
                          >
                            <RefreshCw size={10} /> Reenviar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancel(row.id)}
                            disabled={pending}
                            className="text-[10px] inline-flex items-center gap-0.5 px-1.5 py-1 rounded hover:bg-red-50 text-red-700"
                            title="Cancelar (link para de funcionar)"
                          >
                            <Trash2 size={10} /> Cancelar
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function StatusPill({
  status,
}: {
  status: 'not_required' | 'pending' | 'approved' | 'changes_requested';
}) {
  if (status === 'not_required') {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 bg-zinc-100 rounded-full px-2.5 py-1">
        <Clock size={11} /> Sem aprovação solicitada
      </div>
    );
  }
  if (status === 'pending') {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
        <Clock size={11} /> Aguardando aprovação
      </div>
    );
  }
  if (status === 'approved') {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
        <CheckCircle2 size={11} /> Aprovado
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
      <AlertTriangle size={11} /> Modificações solicitadas
    </div>
  );
}

function RowStatusBadge({
  status,
}: {
  status: ApprovalHistoryRow['status'];
}) {
  const map: Record<string, { label: string; bg: string; fg: string }> = {
    pending: { label: '🟡 Pendente', bg: '#fef3c7', fg: '#92400e' },
    approved: { label: '🟢 Aprovado', bg: '#d1fae5', fg: '#065f46' },
    changes_requested: { label: '🔴 Modificações', bg: '#fee2e2', fg: '#991b1b' },
    cancelled: { label: '⚫ Cancelado', bg: '#f4f4f5', fg: '#52525b' },
    expired: { label: '⏰ Expirado', bg: '#f4f4f5', fg: '#52525b' },
  };
  const m = map[status] ?? map.pending;
  return (
    <span
      className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: m.bg, color: m.fg }}
    >
      {m.label}
    </span>
  );
}

const inputCls =
  'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-brl-dark';

/** Helper for the wizard to render the Send-button warning + dimming.
 *  Exported separately so the wizard can position it however it wants. */
export function ApprovalSendBanner({
  status,
}: {
  status: 'not_required' | 'pending' | 'approved' | 'changes_requested';
}) {
  if (status === 'not_required' || status === 'approved') return null;
  if (status === 'pending') {
    return (
      <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 mb-2 inline-flex items-center gap-1.5">
        <Clock size={11} />
        Esta campanha ainda não foi aprovada. Você pode disparar mesmo assim, mas recomendamos aguardar a aprovação.
      </p>
    );
  }
  // changes_requested
  return (
    <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-1.5 mb-2 inline-flex items-center gap-1.5">
      <AlertTriangle size={11} />
      Stakeholder solicitou modificações. Disparo não recomendado até alinhar.
    </p>
  );
}

