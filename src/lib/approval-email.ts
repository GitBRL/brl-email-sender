/**
 * Build the email sent to a stakeholder for campaign approval.
 *
 * Wraps the compiled campaign HTML with:
 *   1. Light-grey context header (BRL logo + explainer + campaign name)
 *   2. The actual campaign — exact preview of what will go out, with the
 *      stakeholder's name injected into {{name}} so personalisation reads
 *      correctly. Tracking links are NOT injected (this is a preview, not
 *      a live send) and {{unsubscribe_url}} is replaced with a notice.
 *   3. Approval action card with two big buttons (Approve / Request changes)
 *      pointing at the public respond route under APP_URL
 *   4. Light-grey footer
 *
 * All inline styles for max email-client compatibility. color-scheme:light
 * locks colours so dark-mode-inverting clients (Apple Mail, Gmail) don't
 * flip our header grey to dark.
 */

import { APP_URL } from './resend';
import { EMAIL_FONT_STACK } from './compile-template';

export type ApprovalEmailInput = {
  /** Compiled HTML of the campaign template (`templates.html_content`). */
  campaignHtml: string;
  /** For the context header. */
  campaignName: string;
  /** Stakeholder's name to inject into {{name}} merge tag (optional). */
  stakeholderName: string | null;
  /** Goes into the Approve / Request changes button URLs. */
  token: string;
  /** Optional BRL master logo URL (from brand_kits.logo_url where slug='brl'). */
  brlLogoUrl: string | null;
};

/**
 * Replace merge tags in the compiled campaign HTML with stakeholder-friendly
 * preview values. We don't run the real personalize() pipeline because:
 *  - There's no contact id (stakeholder isn't in contacts)
 *  - Tracking links must NOT be rewritten — preview links should be original
 *  - {{unsubscribe_url}} should show a placeholder, not a live unsub link
 */
function personaliseForPreview(html: string, stakeholderName: string | null): string {
  const name = (stakeholderName ?? '').trim();
  return html
    .replace(/\{\{\s*name\s*\}\}/gi, name || 'Aprovador')
    .replace(/\{\{\s*first_name\s*\}\}/gi, name ? name.split(/\s+/)[0] : 'Aprovador')
    .replace(/\{\{\s*last_name\s*\}\}/gi, name ? name.split(/\s+/).slice(1).join(' ') : '')
    .replace(/\{\{\s*email\s*\}\}/gi, '[email do destinatário]')
    .replace(/\{\{\s*phone\s*\}\}/gi, '')
    .replace(/\{\{\s*company\s*\}\}/gi, '')
    .replace(
      /\{\{\s*unsubscribe_url\s*\}\}/gi,
      'javascript:void(0)" style="color:#9ca3af;cursor:default;pointer-events:none;text-decoration:none" data-disabled="true',
    );
}

/**
 * Strip the html/head/body wrapper from a compiled email so we can inline
 * its inner table into our approval wrapper. Keeps the content table intact,
 * just unwraps the outer <html><body> so we don't end up with nested
 * documents in the approval email.
 */
function extractCampaignBody(html: string): string {
  // Compiled emails always have `<body ...>...</body>`. Pull what's between.
  const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : html;
}

export function buildApprovalEmail(input: ApprovalEmailInput): { html: string; subject: string } {
  const { campaignHtml, campaignName, stakeholderName, token, brlLogoUrl } = input;

  const personalised = personaliseForPreview(campaignHtml, stakeholderName);
  const innerBody = extractCampaignBody(personalised);

  const greetingName = (stakeholderName ?? '').trim();
  const respondUrl = (action: 'approved' | 'changes_requested') =>
    `${APP_URL}/api/approval/respond?token=${encodeURIComponent(token)}&action=${action}`;

  const logoBlock = brlLogoUrl
    ? `<img src="${escapeAttr(brlLogoUrl)}" alt="BRL Educação" width="120" style="display:block;max-height:40px;width:auto;margin:0 auto 16px auto;border:0;outline:none;" />`
    : `<div style="font-family:${EMAIL_FONT_STACK};font-weight:700;font-size:16px;color:#2b2b2b;text-align:center;margin:0 0 16px 0;">BRL Educação</div>`;

  const subject = `[Aprovação] ${campaignName}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />
  <title>${escapeAttr(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${EMAIL_FONT_STACK};color-scheme:light;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;border-collapse:collapse;border-spacing:0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;border-collapse:collapse;border-spacing:0;">

        <!-- Section 1: context header -->
        <tr><td style="background:#f3f4f6;padding:24px;border-radius:8px 8px 0 0;text-align:center;">
          ${logoBlock}
          <p style="margin:0 0 12px 0;font-family:${EMAIL_FONT_STACK};font-size:14px;color:#6b7280;line-height:1.5;">
            Olá${greetingName ? `, <strong>${escapeHtml(greetingName)}</strong>` : ''}.
            Você recebeu este email para revisar e aprovar uma campanha antes do disparo.
          </p>
          <p style="margin:0 0 16px 0;font-family:${EMAIL_FONT_STACK};font-weight:700;font-size:16px;color:#2b2b2b;">
            ${escapeHtml(campaignName)}
          </p>
          <div style="height:1px;background:#e5e7eb;line-height:1px;font-size:1px;">&nbsp;</div>
        </td></tr>

        <!-- Section 2: the campaign (exact preview) -->
        <tr><td style="background:#ffffff;padding:0;">
          ${innerBody}
        </td></tr>

        <!-- Section 3: approval action -->
        <tr><td style="background:#ffffff;padding:32px 24px;border-radius:0 0 8px 8px;">
          <div style="height:2px;background:#e5e7eb;line-height:2px;font-size:1px;margin-bottom:28px;">&nbsp;</div>
          <p style="margin:0 0 24px 0;font-family:${EMAIL_FONT_STACK};text-align:center;font-size:16px;color:#374151;">
            O que você acha desta campanha?
          </p>

          <!-- Two stacked, centred buttons. Use a single-cell table per button so
               Outlook respects the rounded corners + background colour. -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
            <tr><td style="padding:0 0 12px 0;">
              <a href="${escapeAttr(respondUrl('approved'))}"
                 style="display:inline-block;min-width:220px;background:#22c55e;color:#ffffff;font-family:${EMAIL_FONT_STACK};font-weight:700;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:8px;text-align:center;mso-padding-alt:14px 32px;">
                ✓&nbsp;&nbsp;Aprovar e-mail
              </a>
            </td></tr>
            <tr><td style="padding:0;">
              <a href="${escapeAttr(respondUrl('changes_requested'))}"
                 style="display:inline-block;min-width:220px;background:#ffcd01;color:#2b2b2b;font-family:${EMAIL_FONT_STACK};font-weight:700;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:8px;text-align:center;mso-padding-alt:14px 32px;">
                ✎&nbsp;&nbsp;Tenho modificações
              </a>
            </td></tr>
          </table>

          <p style="margin:16px 0 0 0;font-family:${EMAIL_FONT_STACK};text-align:center;font-size:12px;color:#9ca3af;line-height:1.5;">
            Ao clicar em <strong>Aprovar</strong>, você confirma que o conteúdo está correto e autoriza o disparo desta campanha.
            <br/>O link expira em 30 dias.
          </p>
        </td></tr>

        <!-- Section 4: footer -->
        <tr><td style="background:#f3f4f6;padding:16px 24px;text-align:center;">
          <p style="margin:0;font-family:${EMAIL_FONT_STACK};font-size:12px;color:#9ca3af;line-height:1.5;">
            Este email foi enviado pela plataforma BRL Educação.
            <br/>Você está recebendo porque foi indicado como aprovador desta campanha.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { html, subject };
}

// ---------- HTML escape helpers (ad-hoc; the campaign HTML is already escaped) ----------
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
