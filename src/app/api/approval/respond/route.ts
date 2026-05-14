/**
 * Public approval-response endpoint. NO AUTH — token is the only gate.
 *
 * Two-step flow to defend against URL-prefetching scanners (Outlook safe links,
 * Microsoft Defender, Bing, Proofpoint, Mimecast, etc. — they GET every URL
 * in incoming mail). The flow:
 *
 *   1. Stakeholder clicks "Aprovar e-mail" / "Tenho modificações" in the
 *      approval email → GET /api/approval/respond?token=X&action=Y
 *      → renders a confirm page with a <form method="POST"> button.
 *      No DB mutation happens on GET.
 *   2. Stakeholder clicks the in-page confirm button → POST same URL with
 *      the token + action in the form body → status committed, internal
 *      notification email fired, success page rendered.
 *
 * Bots only follow GETs, so the worst they can do is render the confirm page
 * with no DB effect. Real humans always make it to the POST step.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { recomputeApprovalStatus } from '@/app/(dashboard)/campaigns/actions';
import { resend, FROM_EMAIL, FROM_NAME, APP_URL } from '@/lib/resend';
import { EMAIL_FONT_STACK } from '@/lib/compile-template';

type Action = 'approved' | 'changes_requested';

function isAction(v: string | null): v is Action {
  return v === 'approved' || v === 'changes_requested';
}

// ---------------- GET: render confirm page ----------------

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token') ?? '';
  const action = searchParams.get('action');

  if (!token || !isAction(action)) {
    return htmlResponse(renderError('Link inválido ou incompleto.'));
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('campaign_approvals')
    .select('id, status, expires_at, stakeholder_name, campaigns(name)')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      status: string;
      expires_at: string;
      stakeholder_name: string | null;
      campaigns: { name: string | null } | null;
    }>();

  if (!row) {
    return htmlResponse(renderError('Este link é inválido ou foi cancelado.'));
  }
  if (row.status !== 'pending') {
    return htmlResponse(
      renderError(`Este link já foi utilizado (resposta atual: ${labelForStatus(row.status)}).`),
    );
  }
  if (new Date(row.expires_at) < new Date()) {
    return htmlResponse(renderError('Este link expirou. Peça à equipe da BRL Educação um novo link.'));
  }

  return htmlResponse(
    renderConfirm({
      action,
      token,
      stakeholderName: row.stakeholder_name,
      campaignName: row.campaigns?.name ?? 'Campanha sem nome',
    }),
  );
}

// ---------------- POST: commit the response ----------------

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get('token') ?? '');
  const action = String(form.get('action') ?? '');
  const feedbackNote = String(form.get('feedback_note') ?? '').trim().slice(0, 2000) || null;

  if (!token || !isAction(action)) {
    return htmlResponse(renderError('Requisição inválida.'));
  }

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from('campaign_approvals')
    .select('id, status, expires_at, campaign_id, stakeholder_name, stakeholder_email, campaigns(id, name, created_by)')
    .eq('token', token)
    .maybeSingle<{
      id: string;
      status: string;
      expires_at: string;
      campaign_id: string;
      stakeholder_name: string | null;
      stakeholder_email: string;
      campaigns: { id: string; name: string | null; created_by: string | null } | null;
    }>();

  if (!row) return htmlResponse(renderError('Token inválido.'));
  if (row.status !== 'pending') {
    return htmlResponse(renderError('Este link já foi utilizado.'));
  }
  if (new Date(row.expires_at) < new Date()) {
    return htmlResponse(renderError('Este link expirou.'));
  }

  // Capture audit metadata
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;
  const ua = req.headers.get('user-agent') ?? null;

  // Commit the response
  const { error: updErr } = await supabase
    .from('campaign_approvals')
    .update({
      status: action,
      feedback_note: feedbackNote,
      responded_at: new Date().toISOString(),
      responder_ip: ip,
      responder_user_agent: ua,
    })
    .eq('id', row.id);
  if (updErr) {
    console.error('[approval/respond] update failed:', updErr);
    return htmlResponse(renderError('Erro ao registrar resposta. Tente novamente em instantes.'));
  }

  // Recompute the campaign-wide approval_status
  await recomputeApprovalStatus(supabase, row.campaign_id);

  // Notify the campaign's owner + all admins
  await sendInternalNotification(supabase, {
    campaignId: row.campaign_id,
    campaignName: row.campaigns?.name ?? 'Campanha sem nome',
    createdBy: row.campaigns?.created_by ?? null,
    stakeholderName: row.stakeholder_name,
    stakeholderEmail: row.stakeholder_email,
    action,
    feedbackNote,
  });

  return htmlResponse(
    action === 'approved'
      ? renderApprovedSuccess(row.stakeholder_name)
      : renderChangesRequestedSuccess(row.stakeholder_name, feedbackNote),
  );
}

// ---------------- Internal notification ----------------

async function sendInternalNotification(
  supabase: ReturnType<typeof createServiceClient>,
  args: {
    campaignId: string;
    campaignName: string;
    createdBy: string | null;
    stakeholderName: string | null;
    stakeholderEmail: string;
    action: Action;
    feedbackNote: string | null;
  },
) {
  // Recipients = campaign creator + every admin profile (deduped)
  const recipients = new Set<string>();
  if (args.createdBy) {
    const { data: creator } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', args.createdBy)
      .maybeSingle();
    if (creator?.email) recipients.add(creator.email);
  }
  const { data: admins } = await supabase
    .from('profiles')
    .select('email')
    .eq('role', 'admin');
  for (const a of admins ?? []) {
    if (a.email) recipients.add(a.email);
  }
  if (recipients.size === 0) return; // Nobody to notify; non-fatal

  const stakeholderLabel = args.stakeholderName
    ? `${args.stakeholderName} <${args.stakeholderEmail}>`
    : args.stakeholderEmail;
  const when = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const link = `${APP_URL}/campaigns/${args.campaignId}`;

  const subject =
    args.action === 'approved'
      ? `✅ Campanha aprovada — ${args.campaignName}`
      : `⚠️ Modificações solicitadas — ${args.campaignName}`;

  const verb = args.action === 'approved' ? 'aprovou' : 'solicitou modificações na';
  const tail =
    args.action === 'approved'
      ? `<p>A campanha está liberada para disparo.</p>`
      : `<p>Entre em contato com o stakeholder para alinhar as alterações.</p>`;
  const noteBlock = args.feedbackNote
    ? `<p style="margin:16px 0 8px 0;"><strong>Observações do stakeholder:</strong></p>
       <blockquote style="margin:0 0 16px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #e5e7eb;color:#374151;white-space:pre-wrap;font-family:${EMAIL_FONT_STACK};">${escapeHtml(args.feedbackNote)}</blockquote>`
    : '';

  const html = `<!DOCTYPE html><html><body style="font-family:${EMAIL_FONT_STACK};color:#2b2b2b;padding:24px;">
    <p><strong>${escapeHtml(stakeholderLabel)}</strong> ${verb} a campanha <strong>${escapeHtml(args.campaignName)}</strong> em ${when}.</p>
    ${noteBlock}
    ${tail}
    <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#ffcd01;color:#2b2b2b;text-decoration:none;border-radius:6px;font-weight:700;">Abrir campanha →</a></p>
  </body></html>`;

  try {
    await resend.emails.send({
      from: `${FROM_NAME} <${FROM_EMAIL}>`,
      to: Array.from(recipients),
      subject,
      html,
    });
  } catch (e) {
    // Don't fail the user-facing request — just log
    console.error('[approval/respond] notification email failed:', e);
  }
}

// ---------------- HTML renderers ----------------

function htmlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const baseStyles = `
  body { font-family: ${EMAIL_FONT_STACK}; margin: 0; background: #f3f4f6; color: #2b2b2b; }
  .card { max-width: 480px; margin: 60px auto; background: #fff; border-radius: 12px; padding: 40px 32px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.06); }
  h1 { font-size: 22px; margin: 16px 0 8px; }
  p { line-height: 1.55; color: #4b5563; }
  .btn { display: inline-block; padding: 14px 28px; border-radius: 8px; font-weight: 700; text-decoration: none; font-size: 16px; cursor: pointer; border: 0; }
  .btn-approve { background: #22c55e; color: #fff; }
  .btn-changes { background: #ffcd01; color: #2b2b2b; }
  .icon { width: 64px; height: 64px; }
  textarea { width: 100%; min-height: 110px; border: 1px solid #d1d5db; border-radius: 8px; padding: 10px 12px; font-family: inherit; font-size: 14px; box-sizing: border-box; resize: vertical; margin-top: 16px; }
  small { color: #9ca3af; font-size: 12px; }
  a.muted { color: #9ca3af; text-decoration: none; }
`;

function shell(body: string): string {
  return `<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>BRL Educação · Aprovação</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />
    <style>${baseStyles}</style>
  </head><body>${body}</body></html>`;
}

function renderConfirm(args: {
  action: Action;
  token: string;
  stakeholderName: string | null;
  campaignName: string;
}): string {
  const isApprove = args.action === 'approved';
  const greeting = args.stakeholderName ? `, <strong>${escapeHtml(args.stakeholderName)}</strong>` : '';
  const title = isApprove ? 'Confirmar aprovação' : 'Solicitar modificações';
  const headline = isApprove
    ? `Você está prestes a <strong>aprovar</strong> a campanha:`
    : `Você está prestes a <strong>solicitar modificações</strong> na campanha:`;
  const btnClass = isApprove ? 'btn-approve' : 'btn-changes';
  const btnLabel = isApprove ? '✓  Confirmar aprovação' : '✎  Confirmar solicitação';

  const feedbackField = isApprove
    ? ''
    : `<label for="feedback" style="display:block;text-align:left;font-size:13px;color:#374151;margin-top:24px;">
         Quer detalhar o que ajustar? <span style="color:#9ca3af;">(opcional)</span>
       </label>
       <textarea id="feedback" name="feedback_note" placeholder="Ex: trocar o título, ajustar a imagem do banner…"></textarea>`;

  return shell(`
    <div class="card">
      <h1>${title}</h1>
      <p>Olá${greeting}.</p>
      <p>${headline}</p>
      <p style="font-weight:700;color:#111827;font-size:16px;margin:8px 0 24px;">${escapeHtml(args.campaignName)}</p>
      <form method="POST" action="/api/approval/respond">
        <input type="hidden" name="token" value="${escapeAttr(args.token)}" />
        <input type="hidden" name="action" value="${escapeAttr(args.action)}" />
        ${feedbackField}
        <div style="margin-top:24px;">
          <button type="submit" class="btn ${btnClass}">${btnLabel}</button>
        </div>
      </form>
      <p style="margin-top:24px;"><small>Esta confirmação adicional protege contra cliques automáticos de scanners de email.</small></p>
    </div>
  `);
}

function renderApprovedSuccess(name: string | null): string {
  const who = (name ?? '').trim();
  return shell(`
    <div class="card">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="11" stroke="#22c55e"/>
        <path d="M7 12l3.5 3.5L17 9"/>
      </svg>
      <h1>Aprovado com sucesso!</h1>
      <p>${who ? `Obrigado, <strong>${escapeHtml(who)}</strong>.` : 'Obrigado.'} Sua aprovação foi registrada.</p>
      <p>A equipe da BRL Educação foi notificada e a campanha está liberada para disparo.</p>
    </div>
  `);
}

function renderChangesRequestedSuccess(name: string | null, note: string | null): string {
  const who = (name ?? '').trim();
  const noteHtml = note
    ? `<p style="margin-top:16px;font-size:13px;color:#374151;text-align:left;background:#f9fafb;padding:12px;border-radius:8px;border:1px solid #e5e7eb;"><strong>Suas observações:</strong><br/>${escapeHtml(note).replace(/\n/g, '<br/>')}</p>`
    : '';
  return shell(`
    <div class="card">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#FFCD01" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 9v4M12 17h.01"/>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      </svg>
      <h1>Feedback registrado!</h1>
      <p>${who ? `Obrigado, <strong>${escapeHtml(who)}</strong>.` : 'Obrigado.'} Sua solicitação de modificações foi registrada.</p>
      <p>A equipe da BRL Educação foi notificada e entrará em contato para alinhar as alterações.</p>
      ${noteHtml}
    </div>
  `);
}

function renderError(message: string): string {
  return shell(`
    <div class="card">
      <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <h1>Ops</h1>
      <p>${escapeHtml(message)}</p>
    </div>
  `);
}

function labelForStatus(s: string): string {
  switch (s) {
    case 'approved': return 'aprovado';
    case 'changes_requested': return 'modificações solicitadas';
    case 'cancelled': return 'cancelado';
    case 'expired': return 'expirado';
    default: return s;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string { return escapeHtml(s); }
