'use strict';
/* Sdílené části spouštěče: cesty k datům, hlášení do kanceláře (s odloženou frontou),
 * volání Ollamy a fronta, aby najednou běžel jen jeden agent. Bez závislostí. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

/* ---------- Cesty ---------- */
function dataDir() {
  if (process.env.KANCELAR_DATA_DIR) return process.env.KANCELAR_DATA_DIR;
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Kancelar Agentu');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Kancelar Agentu');
}
function ensureDir(d) { fs.mkdirSync(d, { recursive: true }); return d; }
function resultsDir() { return ensureDir(path.join(dataDir(), 'results')); }
function agentsDir() { return path.join(dataDir(), 'agents'); }

function fold(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9_-]/g, '');
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

/* ---------- HTTP jen na lokální adresy ---------- */
function request(base, method, urlPath, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, base);
    const data = body == null ? null : JSON.stringify(body);
    const req = http.request({
      host: u.hostname, port: u.port, path: u.pathname + u.search, method,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, (res) => {
      let out = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        let json = null;
        try { json = out ? JSON.parse(out) : null; } catch (_) { /* není JSON */ }
        resolve({ status: res.statusCode, json, text: out });
      });
    });
    req.on('error', reject);
    if (timeoutMs) {
      req.setTimeout(timeoutMs, () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })));
    }
    if (data) req.write(data);
    req.end();
  });
}

function localBase(url, what) {
  const u = new URL(url);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) {
    throw new Error(`${what} musí běžet na tomto počítači (127.0.0.1), ne na ${u.hostname}.`);
  }
  return u.origin;
}

/* ---------- Kancelář ---------- */
function officePort() {
  if (process.env.KANCELAR_PORT) return parseInt(process.env.KANCELAR_PORT, 10);
  try { return JSON.parse(fs.readFileSync(path.join(dataDir(), 'server.json'), 'utf8')).port; } catch (_) { return 47800; }
}
function officeBase() { return `http://127.0.0.1:${officePort()}`; }
const OUTBOX = () => path.join(dataDir(), 'outbox.jsonl');

async function postStatus(entry) {
  const r = await request(officeBase(), 'POST', `/api/agents/${encodeURIComponent(entry.agent)}/status`,
    { state: entry.state, task: entry.task }, 2500);
  if (r.status === 404) return { ok: false, permanent: true, error: `Kancelář nezná agenta „${entry.agent}“.` };
  if (r.status !== 200) return { ok: false, permanent: true, error: (r.json && r.json.error) || `HTTP ${r.status}` };
  return { ok: true };
}

/* Odeslané hlášení; když kancelář neběží, uloží se do outbox.jsonl a pošle se později
 * (při dalším spuštění příkazu, nebo ho načte sama aplikace po startu). */
async function report(agent, state, task) {
  const entry = { ts: new Date().toISOString(), agent, state, task: String(task || '').slice(0, 200) };
  await flushOutbox();
  try {
    const r = await postStatus(entry);
    if (!r.ok) console.error(`  (kancelář: ${r.error})`);
    return r.ok;
  } catch (_) {
    ensureDir(dataDir());
    fs.appendFileSync(OUTBOX(), JSON.stringify(entry) + '\n');
    return false;
  }
}

async function flushOutbox() {
  const file = OUTBOX();
  if (!fs.existsSync(file)) return true;
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const rest = [];
  let down = false;
  for (const line of lines) {
    if (down) { rest.push(line); continue; }
    let e;
    try { e = JSON.parse(line); } catch (_) { continue; }
    try { await postStatus(e); } catch (_) { down = true; rest.push(line); }
  }
  if (rest.length) fs.writeFileSync(file, rest.join('\n') + '\n');
  else fs.rmSync(file, { force: true });
  return !down;
}

/* ---------- Ollama ---------- */
function ollamaBase() { return localBase(process.env.KANCELAR_OLLAMA_URL || 'http://127.0.0.1:11434', 'Ollama'); }

class FriendlyError extends Error {}

async function checkOllama(model) {
  let tags;
  try {
    tags = await request(ollamaBase(), 'GET', '/api/tags', null, 3000);
  } catch (_) {
    throw new FriendlyError(`Ollama neběží na ${ollamaBase()}. Spusť aplikaci Ollama (nebo „ollama serve“) a zkus to znovu.`);
  }
  const names = ((tags.json && tags.json.models) || []).map((m) => m.name || m.model);
  const has = names.some((n) => n === model || n === model + ':latest');
  if (!has) throw new FriendlyError(`Model „${model}“ v Ollamě chybí. Stáhni ho příkazem: ollama pull ${model}`);
}

const OPTIONS = { num_ctx: 8192, temperature: 0.2, top_p: 0.9 };

/* Jedno volání modelu. Model nedostává žádné nástroje – jen text, vrací text. */
async function chat(model, system, user, timeoutMs, extra) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    stream: false,
    think: false,
    keep_alive: '2m',
    options: Object.assign({}, OPTIONS, (extra && extra.options) || {})
  };
  const t0 = Date.now();
  let r;
  try {
    r = await request(ollamaBase(), 'POST', '/api/chat', body, timeoutMs);
  } catch (err) {
    if (err.code === 'ETIMEOUT') throw new FriendlyError(`Překročen časový limit ${Math.round(timeoutMs / 1000)} s.`);
    if (err.code === 'ECONNREFUSED') throw new FriendlyError(`Ollama neběží na ${ollamaBase()}.`);
    throw new FriendlyError('Spojení s Ollamou selhalo: ' + err.message);
  }
  if (r.status === 404) throw new FriendlyError(`Model „${model}“ v Ollamě chybí. Stáhni ho příkazem: ollama pull ${model}`);
  if (r.status !== 200 || !r.json) throw new FriendlyError('Ollama vrátila chybu: ' + ((r.json && r.json.error) || `HTTP ${r.status}`));
  const j = r.json;
  let text = (j.message && j.message.content) || '';
  text = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const evalSec = j.eval_duration ? j.eval_duration / 1e9 : 0;
  return {
    text,
    wallMs: Date.now() - t0,
    promptTokens: j.prompt_eval_count || 0,
    outTokens: j.eval_count || 0,
    tokPerSec: evalSec ? j.eval_count / evalSec : 0,
    loadMs: j.load_duration ? Math.round(j.load_duration / 1e6) : 0
  };
}

/* Kolik paměti zabírá načtený model (z /api/ps). */
async function modelMemory(model) {
  try {
    const r = await request(ollamaBase(), 'GET', '/api/ps', null, 2000);
    const m = ((r.json && r.json.models) || []).find((x) => (x.name || x.model) === model || x.name === model + ':latest');
    if (!m) return null;
    return { size: m.size || 0, vram: m.size_vram || 0 };
  } catch (_) {
    return null;
  }
}
function gb(n) { return (n / 1024 ** 3).toFixed(1).replace('.', ',') + ' GB'; }

/* ---------- Fronta: najednou běží jen jeden agent ---------- */
function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}
async function acquireSlot(label, onWait) {
  const dir = ensureDir(path.join(dataDir(), 'queue'));
  const name = `${Date.now()}-${String(process.pid).padStart(7, '0')}.ticket`;
  const mine = path.join(dir, name);
  fs.writeFileSync(mine, JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }));
  const release = () => { try { fs.unlinkSync(mine); } catch (_) { /* nic */ } };
  process.on('exit', release);
  let announced = false;
  for (;;) {
    const tickets = fs.readdirSync(dir).filter((f) => f.endsWith('.ticket')).sort();
    let first = null;
    for (const t of tickets) {
      const pid = parseInt(t.split('-')[1], 10);
      if (t !== name && !alive(pid)) { try { fs.unlinkSync(path.join(dir, t)); } catch (_) { /* nic */ } continue; }
      first = t; break;
    }
    if (first === name) return release;
    if (!announced) {
      announced = true;
      let who = '';
      try { who = JSON.parse(fs.readFileSync(path.join(dir, first), 'utf8')).label; } catch (_) { /* nic */ }
      if (onWait) await onWait(who);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

module.exports = {
  dataDir, ensureDir, resultsDir, agentsDir, fold, stamp, report, flushOutbox,
  checkOllama, chat, modelMemory, gb, acquireSlot, FriendlyError, ollamaBase, officeBase, OPTIONS
};
