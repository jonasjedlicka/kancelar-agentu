/* Vykreslování bitmapového písma Kancl Pixel na Canvas 2D (bez vyhlazování). */
(function (root) {
  'use strict';
  var D = root.KFONT_DATA;
  var TOP = 3; // řádky nad horní hranou verzálek vyhrazené pro diakritiku
  var cache = {};

  function parse(str) { return str.split('|'); }

  function build(ch) {
    var rows, w, px = [];
    var acc = D.accents[ch];
    if (D.glyphs[ch]) {
      rows = parse(D.glyphs[ch]);
    } else if (acc && D.glyphs[acc[0]]) {
      rows = parse(D.glyphs[acc[0]]);
    } else {
      rows = parse(D.glyphs['?']);
    }
    w = 0;
    rows.forEach(function (r) { w = Math.max(w, r.length); });
    rows.forEach(function (r, y) {
      for (var x = 0; x < r.length; x++) if (r[x] === '#') px.push([x, y]);
    });
    if (acc && !D.glyphs[ch]) {
      var tall = px.some(function (p) { return p[1] < 2; });
      if (acc[1] === 'apos') {
        var right = -1;
        px.forEach(function (p) { if (p[1] < 2) right = Math.max(right, p[0]); });
        var col = right + 2;
        px.push([col, 0], [col, 1]);
        w = Math.max(w, col + 1);
      } else {
        var mark = acc[1] === 'ring' && !tall ? D.marks.ringLow : D.marks[acc[1]];
        var mw = 0;
        mark.forEach(function (r) { mw = Math.max(mw, r.length); });
        var ox = Math.floor((w - mw) / 2 + 0.5);
        if (ch === 'í' || ch === 'Í') ox = Math.floor((w - mw + 1) / 2);
        var bottom = tall ? -1 : 1; // spodní řádek značky
        var oy = bottom - mark.length + 1;
        mark.forEach(function (r, y) {
          for (var x = 0; x < r.length; x++) if (r[x] === '#') px.push([ox + x, oy + y]);
        });
      }
    }
    return { w: w, px: px };
  }

  function glyph(ch) {
    if (!cache[ch]) cache[ch] = build(ch);
    return cache[ch];
  }

  function chars(text) { return Array.from(String(text == null ? '' : text)); }

  function measure(text) {
    var w = 0, cs = chars(text);
    cs.forEach(function (c, i) { w += glyph(c).w + (i < cs.length - 1 ? 1 : 0); });
    return w;
  }

  /* y = horní okraj řádku (včetně místa pro diakritiku). */
  function draw(ctx, text, x, y, color, shadow) {
    x = Math.round(x); y = Math.round(y);
    if (shadow) draw(ctx, text, x + 1, y + 1, shadow, null);
    ctx.fillStyle = color;
    var cx = x;
    chars(text).forEach(function (c) {
      var g = glyph(c);
      for (var i = 0; i < g.px.length; i++) ctx.fillRect(cx + g.px[i][0], y + TOP + g.px[i][1], 1, 1);
      cx += g.w + 1;
    });
    return cx - x - 1;
  }

  /* Zkrátí text na max. šířku v pixelech, přidá „…“. */
  function fit(text, maxW) {
    if (measure(text) <= maxW) return text;
    var cs = chars(text);
    while (cs.length && measure(cs.join('') + '…') > maxW) cs.pop();
    return cs.join('') + '…';
  }

  root.KFont = { draw: draw, measure: measure, fit: fit, glyph: glyph, lineHeight: D.lineHeight, top: TOP };
  (root.K = root.K || {}).KFont = root.KFont;
  if (typeof module !== 'undefined') module.exports = root.KFont;
})(typeof window !== 'undefined' ? window : globalThis);
