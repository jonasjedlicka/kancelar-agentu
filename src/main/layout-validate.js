'use strict';
/* Kontrola rozložení přijatého z rendereru, než se uloží na disk. */
const TYPES = new Set([
  'desk', 'plant', 'bigplant', 'counter', 'fridge', 'coffee', 'ktable', 'sofa', 'armchair', 'ctable',
  'rug', 'rugblue', 'whiteboard', 'window', 'bookshelf', 'watercooler', 'printer', 'clock', 'lamp', 'cabinet'
]);
const MAX_ITEMS = 200;

function validateLayout(layout) {
  if (!layout || typeof layout !== 'object' || !Array.isArray(layout.items)) return null;
  if (layout.items.length > MAX_ITEMS) return null;
  const items = [];
  const ids = new Set();
  for (const it of layout.items) {
    if (!it || typeof it !== 'object') return null;
    if (!TYPES.has(it.type)) return null;
    if (!Number.isInteger(it.x) || !Number.isInteger(it.y) || it.x < 0 || it.y < 0 || it.x > 63 || it.y > 63) return null;
    const id = String(it.id || '').slice(0, 40);
    if (!/^[a-z0-9_-]+$/i.test(id) || ids.has(id)) return null;
    ids.add(id);
    const clean = { id, type: it.type, x: it.x, y: it.y };
    if (it.owner != null) {
      if (typeof it.owner !== 'string' || !/^[a-z0-9_-]{0,40}$/.test(it.owner)) return null;
      clean.owner = it.owner;
    }
    items.push(clean);
  }
  return { version: 1, items };
}

module.exports = { validateLayout, TYPES };
