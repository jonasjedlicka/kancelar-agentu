'use strict';
/* Ukládání stavu, historie, rozložení a nastavení do složky s daty. */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { AGENTS, STATES } = require('./agents');

const HISTORY_MAX_BYTES = 2 * 1024 * 1024;
const HISTORY_KEEP = 200; // záznamů na agenta v paměti
const MAX_TASK = 200;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function cleanText(t) {
  return String(t == null ? '' : t)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, MAX_TASK);
}

class Store extends EventEmitter {
  constructor(dir) {
    super();
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.files = {
      state: path.join(dir, 'state.json'),
      history: path.join(dir, 'history.jsonl'),
      layout: path.join(dir, 'layout.json'),
      settings: path.join(dir, 'settings.json'),
      server: path.join(dir, 'server.json')
    };
    this.agents = new Map();
    const saved = readJson(this.files.state, {});
    const savedAgents = (saved && saved.agents) || {};
    for (const a of AGENTS) {
      const s = savedAgents[a.id] || {};
      this.agents.set(a.id, {
        id: a.id,
        name: a.name,
        role: a.role,
        kind: 'fixed',
        state: STATES.includes(s.state) ? s.state : 'idle',
        task: cleanText(s.task),
        updatedAt: s.updatedAt || null
      });
    }
    this.history = new Map();
    this._loadHistory();
    this.settings = Object.assign(
      { demo: false, ollama: false, claude: false },
      readJson(this.files.settings, {})
    );
    this._saveTimer = null;
  }

  _loadHistory() {
    let text = '';
    try {
      const stat = fs.statSync(this.files.history);
      const fd = fs.openSync(this.files.history, 'r');
      const len = Math.min(stat.size, 512 * 1024);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, stat.size - len);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch (_) {
      return;
    }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && e.agent) this._remember(e);
      } catch (_) { /* neúplný řádek */ }
    }
  }

  _remember(entry) {
    if (!this.history.has(entry.agent)) this.history.set(entry.agent, []);
    const list = this.history.get(entry.agent);
    list.push(entry);
    if (list.length > HISTORY_KEEP) list.splice(0, list.length - HISTORY_KEEP);
  }

  _appendHistory(entry) {
    this._remember(entry);
    try {
      try {
        if (fs.statSync(this.files.history).size > HISTORY_MAX_BYTES) {
          fs.renameSync(this.files.history, path.join(this.dir, 'history.1.jsonl'));
        }
      } catch (_) { /* soubor zatím neexistuje */ }
      fs.appendFileSync(this.files.history, JSON.stringify(entry) + '\n');
    } catch (err) {
      console.error('Historie se nepodařilo uložit:', err.message);
    }
  }

  _scheduleSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._saveTimer);
    const agents = {};
    for (const a of this.agents.values()) {
      if (a.kind !== 'fixed') continue;
      agents[a.id] = { state: a.state, task: a.task, updatedAt: a.updatedAt };
    }
    try {
      writeJsonAtomic(this.files.state, { version: 1, agents });
    } catch (err) {
      console.error('Stav se nepodařilo uložit:', err.message);
    }
  }

  list() {
    return Array.from(this.agents.values()).map((a) => Object.assign({}, a));
  }

  get(id) {
    return this.agents.get(id) || null;
  }

  /* Změní stav agenta. Vrací aktualizovaného agenta, nebo null. */
  setStatus(id, state, task, source) {
    const a = this.agents.get(id);
    if (!a || !STATES.includes(state)) return null;
    const text = cleanText(task);
    const changed = a.state !== state || a.task !== text;
    a.state = state;
    a.task = text;
    a.updatedAt = new Date().toISOString();
    if (changed || source === 'api') {
      const entry = { ts: a.updatedAt, agent: id, state, task: text, source: source || 'api' };
      if (a.kind === 'fixed') this._appendHistory(entry);
      else this._remember(entry);
    }
    if (a.kind === 'fixed') this._scheduleSave();
    this.emit('change');
    return Object.assign({}, a);
  }

  /* Dočasné postavy (Claude Code, Ollama) – neukládají se do state.json. */
  upsertDynamic(id, props) {
    let a = this.agents.get(id);
    if (!a) {
      a = { id, name: props.name, role: props.role || '', kind: props.kind, state: 'idle', task: '', updatedAt: null };
      this.agents.set(id, a);
    }
    a.name = props.name;
    a.role = props.role || a.role;
    if (a.state !== props.state || a.task !== cleanText(props.task)) {
      this.setStatus(id, props.state, props.task, props.kind);
    }
  }

  removeDynamic(prefix, keepIds) {
    let changed = false;
    for (const id of Array.from(this.agents.keys())) {
      const a = this.agents.get(id);
      if (a.kind !== 'fixed' && id.startsWith(prefix) && !keepIds.has(id)) {
        this.agents.delete(id);
        this.history.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit('change');
  }

  getHistory(id, limit) {
    const list = this.history.get(id) || [];
    return list.slice(-(limit || 50)).reverse();
  }

  loadLayout() {
    return readJson(this.files.layout, null);
  }

  saveLayout(layout) {
    writeJsonAtomic(this.files.layout, layout);
  }

  resetLayout() {
    try { fs.unlinkSync(this.files.layout); } catch (_) { /* nic */ }
  }

  setSetting(key, value) {
    if (!['demo', 'ollama', 'claude'].includes(key)) return false;
    this.settings[key] = !!value;
    writeJsonAtomic(this.files.settings, this.settings);
    this.emit('settings');
    return true;
  }

  writeServerInfo(info) {
    writeJsonAtomic(this.files.server, info);
  }

  clearServerInfo() {
    try { fs.unlinkSync(this.files.server); } catch (_) { /* nic */ }
  }
}

module.exports = { Store, cleanText };
