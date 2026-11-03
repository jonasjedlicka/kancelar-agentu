/* Vykreslení dlaždic, stěn a nábytku. Vše kreslí kód po pixelech. */
(function (K) {
  'use strict';
  var Wd = K.world, T = Wd.T;
  var shade = K.sprites.shade;

  function hash(x, y) { var h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function R(ctx) { return function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }; }

  /* ---------- Podlahy a stěny ---------- */
  function floorTile(r, zone, tx, ty) {
    var X = tx * T, Y = ty * T, i, h = hash(tx, ty);
    if (zone === 'office') {
      for (i = 0; i < 4; i++) {
        var base = ['#a7774e', '#a27149', '#ab7c52', '#9f6f47'][(i + ty * 3 + Math.floor(hash(tx >> 1, ty * 4 + i) * 3)) % 4];
        r(X, Y + i * 4, T, 4, base);
        r(X, Y + i * 4 + 3, T, 1, '#87593a');
        var off = ((ty * 4 + i) % 2) * 8 + Math.floor(hash(ty, i) * 4);
        r(X + (off % 16), Y + i * 4, 1, 3, '#8d5f3e');
      }
      if (h < 0.15) r(X + 4 + Math.floor(h * 40), Y + 6, 2, 1, '#94653f');
    } else if (zone === 'kitchen') {
      for (var j = 0; j < 2; j++) for (i = 0; i < 2; i++) {
        r(X + i * 8, Y + j * 8, 8, 8, (i + j + tx + ty) % 2 ? '#dcd6c6' : '#b9c4c8');
        r(X + i * 8, Y + j * 8 + 7, 8, 1, '#a8a294');
        r(X + i * 8 + 7, Y + j * 8, 1, 8, '#a8a294');
      }
    } else {
      r(X, Y, T, T, '#6d5a78');
      for (i = 0; i < 6; i++) {
        var hx = Math.floor(hash(tx * 7 + i, ty) * 16), hy = Math.floor(hash(tx, ty * 7 + i) * 16);
        r(X + hx, Y + hy, 1, 1, i % 2 ? '#7a6786' : '#62506c');
      }
    }
  }

  function buildBackground(t) {
    var c = K.sprites.canvas(Wd.W * T, Wd.H * T), ctx = c.getContext('2d'), r = R(ctx);
    r(0, 0, Wd.W * T, Wd.H * T, '#2b3044');
    for (var y = 2; y < Wd.H - 1; y++) for (var x = 1; x < Wd.W - 1; x++) {
      floorTile(r, x === 20 ? 'office' : Wd.zone(x, y), x, y);
    }
    // horní stěna s tapetou
    r(0, 0, Wd.W * T, 2 * T, '#56607e');
    for (x = 0; x < Wd.W * T; x += 8) r(x, 6, 1, 2 * T - 10, '#5c6786');
    r(0, 0, Wd.W * T, 5, '#2b3044');
    r(0, 5, Wd.W * T, 1, '#6e7a9c');
    r(0, 2 * T - 4, Wd.W * T, 4, '#3a3448');
    r(0, 2 * T - 4, Wd.W * T, 1, '#4e4660');
    // kuchyňská stěna – obklad
    for (x = 21 * T; x < 31 * T; x += 6) for (y = 8; y < 2 * T - 4; y += 6) {
      r(x, y, 6, 6, (x / 6 + y / 6) % 2 ? '#d8e2e6' : '#c6d2d8'); r(x, y + 5, 6, 1, '#a9b6bc');
    }
    // boční a spodní stěna (pohled shora)
    r(0, 0, T, Wd.H * T, '#2b3044'); r(T - 2, 2 * T, 2, (Wd.H - 3) * T, '#3d4460');
    r((Wd.W - 1) * T, 0, T, Wd.H * T, '#2b3044'); r((Wd.W - 1) * T, 2 * T, 2, (Wd.H - 3) * T, '#3d4460');
    r(0, (Wd.H - 1) * T, Wd.W * T, T, '#2b3044'); r(T, (Wd.H - 1) * T, (Wd.W - 2) * T, 2, '#3d4460');
    // dveře dole
    var D = Wd.DOOR;
    r(D.x * T - 2, (Wd.H - 1) * T, T + 4, T, '#1f2232');
    r(D.x * T, (Wd.H - 1) * T, T, T - 3, '#7a5236');
    r(D.x * T + 2, (Wd.H - 1) * T + 2, T - 4, 1, '#94673f');
    r(D.x * T + 1, D.y * T + 10, T - 2, 6, '#6a4a6a'); r(D.x * T + 2, D.y * T + 11, T - 4, 4, '#8a5a7a');
    // příčka
    [[2, 7], [13, 18]].forEach(function (seg) {
      r(20 * T + 3, seg[0] * T, T - 6, (seg[1] - seg[0] + 1) * T, '#2b3044');
      r(20 * T + 3, seg[0] * T, 1, (seg[1] - seg[0] + 1) * T, '#3d4460');
      r(20 * T + T - 4, seg[0] * T, 1, (seg[1] - seg[0] + 1) * T, '#3d4460');
    });
    r(20 * T + 3, 7 * T + 10, T - 6, 6, '#56607e'); r(20 * T + 3, 7 * T + 15, T - 6, 1, '#3a3448');
    return c;
  }

  /* ---------- Nábytek (statické části se cachují) ---------- */
  var cache = {};
  function cached(key, w, h, ox, oy, fn) {
    if (!cache[key]) {
      var c = K.sprites.canvas(w, h), ctx = c.getContext('2d');
      fn(R(ctx), ctx);
      cache[key] = { c: c, ox: ox, oy: oy };
    }
    return cache[key];
  }

  var DRAW = {};

  DRAW.desk = function (r) { // 32×30, kotva (0,14)
    var Y = 14;
    r(1, Y - 4, 30, 14, '#5c3a22');
    r(2, Y - 4, 28, 12, '#c98d5a'); r(2, Y - 4, 28, 1, '#dca476'); r(2, Y + 7, 28, 1, '#ad7646');
    r(2, Y + 8, 28, 6, '#8e5a34'); r(2, Y + 8, 28, 1, '#6e4426');
    r(3, Y + 9, 12, 4, '#9c6a3e'); r(17, Y + 9, 12, 4, '#9c6a3e'); r(8, Y + 10, 2, 1, '#d8b080'); r(22, Y + 10, 2, 1, '#d8b080');
    r(2, Y + 14, 2, 2, '#4a2e1a'); r(28, Y + 14, 2, 2, '#4a2e1a');
    // monitor
    r(4, Y - 14, 24, 15, '#1d2029'); r(5, Y - 13, 22, 12, '#11141b');
    r(14, Y + 1, 4, 2, '#2a2e3a'); r(11, Y + 3, 10, 1, '#2a2e3a');
    // klávesnice, myš, hrnek, papíry
    r(9, Y + 4, 14, 3, '#d8dae2'); r(9, Y + 6, 14, 1, '#a8acb8');
    for (var i = 0; i < 6; i++) r(10 + i * 2, Y + 5, 1, 1, '#9498a6');
    r(24, Y + 4, 2, 3, '#e8e8ee');
    r(27, Y - 2, 3, 4, '#e8e4dc'); r(28, Y - 1, 1, 1, '#7a4a2a');
    r(2, Y - 2, 5, 6, '#f4f0e6'); r(3, Y - 1, 3, 1, '#b8b4aa'); r(3, Y + 1, 3, 1, '#b8b4aa');
  };
  DRAW.chair = function (r) { // 16×16, opěradlo blíž k divákovi
    r(3, 2, 10, 7, '#3c4050'); r(4, 3, 8, 5, '#4c5266');
    r(2, 8, 12, 6, '#2a2d3a'); r(3, 8, 10, 4, '#555b72'); r(3, 8, 10, 1, '#6a7290');
    r(7, 14, 2, 1, '#1e2028'); r(4, 15, 8, 1, '#1e2028');
  };
  DRAW.stool = function (r) {
    r(4, 6, 8, 5, '#6e4426'); r(5, 6, 6, 3, '#b07a4a'); r(5, 11, 1, 3, '#4a2e1a'); r(10, 11, 1, 3, '#4a2e1a');
  };
  DRAW.plant = function (r) { // 16×22, kotva (0,6)
    r(4, 14, 8, 8, '#8a4a2a'); r(5, 14, 6, 7, '#c06a3a'); r(5, 14, 6, 1, '#d88a5a');
    r(3, 3, 10, 11, '#2f7a3a'); r(4, 1, 8, 4, '#3f9a4a'); r(2, 6, 3, 5, '#3f9a4a'); r(11, 5, 3, 6, '#3f9a4a');
    r(6, 4, 2, 2, '#6acb6a'); r(9, 7, 2, 2, '#6acb6a'); r(4, 9, 2, 1, '#6acb6a'); r(7, 10, 2, 3, '#25602e');
  };
  DRAW.bigplant = function (r) { // 16×32, kotva (0,16)
    r(3, 23, 10, 9, '#5a5a66'); r(4, 23, 8, 8, '#8a8a98'); r(4, 23, 8, 1, '#a8a8b6');
    r(7, 14, 2, 10, '#5a4022');
    r(2, 4, 12, 12, '#2f7a3a'); r(4, 0, 8, 6, '#3f9a4a'); r(0, 8, 4, 6, '#3f9a4a'); r(12, 6, 4, 7, '#3f9a4a');
    r(1, 14, 5, 4, '#2f7a3a'); r(10, 13, 5, 4, '#2f7a3a');
    r(6, 2, 2, 2, '#6acb6a'); r(10, 8, 2, 2, '#6acb6a'); r(3, 10, 2, 2, '#6acb6a'); r(7, 7, 2, 2, '#25602e');
  };
  DRAW.counter = function (r) { // 64×22, kotva (0,6)
    r(0, 0, 64, 14, '#8a8c96'); r(1, 0, 62, 13, '#d6d2c8'); r(1, 0, 62, 1, '#eeeae2');
    r(0, 13, 64, 9, '#4e6a82'); r(1, 13, 62, 1, '#3a5268');
    for (var i = 0; i < 4; i++) { r(2 + i * 16, 15, 14, 6, '#6a8aa6'); r(7 + i * 16, 17, 4, 1, '#c8d4de'); }
    r(18, 2, 14, 9, '#8a96a0'); r(19, 3, 12, 7, '#5a6670'); r(20, 4, 10, 1, '#7a8690');
    r(24, 0, 2, 3, '#a8b0b8'); r(23, 0, 4, 1, '#c8d0d8');
    r(40, 3, 10, 7, '#c89a62'); r(41, 4, 8, 5, '#dab07a');
    r(4, 3, 9, 6, '#f0f0f0'); r(5, 4, 3, 3, '#e04a3a'); r(8, 4, 3, 3, '#f2c230'); r(6, 6, 3, 2, '#6acb4a');
    r(54, 2, 6, 8, '#3a3a44'); r(55, 3, 4, 4, '#5a5a66');
  };
  DRAW.coffee = function (r) { // 16×26, kotva (0,10)
    r(1, 14, 14, 12, '#4e6a82'); r(2, 14, 12, 1, '#d6d2c8'); r(2, 15, 12, 10, '#6a8aa6'); r(6, 19, 4, 1, '#c8d4de');
    r(3, 0, 10, 14, '#2a2a30'); r(4, 1, 8, 4, '#c0392b'); r(5, 2, 3, 1, '#ff7a6a');
    r(5, 7, 6, 5, '#141418'); r(6, 10, 4, 2, '#f0f0f0'); r(10, 6, 1, 1, '#6acb6a');
  };
  DRAW.fridge = function (r) { // 16×32, kotva (0,16)
    r(1, 0, 14, 32, '#9aa4ae'); r(2, 1, 12, 30, '#e6ecf0'); r(2, 1, 12, 1, '#ffffff');
    r(2, 11, 12, 1, '#9aa4ae'); r(11, 4, 1, 5, '#8a949e'); r(11, 14, 1, 8, '#8a949e');
    r(4, 3, 3, 2, '#e05a5a'); r(5, 6, 3, 2, '#5aa0e0');
  };
  DRAW.ktable = function (r) { // 32×18, kotva (0,4)
    r(1, 0, 30, 12, '#6e4426'); r(2, 0, 28, 10, '#c48a52'); r(2, 0, 28, 1, '#daa46e');
    r(3, 12, 2, 6, '#4a2e1a'); r(27, 12, 2, 6, '#4a2e1a');
    r(6, 3, 5, 4, '#f0f0f0'); r(7, 4, 3, 2, '#e8c060'); r(21, 3, 5, 4, '#f0f0f0'); r(22, 4, 3, 2, '#a85a3a');
    r(14, 2, 4, 5, '#6aa0d0'); r(15, 1, 2, 1, '#6acb6a');
  };
  DRAW.sofa = function (r) { // 48×24, kotva (0,8)
    r(0, 0, 48, 22, '#5a2228');
    r(1, 1, 46, 9, '#a8424a'); r(1, 1, 46, 1, '#c8626a');
    r(1, 10, 46, 9, '#c85a62'); r(16, 10, 1, 9, '#a8424a'); r(31, 10, 1, 9, '#a8424a');
    r(1, 19, 46, 3, '#8a343c');
    r(0, 4, 5, 18, '#9a3a42'); r(43, 4, 5, 18, '#9a3a42'); r(1, 4, 3, 1, '#c8626a'); r(44, 4, 3, 1, '#c8626a');
  };
  DRAW.armchair = function (r) { // 16×24, kotva (0,8)
    r(0, 0, 16, 22, '#1e4a4a'); r(1, 1, 14, 9, '#3a8a86'); r(1, 1, 14, 1, '#5aaaa6');
    r(1, 10, 14, 9, '#4aa29e'); r(1, 19, 14, 3, '#2a6a66');
    r(0, 4, 3, 18, '#2f7a76'); r(13, 4, 3, 18, '#2f7a76');
  };
  DRAW.ctable = function (r) { // 32×16
    r(1, 2, 30, 11, '#3a2416'); r(2, 2, 28, 9, '#6e4426'); r(2, 2, 28, 1, '#8a5a36');
    r(3, 13, 2, 3, '#2a1a10'); r(27, 13, 2, 3, '#2a1a10');
    r(6, 4, 8, 5, '#e8e0d0'); r(7, 5, 6, 1, '#c04a3a'); r(20, 4, 3, 4, '#f0f0f0'); r(21, 5, 1, 1, '#7a4a2a');
  };
  DRAW.rug = function (r) { // 112×80
    r(0, 0, 112, 80, '#7a3a3a'); r(2, 2, 108, 76, '#b8864a'); r(4, 4, 104, 72, '#8a4a4a');
    r(8, 8, 96, 64, '#a85a50');
    for (var i = 0; i < 112; i += 8) { r(i + 3, 1, 2, 1, '#e8c87a'); r(i + 3, 78, 2, 1, '#e8c87a'); }
    for (var y = 16; y < 72; y += 16) for (var x = 16; x < 104; x += 16) { r(x - 2, y - 1, 4, 2, '#d89a6a'); r(x - 1, y - 2, 2, 4, '#d89a6a'); }
  };
  DRAW.rugblue = function (r) { // 64×48
    r(0, 0, 64, 48, '#26385e'); r(2, 2, 60, 44, '#3a5a8a'); r(5, 5, 54, 38, '#2e4a76');
    for (var x = 8; x < 58; x += 6) r(x, 23, 3, 2, '#6a8ac0');
  };
  DRAW.bookshelf = function (r) { // 32×36, kotva (0,20)
    r(0, 0, 32, 36, '#4a2e1a'); r(1, 1, 30, 33, '#7a4e2e');
    var cols = ['#c0392b', '#2f6fd0', '#3f9a4a', '#e0a030', '#8a4ac0', '#e8e0d0', '#2a9a9a', '#d0604a'];
    for (var s = 0; s < 3; s++) {
      var sy = 2 + s * 11;
      r(1, sy + 9, 30, 2, '#5a3820');
      var bx = 2;
      for (var k = 0; bx < 29; k++) {
        var bw = 2 + ((k * 7 + s * 3) % 3), bh = 6 + ((k * 5 + s) % 3);
        if (bx + bw > 30) break;
        r(bx, sy + 9 - bh, bw, bh, cols[(k + s * 3) % cols.length]);
        r(bx, sy + 9 - bh, 1, bh, shade(cols[(k + s * 3) % cols.length], 0.25));
        bx += bw + (k % 4 === 3 ? 2 : 0);
      }
    }
    r(1, 34, 30, 2, '#3a2414');
  };
  DRAW.watercooler = function (r) { // 16×30, kotva (0,14)
    r(4, 0, 8, 12, '#4a8ac8'); r(5, 1, 6, 10, '#7ab8ee'); r(6, 2, 1, 7, '#c8e6ff');
    r(2, 12, 12, 18, '#c8ccd4'); r(3, 13, 10, 16, '#eceef2'); r(5, 16, 2, 2, '#e05a5a'); r(9, 16, 2, 2, '#5a8ae0');
    r(5, 22, 6, 1, '#a8acb4');
  };
  DRAW.printer = function (r) { // 16×22, kotva (0,6)
    r(1, 4, 14, 10, '#5a5e6a'); r(2, 5, 12, 6, '#c8ccd4'); r(2, 5, 12, 1, '#e8eaee');
    r(4, 1, 8, 5, '#f8f8f8'); r(3, 9, 10, 1, '#3a3e48'); r(11, 6, 2, 1, '#6acb6a');
    r(2, 14, 12, 8, '#3a3e48'); r(3, 15, 10, 6, '#4a4e5a');
  };
  DRAW.lamp = function (r) { // 16×30, kotva (0,14)
    r(3, 0, 10, 7, '#e8c87a'); r(4, 1, 8, 5, '#f8e2a0'); r(7, 7, 2, 19, '#3a3a44'); r(4, 26, 8, 3, '#2a2a30');
  };
  DRAW.cabinet = function (r) { // 16×26, kotva (0,10)
    r(1, 0, 14, 26, '#5a6270'); r(2, 1, 12, 24, '#8a94a4');
    for (var i = 0; i < 3; i++) { r(2, 1 + i * 8, 12, 1, '#a8b2c2'); r(2, 8 + i * 8, 12, 1, '#5a6270'); r(6, 4 + i * 8, 4, 1, '#d8dee8'); }
  };

  var SPEC = {
    desk: [32, 30, 0, 14], plant: [16, 22, 0, 6], bigplant: [16, 32, 0, 16], counter: [64, 22, 0, 6],
    coffee: [16, 26, 0, 10], fridge: [16, 32, 0, 16], ktable: [32, 18, 0, 4], sofa: [48, 24, 0, 8],
    armchair: [16, 24, 0, 8], ctable: [32, 16, 0, 0], rug: [112, 80, 0, 0], rugblue: [64, 48, 0, 0],
    bookshelf: [32, 36, 0, 20], watercooler: [16, 30, 0, 14], printer: [16, 22, 0, 6], lamp: [16, 30, 0, 14],
    cabinet: [16, 26, 0, 10], chair: [16, 16, 0, 0], stool: [16, 16, 0, 0]
  };

  function drawStatic(ctx, type, px, py) {
    var s = SPEC[type];
    var e = cached(type, s[0], s[1], s[2], s[3], DRAW[type]);
    ctx.drawImage(e.c, px - e.ox, py - e.oy);
  }

  /* ---------- Dynamické prvky na stěně ---------- */
  function skyColors(hour) {
    if (hour >= 7 && hour < 17) return ['#7cc4f4', '#a8dcff'];
    if (hour >= 17 && hour < 20) return ['#f08a5a', '#f8c080'];
    if (hour >= 5 && hour < 7) return ['#9a8ac8', '#f0b090'];
    return ['#14204a', '#24346a'];
  }
  function drawWindow(ctx, px, py, now) {
    var r = R(ctx), hour = now.getHours(), sky = skyColors(hour);
    r(px + 2, py + 6, 28, 22, '#2b3044');
    r(px + 3, py + 7, 26, 19, sky[0]); r(px + 3, py + 18, 26, 8, sky[1]);
    if (hour < 5 || hour >= 20) {
      [[6, 9], [14, 12], [22, 8], [10, 15], [25, 14]].forEach(function (s) { r(px + s[0], py + s[1], 1, 1, '#f8f0c0'); });
      r(px + 20, py + 10, 3, 3, '#f0e8c0');
    } else {
      var cx = (Math.floor(now.getTime() / 4000) % 40) - 8;
      r(px + 3 + Math.max(0, cx), py + 11, Math.max(0, Math.min(8, 26 - cx)), 2, '#ffffff');
      r(px + 5 + Math.max(0, cx), py + 10, Math.max(0, Math.min(4, 24 - cx)), 1, '#ffffff');
      r(px + 3, py + 22, 26, 4, '#5a9a5a'); r(px + 8, py + 20, 6, 2, '#4a8a4a');
    }
    r(px + 15, py + 7, 2, 19, '#e8e4dc'); r(px + 3, py + 16, 26, 1, '#e8e4dc');
    r(px + 1, py + 26, 30, 3, '#e8e4dc'); r(px + 1, py + 28, 30, 1, '#a8a49c');
    r(px + 3, py + 7, 26, 1, '#c8c4bc');
  }
  function drawClock(ctx, px, py, now) {
    var r = R(ctx);
    r(px + 3, py + 8, 10, 10, '#2b2b34'); r(px + 4, py + 7, 8, 12, '#2b2b34');
    r(px + 4, py + 9, 8, 8, '#f4f0e6'); r(px + 5, py + 8, 6, 10, '#f4f0e6');
    var h = now.getHours() % 12, m = now.getMinutes();
    var cx = px + 8, cy = py + 13;
    var dirs = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    var mi = Math.round(m / 7.5) % 8, hi = Math.round((h + m / 60) / 1.5) % 8;
    for (var i = 1; i <= 3; i++) r(cx + dirs[mi][0] * i, cy + dirs[mi][1] * i, 1, 1, '#2a2a3a');
    for (var j = 1; j <= 2; j++) r(cx + dirs[hi][0] * j, cy + dirs[hi][1] * j, 1, 1, '#c0392b');
    r(cx, cy, 1, 1, '#2a2a3a');
  }
  function drawWhiteboard(ctx, px, py, notes) {
    var r = R(ctx);
    r(px + 1, py + 6, 46, 23, '#8a8e9a'); r(px + 2, py + 7, 44, 20, '#f6f8fa');
    r(px + 2, py + 27, 44, 2, '#6a6e7a'); r(px + 6, py + 26, 4, 1, '#d8403a'); r(px + 12, py + 26, 4, 1, '#2f6fd0');
    K.KFont.draw(ctx, 'Úkoly', px + 4, py + 5, '#2a3a6a');
    r(px + 27, py + 11, 14, 1, '#9aa8c8'); r(px + 27, py + 14, 10, 1, '#9aa8c8');
    notes.slice(0, 9).forEach(function (col, i) {
      var nx = px + 4 + i * 4, ny = py + 19;
      r(nx, ny, 3, 3, col); r(nx, ny + 3, 3, 1, shade(col, -0.3));
    });
  }

  /* ---------- Monitor: text úkolu (běžící řádek) ---------- */
  function drawScreen(ctx, px, py, info, t) {
    var r = R(ctx);
    var sx = px + 5, sy = py - 13, sw = 22, sh = 12;
    if (!info) { r(sx + 2, sy + 1, 4, 1, '#22262f'); return; }
    var bg = '#0e2236', fg = '#7cf0b0';
    if (info.state === 'reading') { bg = '#1e2a3e'; fg = '#bcd4ff'; }
    if (info.state === 'thinking') { bg = '#221e3a'; fg = '#c8b4ff'; }
    if (info.state === 'waiting') { bg = Math.floor(t * 2) % 2 ? '#3a2a08' : '#4a3608'; fg = '#ffd060'; }
    if (info.state === 'error') { bg = '#3a0e10'; fg = '#ff8a8a'; }
    if (info.state === 'done') { bg = '#0e2e18'; fg = '#8af0a0'; }
    if (info.state === 'idle') { bg = '#161a24'; fg = '#4a5268'; }
    r(sx, sy, sw, sh, bg);
    var text = info.text || '';
    ctx.save();
    ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
    var w = K.KFont.measure(text);
    var off = 1;
    if (w > sw - 2) {
      var span = w + 14;
      off = 2 - (Math.floor(t * 14) % span);
      K.KFont.draw(ctx, text, sx + off + span, sy, fg);
    }
    K.KFont.draw(ctx, text, sx + off, sy, fg);
    ctx.restore();
    r(sx, sy, sw, 1, 'rgba(255,255,255,0.07)');
  }

  K.render = {
    buildBackground: buildBackground, drawStatic: drawStatic, drawWindow: drawWindow, drawClock: drawClock,
    drawWhiteboard: drawWhiteboard, drawScreen: drawScreen, SPEC: SPEC
  };
})(window.K = window.K || {});
