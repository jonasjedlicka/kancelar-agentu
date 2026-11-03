'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFile } = require('child_process');
const { Store } = require('../src/main/store');
const { createServer } = require('../src/main/server');

function req(port, method, p, body, headers) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(
      data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode, body: out ? JSON.parse(out) : null }));
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

test('API a CLI', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kancelar-test-'));
  const store = new Store(dir);
  const server = createServer(store);
  const port = await server.listen(47900);
  t.after(() => server.close());

  await t.test('poslouchá jen na 127.0.0.1', async () => {
    const r = await req(port, 'GET', '/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.ok, true);
    const ext = Object.values(os.networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    if (ext) {
      const err = await new Promise((resolve) => {
        const c = require('net').connect(port, ext.address);
        c.on('connect', () => { c.destroy(); resolve(null); });
        c.on('error', resolve);
      });
      assert.ok(err, 'server nesmí být dostupný na ' + ext.address);
    }
  });

  await t.test('seznam obsahuje 7 agentů', async () => {
    const r = await req(port, 'GET', '/api/agents');
    assert.deepStrictEqual(r.body.agents.map((a) => a.id), ['sef', 'skolnik', 'kuchar', 'tajemnik', 'planovac', 'spravce', 'knihovnik']);
  });

  await t.test('POST status mění stav a zapisuje historii', async () => {
    const r = await req(port, 'POST', '/api/agents/skolnik/status', { state: 'working', task: 'Kontroluju Edookit' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.agent.state, 'working');
    assert.strictEqual(r.body.agent.task, 'Kontroluju Edookit');
    const h = await req(port, 'GET', '/api/agents/skolnik/history');
    assert.strictEqual(h.body.history[0].task, 'Kontroluju Edookit');
    store.flush();
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
    assert.strictEqual(saved.agents.skolnik.state, 'working');
    assert.match(fs.readFileSync(path.join(dir, 'history.jsonl'), 'utf8'), /Kontroluju Edookit/);
  });

  await t.test('české názvy stavů i agentů', async () => {
    const r = await req(port, 'POST', '/api/agents/' + encodeURIComponent('Šéf') + '/status', { state: 'čeká na schválení', task: 'Rozpočet' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.agent.id, 'sef');
    assert.strictEqual(r.body.agent.state, 'waiting');
  });

  await t.test('neplatné vstupy', async () => {
    assert.strictEqual((await req(port, 'POST', '/api/agents/nikdo/status', { state: 'working' })).status, 404);
    assert.strictEqual((await req(port, 'POST', '/api/agents/sef/status', { state: 'tancuje' })).status, 400);
    assert.strictEqual((await req(port, 'POST', '/api/agents/sef/status', '{rozbité')).status, 400);
    assert.strictEqual((await req(port, 'POST', '/api/agents/sef/status', 'state=working', { 'Content-Type': 'text/plain' })).status, 415);
  });

  await t.test('odmítá požadavky z prohlížeče a cizí Host', async () => {
    assert.strictEqual((await req(port, 'POST', '/api/agents/sef/status', { state: 'idle' }, { Origin: 'https://example.com' })).status, 403);
    assert.strictEqual((await req(port, 'GET', '/api/agents', null, { Host: 'evil.example:' + port })).status, 403);
  });

  await t.test('příkaz ./kancelar', async () => {
    const cli = path.join(__dirname, '..', 'kancelar');
    const run = (args) => new Promise((resolve) => execFile(cli, args, { env: Object.assign({}, process.env, { KANCELAR_PORT: String(port) }) },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr })));
    let r = await run(['status', 'skolnik', 'working', 'Kontroluju Edookit']);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.strictEqual(store.get('skolnik').task, 'Kontroluju Edookit');
    r = await run(['status', 'Kuchař', 'pracuje', 'Vařím "guláš" \\ s knedlíkem']);
    assert.strictEqual(r.code, 0, r.stderr);
    assert.strictEqual(store.get('kuchar').state, 'working');
    assert.strictEqual(store.get('kuchar').task, 'Vařím "guláš" \\ s knedlíkem');
    r = await run(['status', 'nikdo', 'working']);
    assert.strictEqual(r.code, 1);
    r = await run(['list']);
    assert.match(r.stdout, /knihovnik/);
  });

  await t.test('nastavení i stav přežijí restart', async () => {
    store.setSetting('demo', true);
    store.flush();
    const again = new Store(dir);
    assert.strictEqual(again.settings.demo, true);
    assert.strictEqual(again.get('skolnik').task, 'Kontroluju Edookit');
    assert.ok(again.getHistory('skolnik').length >= 1);
  });
});

test('CLI bez běžící aplikace', async () => {
  const cli = path.join(__dirname, '..', 'kancelar');
  const r = await new Promise((resolve) => execFile(cli, ['status', 'sef', 'idle'], { env: Object.assign({}, process.env, { KANCELAR_PORT: '1' }) },
    (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stderr })));
  assert.strictEqual(r.code, 2);
  assert.match(r.stderr, /neběží/);
});
