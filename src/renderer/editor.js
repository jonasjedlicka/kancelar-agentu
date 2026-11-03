/* Jednoduchý editor rozložení: nábytek se přetahuje myší po dlaždicích. */
(function (K) {
  'use strict';
  var Wd = K.world, T = Wd.T;

  function Editor(scene, onChange) {
    this.scene = scene;
    this.backup = Wd.cloneLayout(scene.layout);
    this.dragging = null;
    this.hoverItem = null;
    this.mouse = null;
    this.dirty = false;
    this.onChange = onChange || function () {};
  }

  Editor.prototype.itemAt = function (tx, ty) {
    var items = this.scene.layout.items, found = null, rank = -1;
    items.forEach(function (it) {
      var d = Wd.DEFS[it.type];
      var h = d.wall ? 2 : d.h;
      if (tx >= it.x && tx < it.x + d.w && ty >= it.y && ty < it.y + h) {
        var r = d.floor ? 0 : d.wall ? 1 : 2;
        if (r > rank) { found = it; rank = r; }
      }
    });
    return found;
  };

  Editor.prototype.down = function (nx, ny) {
    var tx = Math.floor(nx / T), ty = Math.floor(ny / T);
    var it = this.itemAt(tx, ty);
    if (!it) return;
    this.dragging = { item: it, offX: tx - it.x, offY: ty - it.y, gx: it.x, gy: it.y, valid: true };
  };

  Editor.prototype.move = function (nx, ny) {
    this.mouse = [nx, ny];
    var tx = Math.floor(nx / T), ty = Math.floor(ny / T);
    if (!this.dragging) { this.hoverItem = this.itemAt(tx, ty); return; }
    var d = this.dragging, def = Wd.DEFS[d.item.type];
    d.gx = tx - d.offX;
    d.gy = def.wall ? 0 : ty - d.offY;
    d.valid = Wd.canPlace(this.scene.layout, d.item, d.gx, d.gy);
  };

  Editor.prototype.up = function () {
    var d = this.dragging;
    if (!d) return;
    this.dragging = null;
    if (d.valid && (d.gx !== d.item.x || d.gy !== d.item.y)) {
      d.item.x = d.gx; d.item.y = d.gy;
      this.scene.setLayout(this.scene.layout);
      this.dirty = true;
      this.onChange();
    }
  };

  Editor.prototype.cancel = function () {
    this.scene.setLayout(Wd.cloneLayout(this.backup));
    this.dirty = false;
  };

  Editor.prototype.draw = function (ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (var x = 1; x < Wd.W; x++) ctx.fillRect(x * T, 2 * T, 1, (Wd.H - 3) * T);
    for (var y = 2; y < Wd.H; y++) ctx.fillRect(T, y * T, (Wd.W - 2) * T, 1);
    var self = this;
    function box(it, gx, gy, col) {
      var d = Wd.DEFS[it.type], h = d.wall ? 2 : d.h;
      ctx.fillStyle = col;
      var X = gx * T, Y = gy * T, w = d.w * T, hh = h * T;
      ctx.fillRect(X, Y, w, 1); ctx.fillRect(X, Y + hh - 1, w, 1); ctx.fillRect(X, Y, 1, hh); ctx.fillRect(X + w - 1, Y, 1, hh);
    }
    if (this.hoverItem && !this.dragging) {
      box(this.hoverItem, this.hoverItem.x, this.hoverItem.y, '#ffd23a');
      this.scene.drawLabel(ctx, Wd.DEFS[this.hoverItem.type].name, (this.hoverItem.x + Wd.DEFS[this.hoverItem.type].w / 2) * T, Math.max(0, this.hoverItem.y * T - 14), false);
    }
    if (this.dragging) {
      var d = this.dragging, it = d.item, def = Wd.DEFS[it.type];
      var ghost = { id: it.id, type: it.type, x: d.gx, y: d.gy, owner: it.owner };
      ctx.save();
      ctx.globalAlpha = 0.75;
      if (def.wall) self.scene.drawWallItem(ctx, ghost, new Date(), []);
      else if (def.floor) K.render.drawStatic(ctx, it.type, ghost.x * T, ghost.y * T);
      else {
        self.scene.drawItem(ctx, ghost, null, 0);
        if (it.type === 'desk') K.render.drawStatic(ctx, 'chair', ghost.x * T + 8, (ghost.y + 1) * T);
      }
      ctx.restore();
      var col = d.valid ? '#5ad06a' : '#ff5a5a';
      box(it, d.gx, d.gy, col);
      ctx.fillStyle = d.valid ? 'rgba(90,208,106,0.18)' : 'rgba(255,90,90,0.22)';
      ctx.fillRect(d.gx * T, d.gy * T, def.w * T, (def.wall ? 2 : def.h) * T);
    }
  };

  K.Editor = Editor;
})(window.K = window.K || {});
