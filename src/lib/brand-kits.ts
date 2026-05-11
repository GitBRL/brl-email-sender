/**
 * Brand kit types + helpers. A "kit" is a product's visual identity bundle
 * (BRL Educação, Turbo, Focus, Salus, Experience, Iron, Vanguard, or a
 * user-created custom kit). Picking one at campaign/template creation time
 * pre-themes the editor and the rendered email.
 */

import { uid, type Block, type TemplateDocument } from './blocks';

export type BrandKit = {
  id: string;
  name: string;
  slug: string;
  color_primary: string;
  color_secondary: string;
  color_background: string;
  color_text: string;
  color_header_bg: string;
  color_cta_bg: string;
  color_cta_text: string;
  color_footer_bg: string;
  color_footer_text: string;
  logo_url: string | null;
  logo_dark_url: string | null;
  is_custom: boolean;
  created_at: string;
};

/** Pick out the per-kit color palette (used by the editor's "Cores do kit"
 *  swatch row and by anywhere we apply theme-aware colors). */
export function kitPalette(kit: BrandKit): Array<{ label: string; value: string }> {
  return [
    { label: 'Primary', value: kit.color_primary },
    { label: 'Secondary', value: kit.color_secondary },
    { label: 'Text', value: kit.color_text },
    { label: 'CTA bg', value: kit.color_cta_bg },
    { label: 'CTA text', value: kit.color_cta_text },
  ];
}

/**
 * Build the default 6-block starter document for a freshly created
 * kit-themed template (per the spec):
 *   1. Header (logo or fallback name) on color_header_bg
 *   2. Hero text (H1) on color_background
 *   3. Body text on color_background
 *   4. CTA button (color_cta_bg / color_cta_text)
 *   5. Divider (color_primary)
 *   6. Footer with unsubscribe placeholder
 *
 * Block ids are fresh each call so the resulting doc can be stored straight
 * into a new template row.
 */
export function defaultDocForKit(kit: BrandKit): TemplateDocument {
  const blocks: Block[] = [];

  // 1. Header — either logo image or product name as bold heading
  if (kit.logo_url) {
    blocks.push({
      id: uid(),
      type: 'image',
      src: kit.logo_url,
      alt: kit.name,
      width: 180,
      align: 'center',
    });
  } else {
    blocks.push({
      id: uid(),
      type: 'header',
      text: kit.name,
      align: 'center',
      size: 'h2',
      color: contrastingTextOn(kit.color_header_bg),
    });
  }
  blocks.push({ id: uid(), type: 'spacer', height: 24 });

  // 2. Hero H1
  blocks.push({
    id: uid(),
    type: 'header',
    text: 'Assunto principal do email',
    align: 'left',
    size: 'h1',
    color: kit.color_text,
  });
  blocks.push({
    id: uid(),
    type: 'text',
    text: 'Descrição de apoio em uma ou duas linhas.',
    align: 'left',
    color: kit.color_text,
  });
  blocks.push({ id: uid(), type: 'spacer', height: 16 });

  // 3. Body
  blocks.push({
    id: uid(),
    type: 'text',
    text: 'Corpo do email. Escreva sua mensagem aqui — vá direto ao ponto, use parágrafos curtos e mantenha o foco em uma única ação principal.',
    align: 'left',
    color: kit.color_text,
  });
  blocks.push({ id: uid(), type: 'spacer', height: 24 });

  // 4. CTA button
  blocks.push({
    id: uid(),
    type: 'button',
    text: 'Quero saber mais →',
    href: 'https://brleducacao.com.br',
    background: kit.color_cta_bg,
    color: kit.color_cta_text,
    align: 'center',
    link_id: uid(),
  });
  blocks.push({ id: uid(), type: 'spacer', height: 32 });

  // 5. Divider in primary color (use kit primary as divider stroke)
  blocks.push({ id: uid(), type: 'divider', color: kit.color_primary });
  blocks.push({ id: uid(), type: 'spacer', height: 16 });

  // 6. Footer
  blocks.push({
    id: uid(),
    type: 'footer',
    text: `© ${new Date().getFullYear()} ${kit.name} · BRL Educação\n{{unsubscribe_url}}`,
  });

  return {
    version: 1,
    background: kit.color_background,
    contentBackground: kit.color_background,
    width: 600,
    blocks,
  };
}

/**
 * Re-theme a set of starter-template blocks with the colours of a brand kit.
 *
 * The starter templates (`src/lib/starter-templates.ts`) are seeded with the
 * BRL palette (yellow #ffcd01, orange #f47216, dark #2b2b2b). When a user
 * picks a starter for a campaign whose kit is e.g. Salus, we substitute
 * those brand hexes with the kit's tokens, while leaving functional greys
 * (#666666, #a1a1aa, #e5e5e5) alone.
 *
 * Substitution map:
 *   button.background — yellow → cta_bg, orange → primary, dark → secondary
 *   button.color      — always replaced with kit.color_cta_text (the bg
 *                       changed, so its contrast partner must follow)
 *   header/text.color — dark → text, orange → primary, yellow → cta_bg
 *   image.src         — only the BRL placeholder logo (URL contains
 *                       'BRL+Educa') swaps to kit.logo_url when available
 *
 * Block ids are NOT touched here — that's the caller's job (they regenerate
 * uuids so click attribution stays per-template).
 */
export function applyKitToBlocks(blocks: Block[], kit: BrandKit): Block[] {
  const isYellow = (c?: string) => !!c && c.toLowerCase() === '#ffcd01';
  const isOrange = (c?: string) => !!c && c.toLowerCase() === '#f47216';
  const isDark = (c?: string) => !!c && c.toLowerCase() === '#2b2b2b';
  const isWhite = (c?: string) => !!c && c.toLowerCase() === '#ffffff';

  return blocks.map<Block>((b) => {
    if (b.type === 'header') {
      let color = b.color;
      if (isDark(color)) color = kit.color_text;
      else if (isOrange(color)) color = kit.color_primary;
      else if (isYellow(color)) color = kit.color_cta_bg;
      return { ...b, color };
    }
    if (b.type === 'text') {
      let color = b.color;
      if (isDark(color)) color = kit.color_text;
      else if (isOrange(color)) color = kit.color_primary;
      else if (isYellow(color)) color = kit.color_cta_bg;
      return { ...b, color };
    }
    if (b.type === 'button') {
      let background = b.background;
      if (isYellow(background)) background = kit.color_cta_bg;
      else if (isOrange(background)) background = kit.color_primary;
      else if (isDark(background)) background = kit.color_secondary;
      // button text always follows the new bg's contrast partner
      const color =
        isDark(b.color) || isWhite(b.color)
          ? kit.color_cta_text
          : b.color;
      return { ...b, background, color };
    }
    if (b.type === 'image') {
      const src = b.src.includes('BRL+Educa') && kit.logo_url ? kit.logo_url : b.src;
      return { ...b, src };
    }
    return b;
  });
}

/** Quick perceptual-luma check to pick a legible heading color against a bg. */
export function contrastingTextOn(bgHex: string): string {
  const hex = bgHex.replace('#', '');
  if (hex.length !== 6) return '#2b2b2b';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  // Rec. 709 luma
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.55 ? '#2b2b2b' : '#ffffff';
}
