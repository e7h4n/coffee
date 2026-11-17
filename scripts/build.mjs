#!/usr/bin/env node
// Assemble the static site: web/ + data/ -> dist/ (deployed to GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const hash = (...files) => {
  const h = crypto.createHash('sha256');
  for (const f of files) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 10);
};

const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/index.json'), 'utf8'));
for (const b of index.brews) {
  for (const f of [`data/brews/${b.slug}.json`, ...(b.hasTrace ? [`data/traces/${b.slug}.json`, `data/csv/${b.slug}.csv`] : [])]) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`missing ${f}; run npm run sync`);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'web'), DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'data'), path.join(DIST, 'data'), { recursive: true });
const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')
  .replaceAll('__ASSET_VERSION__', hash('web/app.js', 'web/style.css'))
  .replaceAll('__DATA_VERSION__', hash('data/index.json'));
fs.writeFileSync(path.join(DIST, 'index.html'), html);
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log(`dist/ ready: ${index.brews.length} brews`);
