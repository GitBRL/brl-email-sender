/**
 * Compile a TemplateDocument (block JSON) into email-safe HTML.
 *
 * Uses a table-based layout so it renders well in Gmail, Outlook, Apple Mail.
 * Returns the HTML string only (no tracking links injected — that happens in
 * the campaign send pipeline so we can swap each link for a tracked redirect).
 */

import type { Block, TemplateDocument } from './blocks';

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBlock(b: Block, _doc: TemplateDocument): string {
  switch (b.type) {
    case 'header': {
      const tag = b.size;
      return `<tr><td style="padding:8px 24px;text-align:${b.align};">
        <${tag} style="margin:0;color:${b.color};font-family:Inter,Arial,sans-serif;line-height:1.2;">${esc(b.text)}</${tag}>
      </td></tr>`;
    }
    case 'text':
      return `<tr><td style="padding:8px 24px;text-align:${b.align};">
        <p style="margin:0;color:${b.color};font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;">${esc(b.text).replace(/\n/g, '<br/>')}</p>
      </td></tr>`;
    case 'image': {
      const align = b.align ?? 'center';
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${b.width}" style="display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`;
      const wrapped = b.href ? `<a href="${esc(b.href)}" style="text-decoration:none;">${img}</a>` : img;
      // Email clients need explicit margins for image alignment — they ignore
      // float and inconsistently honor text-align on block images.
      const margin =
        align === 'left' ? '0 auto 0 0' : align === 'right' ? '0 0 0 auto' : '0 auto';
      const sized = wrapped.replace(
        'style="display:block;',
        `style="display:block;margin:${margin};`,
      );
      return `<tr><td style="padding:8px 24px;text-align:${align};">${sized}</td></tr>`;
    }
    case 'button': {
      // Use data-link-id so we can find buttons in the rendered HTML for tracking + heatmap positioning.
      return `<tr><td style="padding:16px 24px;text-align:${b.align};">
        <a href="${esc(b.href)}" data-link-id="${b.link_id}" style="display:inline-block;background:${b.background};color:${b.color};padding:12px 22px;border-radius:6px;font-family:Inter,Arial,sans-serif;font-weight:600;text-decoration:none;font-size:14px;">${esc(b.text)}</a>
      </td></tr>`;
    }
    case 'divider':
      return `<tr><td style="padding:12px 24px;">
        <div style="height:1px;background:${b.color};line-height:1px;font-size:1px;">&nbsp;</div>
      </td></tr>`;
    case 'spacer':
      return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:1px;">&nbsp;</td></tr>`;
    case 'footer':
      return `<tr><td style="padding:24px;text-align:center;color:#999;font-family:Inter,Arial,sans-serif;font-size:12px;line-height:1.5;">${esc(b.text)}</td></tr>`;
    default:
      return '';
  }
}

export function compileTemplate(doc: TemplateDocument): string {
  const inner = doc.blocks.map((b) => renderBlock(b, doc)).join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:${doc.background};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${doc.background};">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="${doc.width}" cellpadding="0" cellspacing="0" border="0" style="max-width:100%;background:${doc.contentBackground};border-radius:8px;overflow:hidden;">
          ${inner}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
