'use strict';
const test = require('node:test');
const assert = require('node:assert');
const W = require('../src/renderer/world.js').world;
const { validateLayout } = require('../src/main/layout-validate');

test('výchozí rozložení je platné a vše je dosažitelné ode dveří', () => {
  const layout = W.cloneLayout(W.DEFAULT_LAYOUT);
  for (const it of layout.items) {
    assert.ok(W.canPlace(layout, it, it.x, it.y), `${it.id} nelze umístit`);
  }
  const grid = W.buildGrid(layout);
  const spots = W.spotsFor(layout);
  assert.ok(spots.filter((s) => s.kind === 'desk').length >= 7);
  for (const s of spots) {
    const p = W.findPath(grid, W.DOOR.x, W.DOOR.y, s.x, s.y);
    assert.ok(p, `místo ${s.key} je nedosažitelné`);
  }
  for (const id of ['sef', 'skolnik', 'kuchar', 'tajemnik', 'planovac', 'spravce', 'knihovnik']) {
    assert.ok(spots.some((s) => s.owner === id), `${id} nemá stůl`);
  }
  assert.ok(validateLayout(layout));
});

test('A* obchází nábytek a neprochází židlemi', () => {
  const layout = W.cloneLayout(W.DEFAULT_LAYOUT);
  const grid = W.buildGrid(layout);
  const p = W.findPath(grid, 2, 4, 2, 7);
  assert.ok(p);
  for (const [x, y] of p.slice(0, -1)) assert.strictEqual(grid[y * W.W + x], 0);
  assert.ok(p.length >= 5, "cesta musí stůl obejít");
  assert.strictEqual(W.findPath(grid, 2, 4, 0, 0), null); // do zdi nevede cesta
});

test('editor nepovolí překryv ani zeď', () => {
  const layout = W.cloneLayout(W.DEFAULT_LAYOUT);
  const plant = layout.items.find((i) => i.id === 'plant4');
  assert.strictEqual(W.canPlace(layout, plant, 2, 5), false); // na stůl
  assert.strictEqual(W.canPlace(layout, plant, 0, 5), false); // do zdi
  assert.strictEqual(W.canPlace(layout, plant, 17, 8), true);
  const win = layout.items.find((i) => i.id === 'win1');
  assert.strictEqual(W.canPlace(layout, win, 5, 0), true);
  assert.strictEqual(W.canPlace(layout, win, 7, 0), false); // přes jiné okno
});

test('validace rozložení odmítne nesmysly', () => {
  assert.strictEqual(validateLayout({ items: [{ id: 'x', type: 'raketa', x: 1, y: 1 }] }), null);
  assert.strictEqual(validateLayout({ items: [{ id: 'x', type: 'plant', x: 1.5, y: 1 }] }), null);
  assert.strictEqual(validateLayout(null), null);
});
