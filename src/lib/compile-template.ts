/**
 * Compile a TemplateDocument (block JSON) into email-safe HTML.
 *
 * Uses a table-based layout so it renders well in Gmail, Outlook, Apple Mail.
 * Returns the HTML string only (no tracking links injected — that happens in
 * the campaign send pipeline so we can swap each link for a tracked redirect).
 */

import type { Block, TemplateDocument } from './blocks';

/** Font stack for all rendered blocks. Sora is loaded via Google Fonts in the
 *  email <head>; the rest is fallback for clients that strip web fonts. */
export const EMAIL_FONT_STACK = '"Sora",Inter,Arial,sans-serif';

/** Default body font size in px (when block.font_size is not set). */
const DEFAULT_TEXT_SIZE = 15;
/** Default per-heading-level sizes (px). */
const HEADING_SIZES: Record<'h1' | 'h2' | 'h3', number> = { h1: 28, h2: 22, h3: 18 };

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render inline markdown-ish formatting inside a text/header body:
 *   **bold**    → <strong>
 *   *italic*    → <em>
 *   [text](url) → <a>
 * Anything else is HTML-escaped first, so it's safe to paste arbitrary
 * content. Newlines become <br/>.
 */
function inlineFormat(raw: string): string {
  let out = esc(raw);

  // [text](url) — must run before the bold/italic asterisk handlers so '*'
  // inside link labels doesn't get mangled
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    (_, label: string, url: string) => `<a href="${url}" style="color:inherit;text-decoration:underline;">${label}</a>`,
  );

  // **bold** — non-greedy, must contain at least one non-* character
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // *italic* — same rule, applied after bold so we don't double-match
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');

  // Newlines → <br/>
  out = out.replace(/\n/g, '<br/>');

  return out;
}

function renderBlock(b: Block, _doc: TemplateDocument): string {
  switch (b.type) {
    case 'header': {
      const tag = b.size;
      const size = b.font_size ?? HEADING_SIZES[b.size];
      const weight = b.bold === false ? 600 : 700; // headers are bold by default
      const style = b.italic ? ';font-style:italic' : '';
      return `<tr><td style="padding:8px 24px;text-align:${b.align};">
        <${tag} style="margin:0;color:${b.color};font-family:${EMAIL_FONT_STACK};font-size:${size}px;font-weight:${weight};line-height:1.25${style};">${inlineFormat(b.text)}</${tag}>
      </td></tr>`;
    }
    case 'text': {
      const size = b.font_size ?? DEFAULT_TEXT_SIZE;
      const weight = b.bold ? 700 : 400;
      const fontStyle = b.italic ? 'italic' : 'normal';
      return `<tr><td style="padding:8px 24px;text-align:${b.align};">
        <p style="margin:0;color:${b.color};font-family:${EMAIL_FONT_STACK};font-size:${size}px;font-weight:${weight};font-style:${fontStyle};line-height:1.6;">${inlineFormat(b.text)}</p>
      </td></tr>`;
    }
    case 'image': {
      const align = b.align ?? 'center';
      // When `height` is set we render a fixed-box image: width × height with
      // object-fit so a freshly-uploaded image of any aspect ratio still fits
      // the template's original layout. Apple Mail / Gmail honor object-fit;
      // Outlook ignores it and falls back to width+height (slight stretch in
      // the unlikely Outlook case is acceptable).
      // When height is undefined we keep the legacy 'natural aspect ratio'
      // behaviour (height:auto).
      const fit = b.fit ?? 'contain';
      const baseStyle = b.height
        ? `display:block;max-width:100%;height:${b.height}px;object-fit:${fit};border:0;outline:none;text-decoration:none;`
        : `display:block;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;`;
      const heightAttr = b.height ? ` height="${b.height}"` : '';
      const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" width="${b.width}"${heightAttr} style="${baseStyle}" />`;
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
        <a href="${esc(b.href)}" data-link-id="${b.link_id}" style="display:inline-block;background:${b.background};color:${b.color};padding:12px 22px;border-radius:6px;font-family:${EMAIL_FONT_STACK};font-weight:600;text-decoration:none;font-size:14px;">${esc(b.text)}</a>
      </td></tr>`;
    }
    case 'divider':
      return `<tr><td style="padding:12px 24px;">
        <div style="height:1px;background:${b.color};line-height:1px;font-size:1px;">&nbsp;</div>
      </td></tr>`;
    case 'spacer':
      return `<tr><td style="height:${b.height}px;line-height:${b.height}px;font-size:1px;">&nbsp;</td></tr>`;
    case 'footer':
      return `<tr><td style="padding:24px;text-align:center;color:#999;font-family:${EMAIL_FONT_STACK};font-size:12px;line-height:1.5;">${inlineFormat(b.text)}</td></tr>`;
    case 'bullets': {
      const size = b.font_size ?? DEFAULT_TEXT_SIZE;
      const weight = b.bold ? 700 : 400;
      const fontStyle = b.italic ? 'italic' : 'normal';
      const tag = b.style === 'numbered' ? 'ol' : 'ul';
      const items = b.items
        .filter((s) => s && s.trim() !== '')
        .map(
          (line) =>
            `<li style="margin:0 0 6px 0;padding:0;">${inlineFormat(line)}</li>`,
        )
        .join('');
      // padding-left is what gives the markers room — email clients vary on
      // default list-padding. 24px is a safe explicit value across Gmail /
      // Apple Mail / Outlook.
      return `<tr><td style="padding:8px 24px;text-align:${b.align};">
        <${tag} style="margin:0;padding:0 0 0 24px;color:${b.color};font-family:${EMAIL_FONT_STACK};font-size:${size}px;font-weight:${weight};font-style:${fontStyle};line-height:1.6;">${items}</${tag}>
      </td></tr>`;
    }
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
  <!-- Sora from Google Fonts — gmail / apple mail honor this; outlook ignores it and falls back to the stack. -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&display=swap" rel="stylesheet" />
  <style>
    body, table, td, p, h1, h2, h3, a { font-family: ${EMAIL_FONT_STACK}; }
  </style>
</head>
<body style="margin:0;padding:0;background:${doc.background};font-family:${EMAIL_FONT_STACK};">
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
