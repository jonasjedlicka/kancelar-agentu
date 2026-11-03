/* Mapa kanceláře, definice nábytku, výchozí rozložení a hledání cesty (A*). */
(function (K) {
  'use strict';
  var T = 16;          // velikost dlaždice v pixelech
  var W = 32, H = 20;  // rozměr mapy v dlaždicích

  /* Pevné stěny: horní stěna (řádky 0–1), boční a spodní okraj, příčka mezi kanceláří a kuchyňkou/odpočívárnou. */
  function isWall(x, y) {
    if (x <= 0 || x >= W - 1 || y <= 1 || y >= H - 1) return true;
    if (x === 20 && ((y >= 2 && y <= 7) || (y >= 13 && y <= 18))) return true;
    return false;
  }
  function zone(x, y) {
    if (x >= 21 && y <= 9) return 'kitchen';
    if (x >= 21) return 'lounge';
    return 'office';
  }
  var DOOR = { x: 10, y: 18 };

  /* w,h = půdorys; block = neprůchozí; wall = věší se na horní stěnu; floor = koberec (pod vším);
   * soft = dlaždice, kam se dá jen sednout/stoupnout (cíl cesty), ne jimi procházet;
   * spots = místa pro postavy (dx,dy = dlaždice cíle; ox,oy = posun nohou v px; dir; pose; kind). */
  var DEFS = {
    desk: { name: 'Stůl s monitorem', w: 2, h: 1, block: true, soft: [[0, 1], [1, 1]],
      spots: [{ dx: 0, dy: 1, ox: 16, oy: 13, dir: 'up', kind: 'desk' }] },
    plant: { name: 'Rostlina', w: 1, h: 1, block: true },
    bigplant: { name: 'Velká rostlina', w: 1, h: 1, block: true },
    counter: { name: 'Kuchyňská linka', w: 4, h: 1, block: true,
      spots: [{ dx: 1, dy: 1, ox: 8, oy: 11, dir: 'up', pose: 'stand', kind: 'leisure' },
              { dx: 3, dy: 1, ox: 8, oy: 11, dir: 'up', pose: 'stand', kind: 'leisure' }] },
    fridge: { name: 'Lednice', w: 1, h: 1, block: true },
    coffee: { name: 'Kávovar', w: 1, h: 1, block: true,
      spots: [{ dx: 0, dy: 1, ox: 8, oy: 11, dir: 'up', pose: 'stand', kind: 'leisure' }] },
    ktable: { name: 'Jídelní stůl', w: 2, h: 1, block: true, soft: [[0, 1], [1, 1]],
      spots: [{ dx: 0, dy: 1, ox: 8, oy: 12, dir: 'up', pose: 'sitidle', kind: 'leisure', stool: true },
              { dx: 1, dy: 1, ox: 8, oy: 12, dir: 'up', pose: 'sitidle', kind: 'leisure', stool: true }] },
    sofa: { name: 'Pohovka', w: 3, h: 1, block: true, soft: [[0, 0], [1, 0], [2, 0]],
      spots: [{ dx: 0, dy: 0, ox: 9, oy: 13, dir: 'down', pose: 'sitfront', kind: 'leisure' },
              { dx: 1, dy: 0, ox: 8, oy: 13, dir: 'down', pose: 'sitfront', kind: 'leisure' },
              { dx: 2, dy: 0, ox: 7, oy: 13, dir: 'down', pose: 'sitfront', kind: 'leisure' }] },
    armchair: { name: 'Křeslo', w: 1, h: 1, block: true, soft: [[0, 0]],
      spots: [{ dx: 0, dy: 0, ox: 8, oy: 13, dir: 'down', pose: 'sitfront', kind: 'leisure' }] },
    ctable: { name: 'Konferenční stolek', w: 2, h: 1, block: true },
    rug: { name: 'Koberec', w: 7, h: 5, floor: true },
    rugblue: { name: 'Modrý koberec', w: 4, h: 3, floor: true },
    whiteboard: { name: 'Tabule', w: 3, h: 2, wall: true,
      spots: [{ dx: 0, dy: 2, ox: 8, oy: 11, dir: 'up', kind: 'board' },
              { dx: 1, dy: 2, ox: 8, oy: 11, dir: 'up', kind: 'board' },
              { dx: 2, dy: 2, ox: 8, oy: 11, dir: 'up', kind: 'board' }] },
    window: { name: 'Okno', w: 2, h: 2, wall: true },
    clock: { name: 'Hodiny', w: 1, h: 2, wall: true },
    bookshelf: { name: 'Knihovna', w: 2, h: 1, block: true,
      spots: [{ dx: 0, dy: 1, ox: 12, oy: 11, dir: 'up', pose: 'stand', kind: 'leisure' }] },
    watercooler: { name: 'Barel s vodou', w: 1, h: 1, block: true,
      spots: [{ dx: 0, dy: 1, ox: 8, oy: 11, dir: 'up', pose: 'stand', kind: 'leisure' }] },
    printer: { name: 'Tiskárna', w: 1, h: 1, block: true },
    lamp: { name: 'Lampa', w: 1, h: 1, block: true },
    cabinet: { name: 'Kartotéka', w: 1, h: 1, block: true }
  };

  var DEFAULT_LAYOUT = { version: 1, items: [
    { id: 'rug1', type: 'rug', x: 22, y: 12 },
    { id: 'rug2', type: 'rugblue', x: 14, y: 14 },
    { id: 'win1', type: 'window', x: 3, y: 0 },
    { id: 'win2', type: 'window', x: 8, y: 0 },
    { id: 'win3', type: 'window', x: 13, y: 0 },
    { id: 'board', type: 'whiteboard', x: 16, y: 0 },
    { id: 'clock', type: 'clock', x: 22, y: 0 },
    { id: 'win4', type: 'window', x: 24, y: 0 },
    { id: 'win5', type: 'window', x: 28, y: 0 },
    { id: 'd-sef', type: 'desk', x: 2, y: 5, owner: 'sef' },
    { id: 'd-tajemnik', type: 'desk', x: 6, y: 5, owner: 'tajemnik' },
    { id: 'd-planovac', type: 'desk', x: 10, y: 5, owner: 'planovac' },
    { id: 'd-knihovnik', type: 'desk', x: 14, y: 5, owner: 'knihovnik' },
    { id: 'd-skolnik', type: 'desk', x: 2, y: 10, owner: 'skolnik' },
    { id: 'd-kuchar', type: 'desk', x: 6, y: 10, owner: 'kuchar' },
    { id: 'd-spravce', type: 'desk', x: 10, y: 10, owner: 'spravce' },
    { id: 'd-host1', type: 'desk', x: 14, y: 10 },
    { id: 'd-host2', type: 'desk', x: 2, y: 15 },
    { id: 'd-host3', type: 'desk', x: 6, y: 15 },
    { id: 'shelf1', type: 'bookshelf', x: 10, y: 2 },
    { id: 'cab1', type: 'cabinet', x: 13, y: 2 },
    { id: 'printer', type: 'printer', x: 14, y: 2 },
    { id: 'plant1', type: 'bigplant', x: 1, y: 2 },
    { id: 'plant2', type: 'plant', x: 19, y: 2 },
    { id: 'plant3', type: 'bigplant', x: 1, y: 18 },
    { id: 'plant4', type: 'plant', x: 12, y: 18 },
    { id: 'water', type: 'watercooler', x: 19, y: 9 },
    { id: 'counter', type: 'counter', x: 21, y: 2 },
    { id: 'coffee', type: 'coffee', x: 25, y: 2 },
    { id: 'fridge', type: 'fridge', x: 27, y: 2 },
    { id: 'plant5', type: 'plant', x: 30, y: 2 },
    { id: 'ktable', type: 'ktable', x: 24, y: 6 },
    { id: 'sofa', type: 'sofa', x: 24, y: 13 },
    { id: 'ctable', type: 'ctable', x: 24, y: 15 },
    { id: 'arm1', type: 'armchair', x: 28, y: 14 },
    { id: 'lamp', type: 'lamp', x: 30, y: 12 },
    { id: 'plant6', type: 'bigplant', x: 21, y: 18 },
    { id: 'plant7', type: 'plant', x: 30, y: 18 },
    { id: 'shelf2', type: 'bookshelf', x: 22, y: 11 }
  ] };

  function cloneLayout(l) { return JSON.parse(JSON.stringify(l)); }

  function footprint(it) {
    var d = DEFS[it.type];
    var cells = [];
    for (var j = 0; j < d.h; j++) for (var i = 0; i < d.w; i++) cells.push([it.x + i, it.y + j]);
    return cells;
  }
  function softCells(it) {
    var d = DEFS[it.type];
    return (d.soft || []).map(function (s) { return [it.x + s[0], it.y + s[1]]; });
  }

  /* 0 = volno, 1 = zeď/nábytek, 2 = jen jako cíl (židle, pohovka). */
  function buildGrid(layout) {
    var g = new Uint8Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (isWall(x, y)) g[y * W + x] = 1;
    layout.items.forEach(function (it) {
      var d = DEFS[it.type];
      if (!d || d.floor || d.wall) return;
      if (d.block) footprint(it).forEach(function (c) { if (inMap(c[0], c[1])) g[c[1] * W + c[0]] = 1; });
      softCells(it).forEach(function (c) { if (inMap(c[0], c[1]) && !isWall(c[0], c[1])) g[c[1] * W + c[0]] = 2; });
    });
    return g;
  }
  function inMap(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

  /* Platnost umístění v editoru. */
  function canPlace(layout, item, x, y) {
    var d = DEFS[item.type];
    if (d.wall) {
      if (y !== 0 || x < 1 || x + d.w > W - 1) return false;
      if (x <= 20 && x + d.w > 20) return false; // ne přes příčku
      return !layout.items.some(function (o) {
        if (o === item || !DEFS[o.type].wall) return false;
        return x < o.x + DEFS[o.type].w && o.x < x + d.w;
      });
    }
    var probe = { type: item.type, x: x, y: y };
    var cells = footprint(probe).concat(d.floor ? [] : softCells(probe));
    for (var i = 0; i < cells.length; i++) {
      if (!inMap(cells[i][0], cells[i][1]) || isWall(cells[i][0], cells[i][1])) return false;
    }
    if (d.floor) return true;
    var taken = {};
    layout.items.forEach(function (o) {
      if (o === item) return;
      var od = DEFS[o.type];
      if (od.floor || od.wall) return;
      footprint(o).concat(softCells(o)).forEach(function (c) { taken[c[0] + ',' + c[1]] = 1; });
    });
    for (var k = 0; k < cells.length; k++) if (taken[cells[k][0] + ',' + cells[k][1]]) return false;
    // nesmí zablokovat dveře
    if (cells.some(function (c) { return c[0] === DOOR.x && c[1] === DOOR.y; })) return false;
    return true;
  }

  function spotsFor(layout) {
    var out = [];
    layout.items.forEach(function (it) {
      var d = DEFS[it.type];
      (d.spots || []).forEach(function (s, i) {
        out.push({
          key: it.id + ':' + i,
          item: it.id,
          owner: it.type === 'desk' ? (it.owner || null) : null,
          kind: s.kind,
          x: it.x + s.dx,
          y: it.y + s.dy,
          px: (it.x + s.dx) * T + s.ox,
          py: (it.y + s.dy) * T + s.oy,
          dir: s.dir,
          pose: s.pose || null,
          stool: !!s.stool
        });
      });
    });
    return out;
  }

  /* A* na mřížce se 4 směry. Vrací pole dlaždic [x,y] bez startu, nebo null. */
  function findPath(grid, sx, sy, gx, gy) {
    if (!inMap(sx, sy) || !inMap(gx, gy)) return null;
    if (sx === gx && sy === gy) return [];
    if (grid[gy * W + gx] === 1) return null;
    var N = W * H;
    var gScore = new Float32Array(N).fill(Infinity);
    var came = new Int32Array(N).fill(-1);
    var closed = new Uint8Array(N);
    var open = [];
    var start = sy * W + sx, goal = gy * W + gx;
    gScore[start] = 0;
    open.push({ i: start, f: Math.abs(sx - gx) + Math.abs(sy - gy) });
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (open.length) {
      var best = 0;
      for (var k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
      var cur = open.splice(best, 1)[0].i;
      if (cur === goal) {
        var path = [];
        while (cur !== start) { path.push([cur % W, Math.floor(cur / W)]); cur = came[cur]; }
        return path.reverse();
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
      var cx = cur % W, cy = Math.floor(cur / W);
      for (var d = 0; d < 4; d++) {
        var nx = cx + dirs[d][0], ny = cy + dirs[d][1];
        if (!inMap(nx, ny)) continue;
        var ni = ny * W + nx;
        var cell = grid[ni];
        if (cell === 1 || (cell === 2 && ni !== goal)) continue;
        if (closed[ni]) continue;
        // mírná penalizace zatáček, aby cesty vypadaly přirozeně
        var prev = came[cur];
        var turn = prev >= 0 && ((prev % W === cx) !== (dirs[d][0] === 0)) ? 0.01 : 0;
        var tentative = gScore[cur] + 1 + turn;
        if (tentative < gScore[ni]) {
          gScore[ni] = tentative;
          came[ni] = cur;
          open.push({ i: ni, f: tentative + Math.abs(nx - gx) + Math.abs(ny - gy) });
        }
      }
    }
    return null;
  }

  /* Nejbližší průchozí dlaždice (když postavu „zavalí“ nábytek). */
  function nearestFree(grid, x, y) {
    for (var r = 0; r < Math.max(W, H); r++) {
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        var nx = x + dx, ny = y + dy;
        if (inMap(nx, ny) && grid[ny * W + nx] === 0) return [nx, ny];
      }
    }
    return [DOOR.x, DOOR.y];
  }

  K.world = {
    T: T, W: W, H: H, DEFS: DEFS, DOOR: DOOR, DEFAULT_LAYOUT: DEFAULT_LAYOUT,
    isWall: isWall, zone: zone, buildGrid: buildGrid, canPlace: canPlace, spotsFor: spotsFor,
    findPath: findPath, nearestFree: nearestFree, footprint: footprint, cloneLayout: cloneLayout, inMap: inMap
  };
})(typeof window !== 'undefined' ? (window.K = window.K || {}) : (module.exports = {}));
