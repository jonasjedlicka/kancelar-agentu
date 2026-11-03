/* Hlavní skript okna: propojení scény, bočního panelu a hlavního procesu. */
(function (K) {
  'use strict';
  var api = window.kancelar;
  var Wd = K.world, T = Wd.T;
  var NW = Wd.W * T, NH = Wd.H * T;
  var STATE_LABEL = { idle: 'volno', working: 'pracuje', reading: 'čte', thinking: 'přemýšlí', waiting: 'čeká na schválení', done: 'hotovo', error: 'chyba' };
  var KIND_LABEL = { claude: 'Claude Code', ollama: 'Ollama' };
  var ORDER = ['sef', 'skolnik', 'kuchar', 'tajemnik', 'planovac', 'spravce', 'knihovnik'];

  var canvas = document.getElementById('office');
  var ctx = canvas.getContext('2d', { alpha: false });
  var stage = document.getElementById('stage');
  var listEl = document.getElementById('list');
  var detailEl = document.getElementById('detail');
  var scene = new K.Scene();
  var scale = 1, dpr = 1;
  var agents = [];
  var settings = {};
  var editor = null;
  var savedLayout = null;

  /* ---------- Ostré pixely: celočíselné zvětšení v pixelech zařízení ---------- */
  function fontUnit() {
    dpr = window.devicePixelRatio || 1;
    // 12 px písma = 1 pixel glyfu. Na Retině (2×) dává 18 px přesně 3 fyzické pixely na pixel glyfu.
    var main = dpr >= 2 ? 18 : 24;
    if (dpr >= 3) main = 16;
    document.documentElement.style.setProperty('--fs', main + 'px');
    document.documentElement.style.setProperty('--fs-small', (dpr >= 3 ? 12 : 12) + 'px');
  }
  function resize() {
    fontUnit();
    var r = stage.getBoundingClientRect();
    var s = Math.floor(Math.min((r.width - 16) * dpr / NW, (r.height - 16) * dpr / NH));
    scale = Math.max(1, s);
    canvas.width = NW * scale;
    canvas.height = NH * scale;
    canvas.style.width = (NW * scale / dpr) + 'px';
    canvas.style.height = (NH * scale / dpr) + 'px';
  }
  new ResizeObserver(resize).observe(stage);
  window.addEventListener('resize', resize);

  function toNative(ev) {
    var r = canvas.getBoundingClientRect();
    return [(ev.clientX - r.left) * dpr / scale, (ev.clientY - r.top) * dpr / scale];
  }

  /* ---------- Smyčka ---------- */
  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    scene.update(dt);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    scene.draw(ctx);
    requestAnimationFrame(frame);
  }

  /* ---------- Myš ---------- */
  canvas.addEventListener('mousemove', function (ev) {
    var p = toNative(ev);
    if (editor) { editor.move(p[0], p[1]); canvas.className = 'edit'; return; }
    var id = scene.charAt(p[0], p[1]);
    scene.hover = id;
    canvas.className = id ? 'pointer' : '';
  });
  canvas.addEventListener('mouseleave', function () { scene.hover = null; if (editor) editor.hoverItem = null; });
  canvas.addEventListener('mousedown', function (ev) {
    var p = toNative(ev);
    if (editor) { editor.down(p[0], p[1]); return; }
    select(scene.charAt(p[0], p[1]));
  });
  window.addEventListener('mouseup', function () { if (editor) editor.up(); });

  /* ---------- Panel ---------- */
  function sorted() {
    return agents.slice().sort(function (a, b) {
      var ia = ORDER.indexOf(a.id), ib = ORDER.indexOf(b.id);
      if (ia < 0) ia = 100; if (ib < 0) ib = 100;
      return ia - ib || a.name.localeCompare(b.name, 'cs');
    });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var portraits = {};
  function portrait(id) {
    var c = scene.chars.get(id);
    var cv = el('canvas');
    cv.width = 16; cv.height = 16;
    if (c) cv.getContext('2d').drawImage(c.sprites.portrait(), 0, 0);
    return cv;
  }

  function renderList() {
    listEl.textContent = '';
    sorted().forEach(function (a) {
      var b = el('button', 'agent' + (scene.selected === a.id ? ' sel' : ''));
      b.type = 'button';
      b.dataset.id = a.id;
      b.appendChild(portrait(a.id));
      var info = el('div');
      var top = el('div', 'name');
      top.appendChild(el('span', null, a.name));
      top.appendChild(el('span', 'state s-' + a.state, STATE_LABEL[a.state] || a.state));
      info.appendChild(top);
      var sub = a.task || (KIND_LABEL[a.kind] ? KIND_LABEL[a.kind] : a.role) || '';
      info.appendChild(el('div', 'task', sub));
      b.appendChild(info);
      b.addEventListener('click', function () { select(scene.selected === a.id ? null : a.id); });
      listEl.appendChild(b);
    });
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso), today = new Date();
    var t = d.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() !== today.toDateString()) t = d.getDate() + '. ' + (d.getMonth() + 1) + '.';
    return t;
  }

  var detailReq = 0;
  function renderDetail() {
    var id = scene.selected;
    var a = agents.filter(function (x) { return x.id === id; })[0];
    if (!a) { detailEl.hidden = true; return; }
    detailEl.hidden = false;
    var req = ++detailReq;
    api.history(id).then(function (hist) {
      if (req !== detailReq) return;
      detailEl.textContent = '';
      detailEl.appendChild(el('h2', null, a.name));
      var now = el('div', 'now');
      now.appendChild(el('span', 'state s-' + a.state, STATE_LABEL[a.state]));
      if (a.task) { now.appendChild(document.createElement('br')); now.appendChild(el('span', null, a.task)); }
      var meta = [a.role || KIND_LABEL[a.kind], a.updatedAt ? 'změna ' + fmtTime(a.updatedAt) : null].filter(Boolean).join(' · ');
      if (meta) { now.appendChild(document.createElement('br')); now.appendChild(el('span', 'kind', meta)); }
      detailEl.appendChild(now);
      if (!hist.length) { detailEl.appendChild(el('div', 'kind', 'Zatím žádná historie.')); return; }
      var ol = el('ol');
      hist.forEach(function (h) {
        var li = el('li');
        li.appendChild(el('span', 'time', fmtTime(h.ts)));
        var txt = el('span', 'txt');
        txt.appendChild(el('span', 'state s-' + h.state, STATE_LABEL[h.state] || h.state));
        if (h.task) txt.appendChild(document.createTextNode(' ' + h.task));
        li.appendChild(txt);
        ol.appendChild(li);
      });
      detailEl.appendChild(ol);
    });
  }

  function select(id) {
    scene.selected = id || null;
    renderList();
    renderDetail();
  }

  function applySnapshot(snap, first) {
    agents = snap.agents || [];
    settings = snap.settings || {};
    scene.setAgents(agents, first);
    document.getElementById('api').textContent = snap.port
      ? 'API: http://127.0.0.1:' + snap.port
      : 'API neběží';
    document.getElementById('opt-demo').checked = !!settings.demo;
    document.getElementById('opt-claude').checked = !!settings.claude;
    document.getElementById('opt-ollama').checked = !!settings.ollama;
    if (scene.selected && !agents.some(function (a) { return a.id === scene.selected; })) scene.selected = null;
    renderList();
    renderDetail();
  }

  /* ---------- Editor rozložení ---------- */
  var editbar = document.getElementById('editbar');
  var btnEdit = document.getElementById('btn-edit');
  function setEditing(on) {
    if (on && !editor) {
      editor = new K.Editor(scene);
      scene.editor = editor;
    } else if (!on && editor) {
      if (editor.dirty) editor.cancel();
      editor = null;
      scene.editor = null;
    }
    editbar.hidden = !editor;
    btnEdit.classList.toggle('active', !!editor);
    canvas.className = editor ? 'edit' : '';
    api.editorState(!!editor);
  }
  btnEdit.addEventListener('click', function () { setEditing(!editor); });
  document.getElementById('edit-cancel').addEventListener('click', function () { setEditing(false); });
  document.getElementById('edit-save').addEventListener('click', function () {
    var layout = { version: 1, items: scene.layout.items.map(function (it) {
      var o = { id: it.id, type: it.type, x: it.x, y: it.y };
      if (it.owner) o.owner = it.owner;
      return o;
    }) };
    api.saveLayout(layout).then(function (res) {
      if (res && res.ok) { savedLayout = Wd.cloneLayout(layout); editor.dirty = false; setEditing(false); }
    });
  });
  function resetLayout() {
    api.resetLayout().then(function () {
      if (editor) { editor.dirty = false; }
      scene.setLayout(Wd.cloneLayout(Wd.DEFAULT_LAYOUT));
      savedLayout = Wd.cloneLayout(Wd.DEFAULT_LAYOUT);
      setEditing(false);
    });
  }
  document.getElementById('edit-reset').addEventListener('click', resetLayout);

  document.getElementById('btn-data').addEventListener('click', function () { api.openDataFolder(); });
  ['demo', 'claude', 'ollama'].forEach(function (k) {
    document.getElementById('opt-' + k).addEventListener('change', function (ev) { api.setSetting(k, ev.target.checked); });
  });
  window.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { if (editor) setEditing(false); else select(null); }
  });

  api.onMenu(function (cmd) {
    if (cmd === 'toggle-editor') setEditing(!editor);
    if (cmd === 'reset-layout') resetLayout();
  });

  /* Uložené rozložení musí obsahovat jen známé typy. */
  function sanitizeLayout(l) {
    if (!l || !Array.isArray(l.items)) return null;
    var ok = l.items.every(function (it) { return it && Wd.DEFS[it.type] && Number.isInteger(it.x) && Number.isInteger(it.y) && Wd.inMap(it.x, it.y); });
    return ok ? l : null;
  }

  /* ---------- Start ---------- */
  Promise.all([api.snapshot(), api.getLayout(), document.fonts.load('18px "Kancl Pixel"')]).then(function (res) {
    var layout = sanitizeLayout(res[1]) || Wd.cloneLayout(Wd.DEFAULT_LAYOUT);
    savedLayout = Wd.cloneLayout(layout);
    scene.setLayout(layout);
    resize();
    applySnapshot(res[0], true);
    api.onUpdate(function (snap) { applySnapshot(snap, false); });
    requestAnimationFrame(frame);
    window.__kancelarReady = true;
  });

  window.__kancelar = { scene: scene, select: select, setEditing: setEditing };
})(window.K = window.K || {});
