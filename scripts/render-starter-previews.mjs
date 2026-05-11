#!/usr/bin/env node
/**
 * Renders each starter template to a standalone HTML file in ~/Desktop/
 * brl-email-previews/ so the user can eyeball them in the browser before
 * we commit the starters into the live app.
 *
 * Usage:
 *   node scripts/render-starter-previews.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

// Compile the TS sources we need on the fly. We use tsx (already installed
// transitively via next) — but the simplest approach is to import via the
// `.ts` re-export through the bundled JS output. To avoid that, we'll just
// require ts-node-like behaviour by spawning tsx.
//
// Actually simpler: we'll just inline the modules via dynamic import on .ts
// files using Node's built-in TypeScript loader (Node 22+ ships one).

const tsxBin = join(process.cwd(), 'node_modules/.bin/tsx');

// Use tsx to actually run a renderer that imports our TS files.
const renderer = `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STARTER_TEMPLATES } from '${join(process.cwd(), 'src/lib/starter-templates.ts').replace(/'/g, "\\'")}';
import { compileTemplate } from '${join(process.cwd(), 'src/lib/compile-template.ts').replace(/'/g, "\\'")}';

const outDir = process.argv[2];
for (const t of STARTER_TEMPLATES) {
  const inner = compileTemplate(t.document);
  const html = \`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>\${t.name}</title><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#e8e8e8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<div style="max-width:680px;margin:0 auto;">
<div style="background:#fff;padding:12px 16px;border:1px solid #d4d4d8;border-radius:8px 8px 0 0;font-size:13px;color:#27272a;">
<strong>\${t.name}</strong> · <span style="color:#71717a;">\${t.category}</span><br>
<span style="color:#71717a;font-size:12px;">\${t.description}</span>
</div>
<div style="background:#fff;border:1px solid #d4d4d8;border-top:0;border-radius:0 0 8px 8px;overflow:hidden;">
\${inner}
</div>
</div>
</body></html>\`;
  const slug = t.id.replace('builtin:', '');
  writeFileSync(join(outDir, slug + '.html'), html, 'utf-8');
  console.log('wrote', slug + '.html');
}
`;

const outDir = join(homedir(), 'Desktop/brl-email-previews');
mkdirSync(outDir, { recursive: true });

const tmpFile = join(process.cwd(), '.tmp-render.mjs');
writeFileSync(tmpFile, renderer, 'utf-8');

try {
  execSync(`${tsxBin} ${tmpFile} ${outDir}`, { stdio: 'inherit' });
  console.log('\\n→ Open these in your browser:');
  for (const f of ['announcement', 'promo', 'launch']) {
    console.log(`   file://${outDir}/${f}.html`);
  }
} finally {
  execSync(`rm -f ${tmpFile}`);
}
