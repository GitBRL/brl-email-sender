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

/** A contact for the purposes of merge-tag substitution.
 * `custom_fields` is typed as unknown because Supabase returns Json which
 * isn't directly assignable to Record<string, unknown>. We narrow at runtime. */
type ContactForMerge = {
  id: string;
  email: string;
  name: string | null;
  last_name?: string | null;
  phone?: string | null;
  company?: string | null;
  custom_fields?: unknown;
};

/**
 * Build the merge-tag dictionary for a contact. Standard fields take precedence
 * over custom fields (so a custom field accidentally named "email" won't shadow
 * the contact's actual email). Reserved keys (`__contact_id__`, `unsubscribe_url`)
 * are likewise protected.
 */
function buildMergeMap(contact: ContactForMerge): Record<string, string> {
  const map: Record<string, string> = {};
  // Custom fields first — standard ones overwrite if there's a name collision.
  const cf = contact.custom_fields;
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    for (const [k, v] of Object.entries(cf as Record<string, unknown>)) {
      if (v == null) continue;
      map[k] = String(v);
    }
  }
  map.name = contact.name ?? '';
  // {{first_name}} is an explicit alias for whatever's in `name`. When the
  // CSV importer's "Split full name" toggle is used, `name` already contains
  // just the first name; {{first_name}} is the natural template tag to use.
  map.first_name = contact.name ?? '';
  map.last_name = contact.last_name ?? '';
  map.email = contact.email;
  if (contact.phone != null) map.phone = contact.phone;
  if (contact.company != null) map.company = contact.company;
  return map;
}

/** Replace every `{{key}}` in `text` using the supplied dictionary. */
function applyMergeTags(text: string, map: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (whole, key) => {
    // Reserved tokens handled by the caller.
    if (key === '__contact_id__' || key === 'unsubscribe_url') return whole;
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    // Unknown tag — leave it visible so the operator notices and fixes it,
    // rather than silently shipping a literal "{{curso}}" to recipients with
    // an empty replacement.
    return '';
  });
}

export function personalize(preparedHtml: string, contact: ContactForMerge): string {
  const unsub = `${APP_URL}/api/unsubscribe?uid=${encodeURIComponent(contact.id)}`;
  const map = buildMergeMap(contact);
  return applyMergeTags(preparedHtml, map)
    .replace(/\{\{__contact_id__\}\}/g, contact.id)
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, unsub);
}

export function personalizeSubject(subject: string, contact: ContactForMerge): string {
  return applyMergeTags(subject, buildMergeMap(contact));
}
