'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const mock = require('./fixtures/mock-ollama');
const { Store } = require('../src/main/store');
const { createServer } = require('../src/main/server');

const CLI = path.join(__dirname, '..', 'kancelar');

function run(args, env) {
  return new Promise((resolve) => execFile(CLI, args, { env: Object.assign({}, process.env, env), timeout: 60000 },
    (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
}

async function office(dir) {
  const store = new Store(dir);
  const states = [];
  store.on('change', () => {});
  const orig = store.setStatus.bind(store);
  store.setStatus = (id, s, t, src) => { states.push([id, s]); return orig(id, s, t, src); };
  const server = createServer(store);
  const port = await server.listen(48100 + Math.floor(Math.random() * 500));
  return { store, states, port, close: () => server.close() };
}

function fresh() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kancelar-cli-')); }

test('run: přemýšlí → hotovo, výsledek v markdownu, bez nástrojů', async () => {
  const dir = fresh();
  const o = await office(dir);
  const m = await mock.start();
  const r = await run(['run', 'sef', 'Naplánuj rodinný výlet na sobotu'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port), KANCELAR_OLLAMA_URL: m.url });
  assert.strictEqual(r.code, 0, r.stderr + r.stdout);
  assert.deepStrictEqual(o.states.map((s) => s[1]), ['thinking', 'done']);
  assert.ok(fs.existsSync(path.join(dir, 'agents', 'sef.json')) && fs.existsSync(path.join(dir, 'agents', 'tajemnik.json')));
  const files = fs.readdirSync(path.join(dir, 'results'));
  assert.strictEqual(files.length, 1);
  const md = fs.readFileSync(path.join(dir, 'results', files[0]), 'utf8');
  assert.match(md, /Model: qwen3:8b/);
  assert.match(md, /Délka běhu: /);
  assert.match(md, /Paměť modelu: 6,1 GB|Paměť modelu: 6.1 GB/);
  assert.doesNotMatch(md, /skryté/); // <think> se odstraní
  const req = m.state.requests[0];
  assert.strictEqual(req.think, false);
  assert.strictEqual(req.keep_alive, '2m');
  assert.strictEqual(req.options.num_ctx, 8192);
  assert.ok(req.options.temperature <= 0.3);
  assert.strictEqual(req.tools, undefined);
  assert.deepStrictEqual(req.messages.map((x) => x.role), ['system', 'user']);
  await m.close(); o.close();
});

test('chyby: Ollama neběží, chybí model, překročený čas', async () => {
  const dir = fresh();
  const o = await office(dir);
  let r = await run(['run', 'tajemnik', 'Napiš omluvenku'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port), KANCELAR_OLLAMA_URL: 'http://127.0.0.1:1' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /Ollama neběží/);
  assert.strictEqual(o.store.get('tajemnik').state, 'error');

  const m = await mock.start({ models: ['llama3.2:3b'] });
  r = await run(['run', 'tajemnik', 'Napiš omluvenku'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port), KANCELAR_OLLAMA_URL: m.url });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /ollama pull qwen3:8b/);
  await m.close();

  const slow = await mock.start({ delayMs: 8000 });
  const a = JSON.parse(fs.readFileSync(path.join(dir, 'agents', 'tajemnik.json'), 'utf8'));
  a.timeoutSec = 5;
  fs.writeFileSync(path.join(dir, 'agents', 'tajemnik.json'), JSON.stringify(a));
  const t0 = Date.now();
  r = await run(['run', 'tajemnik', 'Napiš omluvenku'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port), KANCELAR_OLLAMA_URL: slow.url });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /Překročen časový limit 5 s/);
  assert.ok(Date.now() - t0 < 7500);
  assert.match(o.store.get('tajemnik').task, /Překročen/);
  await slow.close(); o.close();
  assert.strictEqual(fs.readdirSync(path.join(dir, 'results')).length, 3); // i chyby se uloží
});

test('kancelář neběží: běh nespadne, stav se doručí později', async () => {
  const dir = fresh();
  const m = await mock.start();
  const r = await run(['run', 'sef', 'Co dnes udělat?'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: '1', KANCELAR_OLLAMA_URL: m.url });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.match(r.stdout, /Kancelář neběží/);
  const outbox = fs.readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepStrictEqual(outbox.map((e) => e.state), ['thinking', 'done']);
  // a) aplikace po startu outbox načte
  const store = new Store(dir);
  assert.strictEqual(store.ingestOutbox(), 2);
  assert.strictEqual(store.get('sef').state, 'done');
  assert.ok(!fs.existsSync(path.join(dir, 'outbox.jsonl')));
  // b) nebo ho doručí další spuštění příkazu, když kancelář už běží
  fs.writeFileSync(path.join(dir, 'outbox.jsonl'), JSON.stringify({ ts: new Date().toISOString(), agent: 'tajemnik', state: 'done', task: 'Hotovo' }) + '\n');
  const o = await office(dir);
  const f = await run(['flush'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port) });
  assert.strictEqual(f.code, 0);
  assert.strictEqual(o.store.get('tajemnik').state, 'done');
  await m.close(); o.close();
});

test('fronta: najednou běží jen jeden agent', async () => {
  const dir = fresh();
  const o = await office(dir);
  const m = await mock.start({ delayMs: 1500 });
  const env = { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: String(o.port), KANCELAR_OLLAMA_URL: m.url };
  const [a, b, c] = await Promise.all([
    run(['run', 'sef', 'Úkol jedna'], env), run(['run', 'tajemnik', 'Úkol dva'], env), run(['run', 'sef', 'Úkol tři'], env)
  ]);
  for (const r of [a, b, c]) assert.strictEqual(r.code, 0, r.stderr);
  assert.strictEqual(m.state.requests.length, 3);
  assert.strictEqual(m.state.maxActive, 1);
  assert.ok([a, b, c].filter((r) => /Ve frontě/.test(r.stdout)).length >= 2);
  assert.deepStrictEqual(fs.readdirSync(path.join(dir, 'queue')), []);
  await m.close(); o.close();
});

test('test-model: 6 úloh, tabulka a odpovědi', async () => {
  const dir = fresh();
  const m = await mock.start({ models: ['qwen3:8b', 'gemma3:4b'] });
  const r = await run(['test-model', 'gemma3:4b'], { KANCELAR_DATA_DIR: dir, KANCELAR_OLLAMA_URL: m.url });
  assert.strictEqual(r.code, 0, r.stderr);
  assert.ok(m.state.requests.every((q) => q.model === 'gemma3:4b' && q.tools === undefined));
  assert.strictEqual(m.state.requests.length, 6);
  const file = fs.readdirSync(path.join(dir, 'results')).find((f) => f.startsWith('test-model_gemma3-4b'));
  const md = fs.readFileSync(path.join(dir, 'results', file), 'utf8');
  assert.strictEqual((md.match(/^\| [1-6] \|/gm) || []).length, 6);
  assert.match(md, /forma splněna v 6 z 6/);
  assert.match(md, /## 3\. Termíny z textu do JSON/);
  await m.close();
});

test('neexistující agent a nelokální Ollama', async () => {
  const dir = fresh();
  let r = await run(['run', 'nikdo', 'x'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: '1' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /neexistuje.*sef/s);
  r = await run(['run', 'sef', 'x'], { KANCELAR_DATA_DIR: dir, KANCELAR_PORT: '1', KANCELAR_OLLAMA_URL: 'http://example.com:11434' });
  assert.strictEqual(r.code, 1);
  assert.match(r.stderr, /musí běžet na tomto počítači/);
});
