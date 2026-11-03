/* Simulace postav (chůze po A*, sezení u stolu, volno v kuchyňce/odpočívárně) a vykreslení scény. */
(function (K) {
  'use strict';
  var Wd = K.world, T = Wd.T, S = K.sprites, RD = K.render;
  var SPEED = 46;           // px za sekundu
  var ACTIVE = { working: 1, reading: 1, thinking: 1, waiting: 1, error: 1 };

  function Scene() {
    this.layout = Wd.cloneLayout(Wd.DEFAULT_LAYOUT);
    this.chars = new Map();
    this.agents = new Map();
    this.selected = null;
    this.hover = null;
    this.t = 0;
    this.editor = null;
    this.setLayout(this.layout);
  }

  Scene.prototype.setLayout = function (layout) {
    this.layout = layout;
    this.grid = Wd.buildGrid(layout);
    this.spots = Wd.spotsFor(layout);
    this.bg = RD.buildBackground();
    var self = this;
    this.chars.forEach(function (c) {
      c.target = null; c.path = null;
      if (self.grid[c.ty * Wd.W + c.tx] === 1) {
        var f = Wd.nearestFree(self.grid, c.tx, c.ty);
        c.tx = f[0]; c.ty = f[1]; c.x = f[0] * T + 8; c.y = f[1] * T + 13;
      }
    });
  };

  /* Data agentů z hlavního procesu. */
  Scene.prototype.setAgents = function (list, first) {
    var self = this, seen = {};
    list.forEach(function (a) {
      seen[a.id] = 1;
      var prev = self.agents.get(a.id);
      self.agents.set(a.id, a);
      var c = self.chars.get(a.id);
      if (!c) {
        c = {
          id: a.id, sprites: new S.CharacterSprites(S.lookFor(a.id, a.kind)),
          x: Wd.DOOR.x * T + 8, y: Wd.DOOR.y * T + 13, tx: Wd.DOOR.x, ty: Wd.DOOR.y,
          dir: 'up', pose: 'stand', path: null, target: null, until: 0, animT: Math.random() * 10, arrived: false
        };
        self.chars.set(a.id, c);
        if (first) {
          var sp = self.chooseSpot(c, a);
          if (sp) { self.place(c, sp); }
        }
      } else if (prev && prev.state !== a.state) {
        c.until = 0; // přehodnotit cíl
      }
    });
    this.chars.forEach(function (_c, id) { if (!seen[id]) { self.chars.delete(id); self.agents.delete(id); if (self.selected === id) self.selected = null; } });
  };

  Scene.prototype.place = function (c, sp) {
    c.target = sp; c.tx = sp.x; c.ty = sp.y; c.x = sp.px; c.y = sp.py; c.path = []; c.arrived = true; c.dir = sp.dir;
    c.until = this.t + 15 + Math.random() * 25;
  };

  Scene.prototype.taken = function (sp, except) {
    var hit = false;
    this.chars.forEach(function (c) { if (c !== except && c.target && c.target.key === sp.key) hit = true; });
    return hit;
  };

  Scene.prototype.chooseSpot = function (c, a) {
    var self = this;
    if (ACTIVE[a.state]) {
      var own = this.spots.filter(function (s) { return s.kind === 'desk' && s.owner === a.id; })[0];
      if (own) return own;
      if (c.target && c.target.kind !== 'leisure' && !this.taken(c.target, c) && this.spots.some(function (s) { return s.key === c.target.key; })) return c.target;
      var owners = {};
      this.agents.forEach(function (x) { owners[x.id] = 1; });
      var free = this.spots.filter(function (s) { return s.kind === 'desk' && (!s.owner || !owners[s.owner]) && !self.taken(s, c); });
      if (free.length) return free[0];
      var boards = this.spots.filter(function (s) { return s.kind === 'board' && !self.taken(s, c); });
      if (boards.length) return boards[0];
      return null;
    }
    var leisure = this.spots.filter(function (s) { return s.kind === 'leisure' && !self.taken(s, c) && (!c.target || s.key !== c.target.key); });
    if (!leisure.length) return null;
    return leisure[Math.floor(Math.random() * leisure.length)];
  };

  Scene.prototype.poseFor = function (c, a) {
    var sp = c.target;
    if (!sp || !c.arrived) return { pose: 'stand', dir: c.dir };
    if (sp.kind === 'desk') {
      if (a.state === 'working') return { pose: 'type', dir: 'up' };
      if (a.state === 'reading') return { pose: 'read', dir: 'up' };
      if (a.state === 'thinking') return { pose: 'think', dir: 'up' };
      if (a.state === 'waiting') return { pose: 'wait', dir: 'down' };
      return { pose: 'stand', dir: 'down' };
    }
    if (sp.kind === 'board') {
      if (a.state === 'waiting') return { pose: 'wait', dir: 'down' };
      if (a.state === 'error') return { pose: 'stand', dir: 'down' };
      return { pose: 'board', dir: 'up' };
    }
    return { pose: sp.pose || 'stand', dir: sp.dir };
  };

  Scene.prototype.update = function (dt) {
    this.t += dt;
    var self = this;
    if (this.editor && this.editor.dragging) return;
    this.chars.forEach(function (c) {
      var a = self.agents.get(c.id);
      if (!a) return;
      c.animT += dt;
      var wantActive = !!ACTIVE[a.state];
      var tgtOk = c.target && self.spots.some(function (s) { return s.key === c.target.key; });
      var needNew = !tgtOk || (wantActive && c.target.kind === 'leisure') || (!wantActive && c.target.kind !== 'leisure') ||
        (!wantActive && c.arrived && self.t > c.until) || (wantActive && c.target.kind !== 'desk' && c.arrived && self.t > c.until);
      if (needNew) {
        var sp = self.chooseSpot(c, a);
        if (sp && (!c.target || sp.key !== c.target.key)) {
          c.target = sp;
          c.arrived = false;
          var startX = c.tx, startY = c.ty;
          c.path = Wd.findPath(self.grid, startX, startY, sp.x, sp.y);
          if (!c.path) { self.place(c, sp); }
        }
        c.until = self.t + (wantActive ? 8 : 14 + Math.random() * 26);
      }
      // pohyb
      if (c.path && c.path.length) {
        var n = c.path[0];
        var gx = n[0] * T + 8, gy = n[1] * T + 13;
        if (c.path.length === 1 && c.target) { gx = c.target.px; gy = c.target.py; }
        var dx = gx - c.x, dy = gy - c.y, dist = Math.sqrt(dx * dx + dy * dy), stepLen = SPEED * dt;
        if (Math.abs(dx) > Math.abs(dy)) c.dir = dx > 0 ? 'right' : 'left'; else if (dy !== 0) c.dir = dy > 0 ? 'down' : 'up';
        if (dist <= stepLen) {
          c.x = gx; c.y = gy; c.tx = n[0]; c.ty = n[1]; c.path.shift();
          if (!c.path.length) { c.arrived = true; c.dir = c.target ? c.target.dir : c.dir; }
        } else {
          c.x += dx / dist * stepLen; c.y += dy / dist * stepLen;
        }
        c.pose = 'walk';
      } else if (c.target && !c.arrived) {
        var ddx = c.target.px - c.x, ddy = c.target.py - c.y, d2 = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d2 < 1) { c.x = c.target.px; c.y = c.target.py; c.arrived = true; }
        else { c.x += ddx / d2 * Math.min(d2, SPEED * dt); c.y += ddy / d2 * Math.min(d2, SPEED * dt); c.pose = 'walk'; }
      } else {
        var p = self.poseFor(c, a);
        c.pose = p.pose; c.dir = p.dir;
      }
    });
  };

  function frameFor(c) {
    if (c.pose === 'walk') return Math.floor(c.animT * 8) % 4;
    if (c.pose === 'type') return Math.floor(c.animT * 6) % 2;
    if (c.pose === 'think' || c.pose === 'board') return Math.floor(c.animT * 1.5) % 2;
    if (c.pose === 'read') return Math.floor(c.animT * 0.7) % 2;
    if (c.pose === 'wait') return Math.floor(c.animT * 3) % 2;
    return 0;
  }

  var SEATED = { type: 1, read: 1, think: 1, sitidle: 1 };
  var BADGE_STATES = { waiting: 'waiting', error: 'error', done: 'done', thinking: 'thinking', reading: 'reading' };

  Scene.prototype.draw = function (ctx) {
    var self = this, now = new Date(), t = this.t;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.bg, 0, 0);
    var items = this.layout.items;
    var dragId = this.editor && this.editor.dragging ? this.editor.dragging.item.id : null;

    // koberce
    items.forEach(function (it) { if (Wd.DEFS[it.type].floor && it.id !== dragId) RD.drawStatic(ctx, it.type, it.x * T, it.y * T); });

    // nástěnné prvky
    var notes = [];
    this.agents.forEach(function (a) { if (ACTIVE[a.state] || a.state === 'done') notes.push(self.chars.get(a.id) ? self.chars.get(a.id).sprites.look.badge : '#ffd060'); });
    items.forEach(function (it) {
      if (!Wd.DEFS[it.type].wall || it.id === dragId) return;
      self.drawWallItem(ctx, it, now, notes);
    });

    // co je na kterém stole
    var deskInfo = {};
    this.chars.forEach(function (c) {
      var a = self.agents.get(c.id);
      if (a && c.target && c.target.kind === 'desk' && c.arrived) deskInfo[c.target.item] = { state: a.state, text: a.task || labelFor(a.state) };
    });

    // řazení podle hloubky
    var list = [];
    items.forEach(function (it) {
      var d = Wd.DEFS[it.type];
      if (d.floor || d.wall || it.id === dragId) return;
      list.push({ key: (it.y + d.h) * T - 1, fn: function () { self.drawItem(ctx, it, deskInfo[it.id], t); } });
      if (it.type === 'desk') {
        list.push({ key: (it.y + 2) * T - 3, fn: function () { RD.drawStatic(ctx, 'chair', it.x * T + 8, (it.y + 1) * T); } });
      }
      if (it.type === 'ktable') {
        [0, 1].forEach(function (i) { list.push({ key: (it.y + 1) * T + 1, fn: function () { RD.drawStatic(ctx, 'stool', (it.x + i) * T, (it.y + 1) * T + 2); } }); });
      }
    });
    this.chars.forEach(function (c) {
      var seatedAtDesk = SEATED[c.pose] && c.target && c.target.kind === 'desk';
      list.push({ key: c.y + (seatedAtDesk ? -4 : 2), fn: function () { self.drawChar(ctx, c); } });
    });
    list.sort(function (a, b) { return a.key - b.key; });
    list.forEach(function (d) { d.fn(); });

    // bubliny a jmenovky nad vším
    this.chars.forEach(function (c) {
      var a = self.agents.get(c.id);
      if (!a) return;
      var top = Math.round(c.y) - 24 + (SEATED[c.pose] || c.pose === 'sitfront' ? 3 : 0);
      var kind = BADGE_STATES[a.state];
      if (kind && (kind !== 'reading' || c.pose !== 'read')) S.bubble(ctx, kind, Math.round(c.x), top, t);
      if (self.selected === c.id || self.hover === c.id) {
        self.drawLabel(ctx, a.name, Math.round(c.x), top - (kind ? 15 : 1) - 12, self.selected === c.id);
      }
    });

    if (this.editor) this.editor.draw(ctx);
  };

  function labelFor(s) {
    return { idle: 'volno', working: 'pracuje', reading: 'čte', thinking: 'přemýšlí', waiting: 'čeká', done: 'hotovo', error: 'chyba' }[s] || s;
  }

  Scene.prototype.drawLabel = function (ctx, text, cx, y, strong) {
    var w = K.KFont.measure(text) + 6;
    var x = Math.round(cx - w / 2);
    x = Math.max(1, Math.min(Wd.W * T - w - 1, x));
    y = Math.max(0, y);
    ctx.fillStyle = strong ? '#f4f1e8' : '#1d2029';
    ctx.fillRect(x, y + 1, w, 11);
    ctx.fillRect(x + 1, y, w - 2, 13);
    K.KFont.draw(ctx, text, x + 3, y - 1, strong ? '#1d2029' : '#e8e6f0');
  };

  Scene.prototype.drawChar = function (ctx, c) {
    var f = frameFor(c);
    var x = Math.round(c.x) - 8, y = Math.round(c.y) - 24;
    // stín
    ctx.fillStyle = 'rgba(20,16,30,0.28)';
    if (!SEATED[c.pose] && c.pose !== 'sitfront') { ctx.fillRect(x + 4, y + 23, 8, 2); ctx.fillRect(x + 3, y + 23, 10, 1); }
    if (this.selected === c.id) {
      var col = Math.floor(this.t * 3) % 2 ? '#fff3a0' : '#ffd23a';
      var sil = c.sprites.silhouette(c.dir, c.pose, f, col);
      ctx.drawImage(sil, x - 1, y); ctx.drawImage(sil, x + 1, y); ctx.drawImage(sil, x, y - 1); ctx.drawImage(sil, x, y + 1);
    }
    ctx.drawImage(c.sprites.get(c.dir, c.pose, f), x, y);
  };

  Scene.prototype.drawWallItem = function (ctx, it, now, notes) {
    var px = it.x * T, py = it.y * T;
    if (it.type === 'window') RD.drawWindow(ctx, px, py, now);
    else if (it.type === 'clock') RD.drawClock(ctx, px, py, now);
    else if (it.type === 'whiteboard') RD.drawWhiteboard(ctx, px, py, notes);
  };

  Scene.prototype.drawItem = function (ctx, it, info, t) {
    var px = it.x * T, py = it.y * T;
    RD.drawStatic(ctx, it.type, px, py);
    if (it.type === 'desk') RD.drawScreen(ctx, px, py, info, t);
    if (it.type === 'coffee' && Math.floor(t * 2) % 3 !== 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(px + 8 + (Math.floor(t * 2) % 2), py - 12, 1, 2);
    }
  };

  /* Která postava je pod kurzorem (souřadnice v nativních pixelech). */
  Scene.prototype.charAt = function (nx, ny) {
    var best = null, bestY = -1;
    this.chars.forEach(function (c) {
      if (nx >= c.x - 6 && nx <= c.x + 6 && ny >= c.y - 22 && ny <= c.y + 1 && c.y > bestY) { best = c.id; bestY = c.y; }
    });
    return best;
  };

  K.Scene = Scene;
})(window.K = window.K || {});
