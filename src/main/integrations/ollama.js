'use strict';
/* Volitelné, jen pro čtení: modely načtené v Ollamě (GET http://127.0.0.1:11434/api/ps). */
const http = require('http');

function fetchPs() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: 11434, path: '/api/ps', timeout: 2000 }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (data.length < 256 * 1024) data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function createOllama(store) {
  let timer = null;
  async function poll() {
    const ps = await fetchPs();
    const keep = new Set();
    if (ps && Array.isArray(ps.models)) {
      for (const m of ps.models.slice(0, 6)) {
        const name = String(m.name || m.model || 'model').slice(0, 40);
        const id = 'ollama-' + name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
        keep.add(id);
        const gb = m.size_vram ? ` (${(m.size_vram / 1e9).toFixed(1)} GB VRAM)` : '';
        store.upsertDynamic(id, { name: 'Ollama ' + name, role: 'Model v Ollamě', kind: 'ollama', state: 'thinking', task: 'Model načtený' + gb });
      }
    }
    store.removeDynamic('ollama-', keep);
    if (timer) timer = setTimeout(poll, 5000);
  }
  return {
    start() { if (!timer) { timer = setTimeout(poll, 10); } },
    stop() { clearTimeout(timer); timer = null; store.removeDynamic('ollama-', new Set()); }
  };
}

module.exports = { createOllama };
