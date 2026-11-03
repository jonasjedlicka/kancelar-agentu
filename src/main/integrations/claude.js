'use strict';
/* Volitelné, jen pro čtení: aktivní sessions Claude Code z ~/.claude/projects/<projekt>/<session>.jsonl.
 * Každá session změněná za posledních 10 minut dostane vlastní postavu. Soubory se nikdy nemění. */
const fs = require('fs');
const path = require('path');
const os = require('os');

const ACTIVE_MS = 10 * 60 * 1000;
const TAIL_BYTES = 128 * 1024;
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'NotebookRead']);
const APPROVAL_TOOLS = new Set(['Bash', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'WebFetch']);

function readTail(file, size) {
  const fd = fs.openSync(file, 'r');
  try {
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, size - len);
    const text = buf.toString('utf8');
    return len < size ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    fs.closeSync(fd);
  }
}

function short(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function describeTool(block) {
  const input = block.input || {};
  const file = input.file_path || input.path || input.notebook_path;
  if (file) return `${block.name}: ${path.basename(String(file))}`;
  if (input.command) return `${block.name}: ${short(input.command, 40)}`;
  if (input.pattern) return `${block.name}: ${short(input.pattern, 40)}`;
  if (input.url) return `${block.name}: ${short(input.url, 40)}`;
  return block.name;
}

/* Z konce transkriptu odhadne stav session. Exportováno kvůli testům. */
function analyze(lines, mtimeMs, now) {
  let cwd = null;
  const pending = new Map();
  let last = null;
  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch (_) { continue; }
    if (!e || typeof e !== 'object') continue;
    if (e.cwd) cwd = e.cwd;
    if (e.type !== 'assistant' && e.type !== 'user') continue;
    if (e.isSidechain) continue;
    const content = e.message && e.message.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (b && b.type === 'tool_use') pending.set(b.id, b);
        if (b && b.type === 'tool_result') pending.delete(b.tool_use_id);
      }
    }
    last = e;
  }
  const idleMs = now - mtimeMs;
  let state = 'thinking';
  let task = 'Přemýšlí';
  if (last && last.type === 'assistant') {
    const content = Array.isArray(last.message && last.message.content) ? last.message.content : [];
    const lastBlock = content[content.length - 1];
    const openTool = Array.from(pending.values()).pop();
    if (openTool) {
      task = describeTool(openTool);
      if (idleMs > 10000 && APPROVAL_TOOLS.has(openTool.name)) {
        state = 'waiting';
        task = 'Možná čeká na schválení – ' + task;
      } else {
        state = READ_TOOLS.has(openTool.name) ? 'reading' : 'working';
      }
    } else if (lastBlock && lastBlock.type === 'thinking') {
      state = 'thinking';
    } else if (lastBlock && lastBlock.type === 'text') {
      if (idleMs > 3000) {
        state = 'done';
        task = 'Hotovo, čeká na tebe';
      } else {
        state = 'working';
        task = 'Píše odpověď';
      }
    }
  } else if (last && last.type === 'user') {
    state = 'thinking';
    task = 'Přemýšlí';
  }
  return { state, task, cwd };
}

function createClaude(store, opts) {
  const root = (opts && opts.root) || path.join(os.homedir(), '.claude', 'projects');
  let timer = null;

  function scan() {
    const now = Date.now();
    const found = [];
    let projects = [];
    try { projects = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { projects = []; }
    for (const p of projects) {
      if (!p.isDirectory()) continue;
      const dir = path.join(root, p.name);
      let files = [];
      try { files = fs.readdirSync(dir); } catch (_) { continue; }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const file = path.join(dir, f);
        let st;
        try { st = fs.statSync(file); } catch (_) { continue; }
        if (!st.isFile() || now - st.mtimeMs > ACTIVE_MS) continue;
        found.push({ file, project: p.name, session: f.slice(0, -6), st });
      }
    }
    found.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    const keep = new Set();
    for (const s of found.slice(0, 8)) {
      let info;
      try { info = analyze(readTail(s.file, s.st.size).split('\n'), s.st.mtimeMs, now); } catch (_) { continue; }
      const id = 'claude-' + s.session.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
      keep.add(id);
      const projectName = info.cwd ? path.basename(info.cwd) : s.project.split('-').filter(Boolean).pop() || s.project;
      store.upsertDynamic(id, {
        name: 'Claude ' + short(projectName, 18),
        role: 'Session Claude Code',
        kind: 'claude',
        state: info.state,
        task: info.task
      });
    }
    store.removeDynamic('claude-', keep);
  }

  function loop() {
    try { scan(); } catch (err) { console.error('Claude Code:', err.message); }
    if (timer) timer = setTimeout(loop, 2000);
  }

  return {
    start() { if (!timer) timer = setTimeout(loop, 10); },
    stop() { clearTimeout(timer); timer = null; store.removeDynamic('claude-', new Set()); }
  };
}

module.exports = { createClaude, analyze };
