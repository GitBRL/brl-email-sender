/**
 * Built-in starter templates. These ship with the app — when a user clicks
 * "Use this template" the document is cloned into a new editable record.
 *
 * Block ids and link_ids are stable per-starter (kept deterministic so HMR
 * doesn't churn on dev), but get replaced with fresh UUIDs at clone time
 * inside the `cloneStarter` server action.
 *
 * Sources for the structures: classic single-column email best-practice from
 * Mailchimp / Litmus / Really Good Emails — one focused CTA, ~600px width,
 * legible body copy, footer with the {{unsubscribe_url}} merge tag.
 */

import type { Block, TemplateDocument } from './blocks';

export type StarterTemplate = {
  /** Stable id used in URLs and clone calls. Prefix `builtin:` is a sentinel. */
  id: `builtin:${string}`;
  /** Display name in the gallery. */
  name: string;
  /** Goal / when to use this template. */
  description: string;
  /** Short tag shown in the card. */
  category: string;
  /** The default content the user starts from. */
  document: TemplateDocument;
};

// ---------- Brand palette ----------
const BRL_YELLOW = '#ffcd01';
const BRL_ORANGE = '#f47216';
const BRL_DARK = '#2b2b2b';
const GRAY = '#666666';
const LIGHT_GRAY = '#a1a1aa';

// Helper to give blocks stable ids
const b = (n: string): string => `starter-${n}`;

// ---------- 1. Message / Announcement ----------
const announcementBlocks: Block[] = [
  {
    id: b('a-1'),
    type: 'image',
    src: 'https://placehold.co/180x60/2b2b2b/ffcd01?text=BRL+Educa%C3%A7%C3%A3o',
    alt: 'BRL Educação',
    width: 180,
  },
  { id: b('a-2'), type: 'spacer', height: 28 },
  {
    id: b('a-3'),
    type: 'header',
    text: 'Sua manchete em uma linha',
    align: 'left',
    size: 'h1',
    color: BRL_DARK,
  },
  { id: b('a-4'), type: 'spacer', height: 12 },
  {
    id: b('a-5'),
    type: 'text',
    text: 'Olá {{name}},',
    align: 'left',
    color: BRL_DARK,
  },
  {
    id: b('a-6'),
    type: 'text',
    text: 'Escreva aqui o que você quer comunicar em 2 ou 3 frases curtas. Vá direto ao ponto — leitores percorrem o e-mail em segundos, então o que importa precisa estar logo no início.',
    align: 'left',
    color: BRL_DARK,
  },
  {
    id: b('a-7'),
    type: 'text',
    text: 'Se houver um detalhe extra, coloque-o em um segundo parágrafo curto como este — fácil de escanear.',
    align: 'left',
    color: BRL_DARK,
  },
  { id: b('a-8'), type: 'spacer', height: 20 },
  {
    id: b('a-9'),
    type: 'button',
    text: 'Saiba mais',
    href: 'https://brleducacao.com.br',
    background: BRL_YELLOW,
    color: BRL_DARK,
    align: 'left',
    link_id: b('a-link'),
  },
  { id: b('a-10'), type: 'spacer', height: 32 },
  {
    id: b('a-11'),
    type: 'text',
    text: 'Um abraço,\nEquipe BRL Educação',
    align: 'left',
    color: GRAY,
  },
  { id: b('a-12'), type: 'spacer', height: 24 },
  { id: b('a-13'), type: 'divider', color: '#e5e5e5' },
  { id: b('a-14'), type: 'spacer', height: 12 },
  {
    id: b('a-15'),
    type: 'footer',
    text: 'BRL Educação · Você recebeu este e-mail porque está inscrito em nossa lista.\n{{unsubscribe_url}}',
  },
];

// ---------- 2. Big Message / Promo ----------
const promoBlocks: Block[] = [
  {
    id: b('p-1'),
    type: 'image',
    src: 'https://placehold.co/600x250/f47216/ffffff?text=Sua+oferta+aqui',
    alt: 'Banner da oferta',
    width: 600,
  },
  { id: b('p-2'), type: 'spacer', height: 20 },
  {
    id: b('p-3'),
    type: 'text',
    text: 'OFERTA LIMITADA',
    align: 'center',
    color: BRL_ORANGE,
  },
  { id: b('p-4'), type: 'spacer', height: 4 },
  {
    id: b('p-5'),
    type: 'header',
    text: '50% off em todos os cursos',
    align: 'center',
    size: 'h1',
    color: BRL_DARK,
  },
  { id: b('p-6'), type: 'spacer', height: 12 },
  {
    id: b('p-7'),
    type: 'text',
    text: '{{name}}, garanta sua vaga com desconto exclusivo. Por tempo limitado, todos os cursos da nossa plataforma estão com metade do preço — perfeito para quem estava esperando o momento certo.',
    align: 'center',
    color: BRL_DARK,
  },
  { id: b('p-8'), type: 'spacer', height: 16 },
  {
    id: b('p-9'),
    type: 'text',
    text: 'A oferta termina em 48 horas.',
    align: 'center',
    color: BRL_ORANGE,
  },
  { id: b('p-10'), type: 'spacer', height: 20 },
  {
    id: b('p-11'),
    type: 'button',
    text: 'GARANTIR DESCONTO →',
    href: 'https://brleducacao.com.br/promo',
    background: BRL_ORANGE,
    color: '#ffffff',
    align: 'center',
    link_id: b('p-link-cta'),
  },
  { id: b('p-12'), type: 'spacer', height: 28 },
  { id: b('p-13'), type: 'divider', color: '#e5e5e5' },
  { id: b('p-14'), type: 'spacer', height: 12 },
  {
    id: b('p-15'),
    type: 'text',
    text: '*Promoção válida para novas matrículas até [data]. Não cumulativa com outros descontos. Termos em brleducacao.com.br/termos.',
    align: 'center',
    color: LIGHT_GRAY,
  },
  { id: b('p-16'), type: 'spacer', height: 16 },
  {
    id: b('p-17'),
    type: 'footer',
    text: 'BRL Educação · Não quer mais receber ofertas?\n{{unsubscribe_url}}',
  },
];

// ---------- 3. Product Launch ----------
const launchBlocks: Block[] = [
  { id: b('l-1'), type: 'spacer', height: 8 },
  {
    id: b('l-2'),
    type: 'text',
    text: 'APRESENTAMOS',
    align: 'center',
    color: LIGHT_GRAY,
  },
  { id: b('l-3'), type: 'spacer', height: 4 },
  {
    id: b('l-4'),
    type: 'header',
    text: 'Nome do produto',
    align: 'center',
    size: 'h1',
    color: BRL_DARK,
  },
  { id: b('l-5'), type: 'spacer', height: 8 },
  {
    id: b('l-6'),
    type: 'text',
    text: 'A tagline curta que descreve o que muda na vida do cliente.',
    align: 'center',
    color: GRAY,
  },
  { id: b('l-7'), type: 'spacer', height: 24 },
  {
    id: b('l-8'),
    type: 'image',
    src: 'https://placehold.co/600x360/2b2b2b/ffcd01?text=Imagem+do+produto',
    alt: 'Produto',
    width: 600,
  },
  { id: b('l-9'), type: 'spacer', height: 32 },
  {
    id: b('l-10'),
    type: 'header',
    text: 'Recurso 1: o que ele resolve',
    align: 'left',
    size: 'h2',
    color: BRL_DARK,
  },
  {
    id: b('l-11'),
    type: 'text',
    text: 'Descrição curta do primeiro recurso. Foque no benefício para o cliente, não na funcionalidade técnica. Uma a três linhas.',
    align: 'left',
    color: BRL_DARK,
  },
  { id: b('l-12'), type: 'spacer', height: 24 },
  {
    id: b('l-13'),
    type: 'header',
    text: 'Recurso 2: outra vitória',
    align: 'left',
    size: 'h2',
    color: BRL_DARK,
  },
  {
    id: b('l-14'),
    type: 'text',
    text: 'Mesmo padrão: benefício direto, sem jargão. Imagine o leitor lendo isso em 4 segundos.',
    align: 'left',
    color: BRL_DARK,
  },
  { id: b('l-15'), type: 'spacer', height: 24 },
  {
    id: b('l-16'),
    type: 'header',
    text: 'Recurso 3: a cereja do bolo',
    align: 'left',
    size: 'h2',
    color: BRL_DARK,
  },
  {
    id: b('l-17'),
    type: 'text',
    text: 'O terceiro destaque. Se for um diferencial competitivo, mencione aqui — costuma ser o mais clicado.',
    align: 'left',
    color: BRL_DARK,
  },
  { id: b('l-18'), type: 'spacer', height: 32 },
  {
    id: b('l-19'),
    type: 'button',
    text: 'Ver demonstração',
    href: 'https://brleducacao.com.br/produto',
    background: BRL_DARK,
    color: '#ffffff',
    align: 'center',
    link_id: b('l-link-demo'),
  },
  { id: b('l-20'), type: 'spacer', height: 12 },
  {
    id: b('l-21'),
    type: 'button',
    text: 'Acessar agora',
    href: 'https://brleducacao.com.br/produto/comecar',
    background: BRL_YELLOW,
    color: BRL_DARK,
    align: 'center',
    link_id: b('l-link-cta'),
  },
  { id: b('l-22'), type: 'spacer', height: 32 },
  { id: b('l-23'), type: 'divider', color: '#e5e5e5' },
  { id: b('l-24'), type: 'spacer', height: 12 },
  {
    id: b('l-25'),
    type: 'text',
    text: 'Tem perguntas? Responda este e-mail — alguém da nossa equipe vai responder pessoalmente.',
    align: 'center',
    color: LIGHT_GRAY,
  },
  { id: b('l-26'), type: 'spacer', height: 12 },
  {
    id: b('l-27'),
    type: 'footer',
    text: 'BRL Educação · Recebido porque você acompanha nossos lançamentos.\n{{unsubscribe_url}}',
  },
];

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    id: 'builtin:announcement',
    name: 'Mensagem & Anúncio',
    description:
      'Layout limpo, um único CTA. Ideal para newsletters, avisos curtos e atualizações de equipe. Estrutura testada por Mailchimp, Substack e MIT Tech Review.',
    category: 'Mensagens',
    document: {
      version: 1,
      background: '#f7f7f7',
      contentBackground: '#ffffff',
      width: 600,
      blocks: announcementBlocks,
    },
  },
  {
    id: 'builtin:promo',
    name: 'Big Message & Promo',
    description:
      'Hero visual + headline grande + urgência + um CTA dominante. Estrutura clássica de varejo (Amazon, Magalu, Mercado Livre) para taxas de clique acima da média.',
    category: 'Promoção',
    document: {
      version: 1,
      background: '#f7f7f7',
      contentBackground: '#ffffff',
      width: 600,
      blocks: promoBlocks,
    },
  },
  {
    id: 'builtin:launch',
    name: 'Lançamento de Produto',
    description:
      'Reveal → hero do produto → 3 benefícios → dois CTAs (demonstração + ação). Mesma estrutura usada pela Apple, Notion e Stripe em lançamentos.',
    category: 'Lançamento',
    document: {
      version: 1,
      background: '#fafafa',
      contentBackground: '#ffffff',
      width: 600,
      blocks: launchBlocks,
    },
  },
];

export function findStarter(id: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((t) => t.id === id);
}
