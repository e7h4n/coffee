import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('finished brews do not require TDS; unfinished sessions stay private', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coffee-sync-test-'));
  try {
    for (const d of ['scripts', 'catalog', 'raw', 'data']) fs.mkdirSync(path.join(root, d));
    fs.copyFileSync(fileURLToPath(new URL('./sync.mjs', import.meta.url)), path.join(root, 'scripts/sync.mjs'));
    const catalogs = { beans: {}, brews: { brews: {} }, brewers: { V60: { formula: 'beverage' } }, gear: {}, roasts: { roasts: {} } };
    for (const [name, data] of Object.entries(catalogs)) fs.writeFileSync(path.join(root, 'catalog', name + '.json'), JSON.stringify(data));
    const records = [
      { status: 'complete', tds_percent: 1.2, extraction_percent: 20 },
      { status: 'awaiting_tds', tds_percent: null, extraction_percent: null },
      { status: 'complete' },
      { status: 'awaiting_tds', extraction_percent: 20 }, // no yield without TDS
      { status: 'brewing' }, { status: 'aborted' }, { status: 'unknown' },
    ];
    records.forEach((r, i) => fs.writeFileSync(path.join(root, 'raw', `brew-${i}.json`), JSON.stringify({
      id: `test-session-${i + 1}`, created_at: `2026-11-19T00:0${i}:00Z`, brewer: 'V60',
      dose_g: 15, water_ml: 225, beverage_g: 200, brew_ratio: 15, elapsed_ms: 120000, ...r,
    })));
    execFileSync(process.execPath, [path.join(root, 'scripts/sync.mjs')]);
    const { brews } = JSON.parse(fs.readFileSync(path.join(root, 'data/index.json')));
    assert.equal(brews.length, 4);
    assert.equal(brews[0].tds, 1.2);
    assert.equal(brews[0].ey, 20);
    assert.deepEqual(brews.map(b => b.cup), [1, 2, 3, 4]);
    for (const brew of brews.slice(1)) {
      assert.equal(brew.tds, null);
      assert.equal(brew.ey, null);
      const detail = JSON.parse(fs.readFileSync(path.join(root, 'data/brews', brew.slug + '.json')));
      assert.equal(detail.tds, null);
      assert.equal(detail.ey, null);
    }
    const csv = fs.readFileSync(path.join(root, 'data/brews.csv'), 'utf8').trim().split('\n');
    for (const row of csv.slice(2)) assert.deepEqual(row.split(',').slice(11, 13), ['', '']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
