/**
 * Email block model. Stored as JSON on `templates.json_content` and compiled
 * to email-safe HTML on `templates.html_content` before sending.
 *
 * Each Button block carries a unique `link_id` (UUID) so we can attribute
 * clicks to it later, and a `position` (top/left % within the rendered email)
 * for the heatmap overlay.
 */

export type BlockBase = { id: string };

export type HeaderBlock = BlockBase & {
  type: 'header';
  text: string;
  align: 'left' | 'center' | 'right';
  size: 'h1' | 'h2' | 'h3';
  color: string;
  /** Override the default font-size for the heading level. Falls back to the
   *  h1/h2/h3 default sizes when undefined. */
  font_size?: number;
  /** Override the default font-weight (normally 700 for headers). */
  bold?: boolean;
  italic?: boolean;
};

export type TextBlock = BlockBase & {
  type: 'text';
  text: string;
  align: 'left' | 'center' | 'right';
  color: string;
  /** Body copy size in px. Falls back to 15px when undefined. */
  font_size?: number;
  /** Whole-block bold / italic. Inline mixed formatting is also supported via
   *  markdown-ish syntax in the text itself: **bold** and *italic*. */
  bold?: boolean;
  italic?: boolean;
};

export type ImageBlock = BlockBase & {
  type: 'image';
  src: string;
  alt: string;
  width: number; // px
  /** Optional fixed display height (px). When set, the rendered image is
   *  constrained to a width×height box and the image is sized via object-fit
   *  so a fresh upload preserves the template's original layout instead of
   *  stretching tall. When undefined, height is derived from the image's
   *  intrinsic aspect ratio (the legacy behaviour). */
  height?: number;
  href?: string;
  /** Horizontal placement within the block's row. Defaults to 'center'. */
  align?: 'left' | 'center' | 'right';
  /** How to fit the image into a fixed width×height box. 'contain' keeps
   *  the whole image visible (default — safer for logos), 'cover' fills the
   *  box and may crop. Only meaningful when height is set. */
  fit?: 'contain' | 'cover';
};

export type ButtonBlock = BlockBase & {
  type: 'button';
  text: string;
  href: string;
  background: string;
  color: string;
  align: 'left' | 'center' | 'right';
  link_id: string;
  position?: { top: number; left: number; width: number; height: number }; // %, set at render time
};

export type DividerBlock = BlockBase & { type: 'divider'; color: string };
export type SpacerBlock = BlockBase & { type: 'spacer'; height: number };
export type FooterBlock = BlockBase & { type: 'footer'; text: string };

export type Block =
  | HeaderBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | FooterBlock;

export type TemplateDocument = {
  version: 1;
  background: string;
  contentBackground: string;
  width: number; // px
  blocks: Block[];
};

export const DEFAULT_DOCUMENT: TemplateDocument = {
  version: 1,
  background: '#f7f7f7',
  contentBackground: '#ffffff',
  width: 600,
  blocks: [],
};

export function uid(): string {
  // Lightweight UUID v4-ish (fine for client-side block ids)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function makeBlock(type: Block['type']): Block {
  const id = uid();
  switch (type) {
    case 'header':
      return { id, type, text: 'Your headline', align: 'left', size: 'h1', color: '#2b2b2b' };
    case 'text':
      return { id, type, text: 'Write your message here.', align: 'left', color: '#2b2b2b' };
    case 'image':
      return {
        id,
        type,
        src: 'https://placehold.co/600x300?text=Image',
        alt: '',
        width: 600,
        align: 'center',
      };
    case 'button':
      return {
        id,
        type,
        text: 'Click here',
        href: 'https://brleducacao.com.br',
        background: '#ffcd01',
        color: '#2b2b2b',
        align: 'center',
        link_id: uid(),
      };
    case 'divider':
      return { id, type, color: '#e5e5e5' };
    case 'spacer':
      return { id, type, height: 24 };
    case 'footer':
      return {
        id,
        type,
        text: 'BRL Educação · {{unsubscribe_url}}',
      };
  }
}

/**
 * Convenience preset for the "Logo" palette item — a 200x200 image block
 * centered by default. Replace the src in the editor with your own logo.
 */
export function makeLogo(): ImageBlock {
  return {
    id: uid(),
    type: 'image',
    src: 'https://placehold.co/200x200/2b2b2b/ffcd01?text=Logo',
    alt: 'Logo',
    width: 200,
    align: 'center',
  };
}
