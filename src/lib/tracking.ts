/**
 * Pre-flight transformations applied to a template's compiled HTML before
 * sending a campaign:
 *
 *   1. Replace every <a href="..."> with a tracked redirect URL that includes
 *      the campaign id and a stable link_id (carried over from a button
 *      block's data-link-id, or freshly generated for arbitrary anchors).
 *   2. Insert a 1x1 open-tracking pixel at the end of <body>.
 *   3. Substitute merge tags ({{name}}, {{email}}, {{unsubscribe_url}}, etc.).
 *
 * Phase 1 is template-wide and shared across recipients (one prep per send).
 * Phase 3 is per-recipient.
 */

import { APP_URL } from './resend';
import { uid } from './blocks';

export type PreparedHtml = {
  html: string;
  links: Array<{ link_id: string; original_url: string }>;
};

const OPEN_PIXEL_PLACEHOLDER = '__BRL_OPEN_PIXEL__';

/**
 * Rewrite all <a> tags to point at /api/track/click and inject an open pixel.
 * Per-recipient `uid` is left as a placeholder ({{__contact_id__}}) so we can
 * stamp it cheaply without re-parsing the HTML for every recipient.
 */
export function prepareCampaignHtml(rawHtml: string, campaignId: string): PreparedHtml {
  const links: Array<{ link_id: string; original_url: string }> = [];

  // Match <a ...href="..." ...>
  const html = rawHtml
    .replace(/<a\b([^>]*)>/gi, (match, attrs) => {
      const hrefMatch = attrs.match(/\bhref\s*=\s*"([^"]*)"/i);
      if (!hrefMatch) return match;
      const original = hrefMatch[1];

      // Don't rewrite the unsubscribe placeholder — it gets templated per-recipient.
      if (original.includes('{{unsubscribe_url}}') || original.startsWith('mailto:') || original.startsWith('tel:')) {
        return match;
      }

      const idMatch = attrs.match(/\bdata-link-id\s*=\s*"([^"]+)"/i);
      const link_id = idMatch ? idMatch[1] : uid();
      links.push({ link_id, original_url: original });

      const tracked = `${APP_URL}/api/track/click?cid=${encodeURIComponent(
        campaignId,
      )}&lid=${encodeURIComponent(link_id)}&uid={{__contact_id__}}`;

      const newAttrs = attrs.replace(/\bhref\s*=\s*"[^"]*"/i, `href="${tracked}"`);
      // Add data-link-id if it wasn't already there, so we can find this button on the heatmap.
      const final = idMatch ? newAttrs : `${newAttrs} data-link-id="${link_id}"`;
      return `<a${final}>`;
    })
    .replace('</body>', `${OPEN_PIXEL_PLACEHOLDER}</body>`);

  const pixel = `<img src="${APP_URL}/api/track/open?cid=${encodeURIComponent(
    campaignId,
  )}&uid={{__contact_id__}}" width="1" height="1" alt="" style="display:none;border:0;outline:none;" />`;

  // Even if the template doesn't have </body>, append the pixel at the end.
  const withPixel = html.includes(OPEN_PIXEL_PLACEHOLDER)
    ? html.replace(OPEN_PIXEL_PLACEHOLDER, pixel)
    : `${html}\n${pixel}`;

  return { html: withPixel, links };
}

export function personalize(
  preparedHtml: string,
  contact: { id: string; email: string; name: string | null },
): string {
  const unsub = `${APP_URL}/api/unsubscribe?uid=${encodeURIComponent(contact.id)}`;
  return preparedHtml
    .replace(/\{\{__contact_id__\}\}/g, contact.id)
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name ?? '')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsub);
}

export function personalizeSubject(
  subject: string,
  contact: { name: string | null; email: string },
): string {
  return subject
    .replace(/\{\{\s*name\s*\}\}/gi, contact.name ?? '')
    .replace(/\{\{\s*email\s*\}\}/gi, contact.email);
}
