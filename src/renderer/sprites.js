/* Všechny spritey jsou kreslené kódem po jednotlivých pixelech (žádné cizí obrázky). */
(function (K) {
  'use strict';
  var OUTLINE = '#1b1622';

  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function shade(c, k) {
    var a = hex(c);
    if (k < 0) return toHex(a[0] * (1 + k), a[1] * (1 + k), a[2] * (1 + k));
    return toHex(a[0] + (255 - a[0]) * k, a[1] + (255 - a[1]) * k, a[2] + (255 - a[2]) * k);
  }
  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* ---------- Pixelový buffer s automatickým obrysem ---------- */
  function Buf(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  Buf.prototype.px = function (x, y, c) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; };
  Buf.prototype.rect = function (x, y, w, h, c) { for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.px(x + i, y + j, c); };
  Buf.prototype.clear = function (x, y) { if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = null; };
  Buf.prototype.outline = function (col) {
    var out = this.p.slice();
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      if (this.p[y * this.w + x]) continue;
      var n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) {
        var nx = x + d[0], ny = y + d[1];
        return nx >= 0 && ny >= 0 && nx < this.w && ny < this.h && this.p[ny * this.w + nx] && this.p[ny * this.w + nx] !== col;
      }, this);
      if (n) out[y * this.w + x] = col;
    }
    this.p = out;
    return this;
  };
  Buf.prototype.mirror = function () {
    var out = new Array(this.w * this.h);
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) out[y * this.w + x] = this.p[y * this.w + (this.w - 1 - x)];
    this.p = out;
    return this;
  };
  Buf.prototype.toCanvas = function () {
    var c = canvas(this.w, this.h), ctx = c.getContext('2d');
    var img = ctx.createImageData(this.w, this.h);
    for (var i = 0; i < this.p.length; i++) {
      if (!this.p[i]) continue;
      var a = hex(this.p[i]);
      img.data[i * 4] = a[0]; img.data[i * 4 + 1] = a[1]; img.data[i * 4 + 2] = a[2]; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  };

  /* ---------- Vzhled agentů ---------- */
  var LOOKS = {
    sef:       { skin: '#f1c7a0', hair: '#9aa0a8', style: 'short', shirt: '#2f3d66', pants: '#23263a', shoes: '#3a2418', acc: 'tie', accent: '#d8403a', badge: '#6aa7ff' },
    skolnik:   { skin: '#d9a072', hair: '#5a3a22', style: 'short', shirt: '#3f8f6b', pants: '#4a4a58', shoes: '#2a2a30', acc: 'cap', accent: '#2f6fd0', badge: '#58c4b8' },
    kuchar:    { skin: '#f3cfae', hair: '#3a2a20', style: 'short', shirt: '#f2f2ee', pants: '#555a66', shoes: '#222228', acc: 'chef', accent: '#d8403a', badge: '#ffb07a' },
    tajemnik:  { skin: '#f6d2b5', hair: '#e7c35a', style: 'long', shirt: '#7a4fa8', pants: '#2e2a40', shoes: '#4a2232', acc: 'headset', accent: '#30303a', badge: '#c49bff' },
    planovac:  { skin: '#a86f4a', hair: '#1f1a1a', style: 'spiky', shirt: '#e07b2e', pants: '#2e3e5e', shoes: '#f0f0f0', acc: 'none', accent: '#ffffff', badge: '#ffb340' },
    spravce:   { skin: '#eab48c', hair: '#8a3b20', style: 'short', shirt: '#6a7480', pants: '#3a3f48', shoes: '#2a2018', acc: 'vest', accent: '#f2c230', badge: '#a8b4c4' },
    knihovnik: { skin: '#f0c9a8', hair: '#e8e6e0', style: 'bun', shirt: '#8a5a3a', pants: '#3d3328', shoes: '#2a1e14', acc: 'glasses', accent: '#2a2a2a', badge: '#d9b382' }
  };
  var RANDOM = {
    skin: ['#f1c7a0', '#d9a072', '#a86f4a', '#f6d2b5', '#7a4a30', '#eab48c'],
    hair: ['#1f1a1a', '#5a3a22', '#e7c35a', '#8a3b20', '#9aa0a8', '#2a3a6a', '#7a2a5a'],
    style: ['short', 'long', 'spiky', 'bun', 'bald'],
    shirt: ['#c24a6a', '#3a7ac2', '#5aa04a', '#b0803a', '#6a4ac2', '#2a9a9a', '#c2c23a'],
    pants: ['#23263a', '#4a4a58', '#2e3e5e', '#3d3328'],
    acc: ['none', 'glasses', 'headset', 'none'],
    badge: ['#ff8fb0', '#7ad0ff', '#9be07a', '#ffd27a', '#b99bff', '#7ae0d0']
  };
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function lookFor(id, kind) {
    if (LOOKS[id]) return LOOKS[id];
    var h = hashStr(id), pick = function (arr, k) { return arr[(h >>> k) % arr.length]; };
    return {
      skin: pick(RANDOM.skin, 0), hair: pick(RANDOM.hair, 3), style: pick(RANDOM.style, 6), shirt: kind === 'claude' ? '#c96a3c' : kind === 'ollama' ? '#5a6a7a' : pick(RANDOM.shirt, 9),
      pants: pick(RANDOM.pants, 12), shoes: '#2a2a30', acc: pick(RANDOM.acc, 15), accent: '#30303a', badge: kind === 'claude' ? '#e08a5a' : kind === 'ollama' ? '#c8d0dc' : pick(RANDOM.badge, 18)
    };
  }

  /* ---------- Kreslení postavy 16×24 ---------- */
  // dir: down | up | left | right; pose: walk | stand | wait | type | read | think | sitidle | sitfront | board
  function drawCharacter(L, dir, pose, frame) {
    var b = new Buf(16, 24);
    var shirtD = shade(L.shirt, -0.25), pantsD = shade(L.pants, -0.25), skinD = shade(L.skin, -0.15), hairD = shade(L.hair, -0.25);
    var side = dir === 'left' || dir === 'right';
    var sitting = pose === 'type' || pose === 'read' || pose === 'think' || pose === 'sitidle' || pose === 'sitfront';
    var oy = sitting ? 3 : 0;            // sedící postava je níž
    var bob = (pose === 'walk' && (frame === 1 || frame === 3)) ? 1 : 0;
    var by = oy + bob;                    // posun horní poloviny těla
    var step = pose === 'walk' ? [0, 1, 0, 2][frame % 4] : 0;

    /* nohy */
    if (!sitting) {
      if (side) {
        if (step === 0) { b.rect(6, 18, 4, 4, L.pants); b.rect(5, 22, 5, 2, L.shoes); }
        else if (step === 1) { b.rect(4, 18, 3, 4, L.pants); b.rect(3, 22, 4, 2, L.shoes); b.rect(9, 18, 3, 4, pantsD); b.rect(9, 22, 3, 2, L.shoes); }
        else { b.rect(5, 18, 3, 4, pantsD); b.rect(4, 22, 4, 2, L.shoes); b.rect(8, 18, 3, 4, L.pants); b.rect(8, 22, 3, 2, L.shoes); }
      } else {
        var lUp = step === 1 ? 1 : 0, rUp = step === 2 ? 1 : 0;
        if (pose === 'wait' && frame % 2 === 1) rUp = 1;
        b.rect(5, 18, 3, 4 - lUp, L.pants); b.rect(5, 22 - lUp, 3, 2, L.shoes);
        b.rect(8, 18, 3, 4 - rUp, L.pants); b.rect(8, 22 - rUp, 3, 2, L.shoes);
        b.rect(7, 18, 1, 2, pantsD);
      }
    } else if (pose === 'sitfront') {
      b.rect(5, 19, 3, 3, L.pants); b.rect(8, 19, 3, 3, L.pants); b.rect(7, 19, 1, 2, pantsD);
      b.rect(5, 22, 3, 2, L.shoes); b.rect(8, 22, 3, 2, L.shoes);
    }

    /* trup */
    if (side) {
      b.rect(5, 11 + by, 6, 7, L.shirt); b.rect(5, 17 + by, 6, 1, shirtD);
    } else {
      b.rect(4, 11 + by, 8, 7, L.shirt); b.rect(4, 17 + by, 8, 1, shirtD);
      if (sitting && pose !== 'sitfront') b.rect(4, 18 + by, 8, 2, shirtD);
    }
    if (L.acc === 'vest' && dir !== 'up') {
      if (side) { b.rect(5, 11 + by, 6, 6, L.accent); b.rect(5, 14 + by, 6, 1, '#f4f4e0'); }
      else { b.rect(4, 11 + by, 2, 6, L.accent); b.rect(10, 11 + by, 2, 6, L.accent); b.rect(4, 14 + by, 2, 1, '#f4f4e0'); b.rect(10, 14 + by, 2, 1, '#f4f4e0'); }
    }
    if (L.acc === 'vest' && dir === 'up') { b.rect(4, 11 + by, 8, 6, L.accent); b.rect(4, 14 + by, 8, 1, '#f4f4e0'); }
    if (L.acc === 'tie' && dir === 'down') {
      b.rect(6, 11 + by, 4, 1, '#f2f2f2'); b.rect(7, 11 + by, 2, 1, shade(L.accent, -0.3)); b.rect(7, 12 + by, 2, 4, L.accent); b.px(7, 16 + by, L.accent);
    }
    if (L.style === 'long' && dir === 'up') b.rect(4, 11 + by, 8, 3, L.hair);

    /* ruce */
    var arm = shirtD;
    if (side) {
      var ax = step === 1 ? 4 : step === 2 ? 8 : 7;
      if (pose === 'walk' || pose === 'stand' || pose === 'wait') {
        b.rect(ax, 11 + by, 2, 5, arm); b.rect(ax, 16 + by, 2, 1, L.skin);
      }
    } else if (pose === 'wait' && dir === 'down') {
      b.rect(3, 11 + by, 1, 3, arm); b.rect(12, 11 + by, 1, 3, arm);
      b.rect(4, 13 + by, 8, 2, arm); b.px(5, 13 + by, L.skin); b.px(10, 14 + by, L.skin);
    } else if (pose === 'type') {
      var t = frame % 2;
      b.rect(3, 11 + by, 1, 4, arm); b.rect(12, 11 + by, 1, 4, arm);
      b.rect(2, 9 + by + t, 1, 3, arm); b.px(2, 8 + by + t, L.skin);
      b.rect(13, 9 + by + (1 - t), 1, 3, arm); b.px(13, 8 + by + (1 - t), L.skin);
    } else if (pose === 'read') {
      b.rect(3, 11 + by, 1, 4, arm); b.rect(12, 11 + by, 1, 5, arm); b.px(12, 16 + by, L.skin);
      b.rect(2, 8 + by, 1, 3, arm);
      // kniha zvednutá vedle hlavy
      var cover = frame % 2 ? '#3a6ab0' : '#3466a8';
      b.rect(0, 3 + by, 4, 6, cover); b.rect(0, 3 + by, 1, 6, '#24467a'); b.rect(1, 8 + by, 3, 1, '#f2ead0');
      if (frame % 2) b.px(2, 5 + by, '#f2ead0');
      b.px(3, 8 + by, L.skin);
    } else if (pose === 'think' || pose === 'board') {
      var u = frame % 2;
      b.rect(3, 11 + by, 1, 5, arm); b.px(3, 16 + by, L.skin);
      b.rect(12, 7 + by + u, 1, 5, arm); b.rect(11, 6 + by + u, 2, 1, L.skin);
      if (pose === 'board') { b.rect(12, 4 + u, 1, 4, arm); b.px(12, 3 + u, L.skin); b.px(12, 2 + u, '#d8403a'); }
    } else {
      var sw = pose === 'walk' ? step : 0;
      b.rect(3, 11 + by, 1, sw === 1 ? 5 : 6, arm); b.px(3, (sw === 1 ? 16 : 17) + by, L.skin);
      b.rect(12, 11 + by, 1, sw === 2 ? 5 : 6, arm); b.px(12, (sw === 2 ? 16 : 17) + by, L.skin);
      if (pose === 'sitfront' || pose === 'sitidle') { b.clear(3, 17 + by); b.clear(12, 17 + by); }
    }

    /* hlava */
    var hy = 3 + by;
    b.rect(4, hy, 8, 8, L.skin);
    b.clear(4, hy); b.clear(11, hy); b.clear(4, hy + 7); b.clear(11, hy + 7);
    if (dir === 'down') {
      b.px(6, hy + 4, '#2a1e24'); b.px(9, hy + 4, '#2a1e24');
      b.px(5, hy + 5, shade(L.skin, -0.08)); b.px(10, hy + 5, shade(L.skin, -0.08));
      b.rect(7, hy + 6, 2, 1, skinD);
    } else if (side) {
      b.px(5, hy + 4, '#2a1e24'); b.px(3, hy + 4, L.skin); b.rect(5, hy + 6, 2, 1, skinD);
    }

    /* vlasy */
    var hc = L.hair;
    function hairFront() {
      if (L.style === 'bald') { b.rect(4, hy + 2, 1, 3, hc); b.rect(11, hy + 2, 1, 3, hc); return; }
      b.rect(4, hy - 1, 8, 3, hc); b.clear(4, hy - 1); b.clear(11, hy - 1);
      b.rect(4, hy + 2, 1, 2, hc); b.rect(11, hy + 2, 1, 2, hc);
      b.rect(5, hy + 1, 6, 1, hairD);
      if (L.style === 'spiky') { b.px(5, hy - 2, hc); b.px(7, hy - 2, hc); b.px(9, hy - 2, hc); b.px(10, hy - 2, hc); }
      if (L.style === 'long') { b.rect(3, hy + 1, 1, 8, hc); b.rect(12, hy + 1, 1, 8, hc); b.rect(4, hy + 4, 1, 5, hc); b.rect(11, hy + 4, 1, 5, hc); }
      if (L.style === 'bun') { b.rect(6, hy - 3, 4, 2, hc); b.rect(7, hy - 3, 2, 1, hairD); }
    }
    function hairBack() {
      if (L.style === 'bald') { b.rect(4, hy + 2, 8, 4, hc); b.rect(4, hy, 8, 2, L.skin); b.clear(4, hy); b.clear(11, hy); return; }
      b.rect(4, hy - 1, 8, 8, hc); b.clear(4, hy - 1); b.clear(11, hy - 1);
      b.rect(5, hy + 5, 6, 1, hairD);
      if (L.style === 'spiky') { b.px(5, hy - 2, hc); b.px(7, hy - 2, hc); b.px(9, hy - 2, hc); }
      if (L.style === 'long') { b.rect(3, hy + 1, 10, 9, hc); b.rect(4, hy + 8, 8, 1, hairD); }
      if (L.style === 'bun') { b.rect(6, hy - 3, 4, 3, hc); b.rect(6, hy - 1, 4, 1, hairD); }
    }
    function hairSide() {
      if (L.style === 'bald') { b.rect(9, hy + 2, 3, 4, hc); return; }
      b.rect(4, hy - 1, 8, 3, hc); b.clear(4, hy - 1); b.clear(11, hy - 1);
      b.rect(8, hy + 2, 4, 4, hc); b.rect(9, hy + 6, 3, 1, hairD);
      if (L.style === 'spiky') { b.px(6, hy - 2, hc); b.px(8, hy - 2, hc); b.px(10, hy - 2, hc); }
      if (L.style === 'long') { b.rect(8, hy + 2, 5, 8, hc); }
      if (L.style === 'bun') { b.rect(10, hy - 3, 3, 3, hc); }
    }
    if (dir === 'down') hairFront(); else if (dir === 'up') hairBack(); else hairSide();

    /* doplňky na hlavě */
    if (L.acc === 'cap') {
      b.rect(4, hy - 2, 8, 3, L.accent); b.clear(4, hy - 2); b.clear(11, hy - 2);
      b.rect(5, hy - 2, 3, 1, shade(L.accent, 0.3));
      if (dir === 'down') b.rect(3, hy + 1, 10, 1, shade(L.accent, -0.3));
      else if (side) b.rect(2, hy + 1, 5, 1, shade(L.accent, -0.3));
    }
    if (L.acc === 'chef') {
      b.rect(4, hy - 3, 8, 4, '#ffffff'); b.rect(3, hy - 5, 10, 3, '#ffffff'); b.clear(3, hy - 5); b.clear(12, hy - 5);
      b.rect(4, hy + 1, 8, 1, '#d8d8e0'); b.px(6, hy - 4, '#e4e4ea'); b.px(9, hy - 3, '#e4e4ea');
    }
    if (L.acc === 'glasses' && dir === 'down') {
      b.rect(5, hy + 4, 2, 1, '#2a2a30'); b.rect(9, hy + 4, 2, 1, '#2a2a30'); b.px(7, hy + 4, '#2a2a30'); b.px(8, hy + 4, '#2a2a30');
      b.px(5, hy + 3, '#9ad0ff'); b.px(10, hy + 3, '#9ad0ff');
    }
    if (L.acc === 'glasses' && side) { b.rect(3, hy + 4, 3, 1, '#2a2a30'); b.rect(6, hy + 4, 3, 1, '#2a2a30'); }
    if (L.acc === 'headset') {
      if (dir === 'down') { b.rect(3, hy + 3, 1, 3, L.accent); b.rect(12, hy + 3, 1, 3, L.accent); b.rect(4, hy + 6, 2, 1, L.accent); }
      else if (dir === 'up') { b.rect(3, hy + 3, 1, 3, L.accent); b.rect(12, hy + 3, 1, 3, L.accent); b.rect(4, hy - 1, 8, 1, L.accent); }
      else { b.rect(7, hy + 3, 2, 3, L.accent); b.rect(4, hy + 6, 3, 1, L.accent); }
    }
    if (L.acc === 'vest' && dir === 'down') { b.rect(5, hy + 7, 6, 1, shade(L.hair, -0.1)); } // vousy

    b.outline(OUTLINE);
    if (dir === 'right') b.mirror();
    return b.toCanvas();
  }

  function CharacterSprites(look) {
    this.look = look;
    this.cache = {};
  }
  CharacterSprites.prototype.get = function (dir, pose, frame) {
    var k = dir + '|' + pose + '|' + frame;
    if (!this.cache[k]) this.cache[k] = drawCharacter(this.look, dir, pose, frame);
    return this.cache[k];
  };
  CharacterSprites.prototype.silhouette = function (dir, pose, frame, color) {
    var k = 's|' + color + '|' + dir + '|' + pose + '|' + frame;
    if (!this.cache[k]) {
      var src = this.get(dir, pose, frame), c = canvas(16, 24), x = c.getContext('2d');
      x.drawImage(src, 0, 0);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = color; x.fillRect(0, 0, 16, 24);
      this.cache[k] = c;
    }
    return this.cache[k];
  };
  /* Malý portrét do bočního panelu (hlava a ramena zepředu). */
  CharacterSprites.prototype.portrait = function () {
    if (!this.cache.portrait) {
      var src = this.get('down', 'stand', 0), c = canvas(16, 16), x = c.getContext('2d');
      x.drawImage(src, 0, -1);
      this.cache.portrait = c;
    }
    return this.cache.portrait;
  };

  /* ---------- Bubliny nad hlavou ---------- */
  function bubble(ctx, kind, cx, top, t) {
    var r = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    var x, y;
    if (kind === 'waiting') {
      var bounce = Math.floor(t * 4) % 2;
      var flash = Math.floor(t * 3) % 2 === 0;
      x = cx - 6; y = top - 14 - bounce;
      r(x - 1, y - 1, 15, 14, flash ? '#ffffff' : '#3a2408');
      r(x, y, 13, 12, '#ffc22e'); r(x, y, 13, 1, '#ffe08a'); r(x, y + 11, 13, 1, '#d48a10');
      r(x + 5, y + 2, 3, 6, '#3a2408'); r(x + 5, y + 9, 3, 2, '#3a2408');
      r(cx - 1, y + 12, 3, 1, flash ? '#ffffff' : '#3a2408'); r(cx, y + 13, 1, 1, flash ? '#ffffff' : '#3a2408');
      r(cx - 1, y + 12, 2, 1, '#ffc22e');
    } else if (kind === 'error') {
      x = cx - 5; y = top - 12;
      r(x - 1, y - 1, 13, 12, '#2a0a0a'); r(x, y, 11, 10, '#e03a3a'); r(x, y, 11, 1, '#ff7a7a');
      for (var i = 0; i < 5; i++) { r(x + 3 + i, y + 2 + i, 1, 1, '#ffffff'); r(x + 7 - i, y + 2 + i, 1, 1, '#ffffff'); }
      r(cx - 1, y + 10, 2, 1, '#e03a3a'); r(cx - 1, y + 11, 1, 1, '#2a0a0a');
    } else if (kind === 'done') {
      x = cx - 5; y = top - 12;
      r(x - 1, y - 1, 13, 12, '#0e2a12'); r(x, y, 11, 10, '#4cc35a'); r(x, y, 11, 1, '#9ae8a2');
      r(x + 2, y + 5, 1, 1, '#ffffff'); r(x + 3, y + 6, 1, 1, '#ffffff'); r(x + 4, y + 7, 1, 1, '#ffffff');
      r(x + 5, y + 6, 1, 1, '#ffffff'); r(x + 6, y + 5, 1, 1, '#ffffff'); r(x + 7, y + 4, 1, 1, '#ffffff'); r(x + 8, y + 3, 1, 1, '#ffffff');
      r(x + 3, y + 5, 1, 1, '#ffffff'); r(x + 4, y + 6, 1, 1, '#ffffff'); r(x + 7, y + 3, 1, 1, '#ffffff');
      r(cx - 1, y + 10, 2, 1, '#4cc35a'); r(cx - 1, y + 11, 1, 1, '#0e2a12');
    } else if (kind === 'thinking') {
      x = cx - 4; y = top - 11;
      r(x - 1, y, 11, 6, '#2a2a3a'); r(x, y - 1, 9, 8, '#2a2a3a'); r(x, y, 9, 6, '#f4f4fa');
      var n = Math.floor(t * 3) % 4;
      for (var d = 0; d < 3; d++) r(x + 1 + d * 3, y + 3, 1, 1, d < n ? '#4a4a6a' : '#c8c8d8');
      r(cx - 3, y + 8, 2, 2, '#f4f4fa'); r(cx - 4, y + 11, 1, 1, '#f4f4fa');
    } else if (kind === 'reading') {
      x = cx - 4; y = top - 10;
      r(x - 1, y - 1, 11, 8, '#1a2238'); r(x, y, 4, 6, '#f2ead0'); r(x + 5, y, 4, 6, '#f2ead0'); r(x + 4, y, 1, 6, '#9a8a6a');
      r(x + 1, y + 2, 2, 1, '#9a8a6a'); r(x + 6, y + 2, 2, 1, '#9a8a6a'); r(x + 1, y + 4, 2, 1, '#9a8a6a');
    }
  }

  K.sprites = { CharacterSprites: CharacterSprites, lookFor: lookFor, LOOKS: LOOKS, bubble: bubble, shade: shade, Buf: Buf, canvas: canvas, OUTLINE: OUTLINE };
})(window.K = window.K || {});
