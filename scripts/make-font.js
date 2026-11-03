#!/usr/bin/env node
/* Vygeneruje src/renderer/fonts/KanclPixel.ttf z bitmapových dat (font-data.js).
 * Potřebuje Python 3 s balíčkem fontTools (pip install fonttools).
 * Hotové písmo je součástí repozitáře, takže tento skript spouštíš jen po změně glyfů. */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
require(path.join(__dirname, '..', 'src/renderer/font-data.js'));
const KFont = require(path.join(__dirname, '..', 'src/renderer/font.js'));
const D = globalThis.KFONT_DATA;
const chars = Array.from(new Set([...Object.keys(D.glyphs), ...Object.keys(D.accents)]));
const out = {};
for (const c of chars) {
  const g = KFont.glyph(c);
  out[c] = { w: g.w, px: g.px };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kfont-'));
const json = path.join(tmp, 'glyphs.json');
fs.writeFileSync(json, JSON.stringify(out));
const target = path.join(__dirname, '..', 'src/renderer/fonts/KanclPixel.ttf');
execFileSync('python3', [path.join(__dirname, 'make-font.py'), json, target], { stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hotovo:', target);
