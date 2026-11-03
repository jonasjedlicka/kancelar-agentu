'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyze, createClaude } = require('../src/main/integrations/claude');
const { Store } = require('../src/main/store');

const L = (o) => JSON.stringify(o);
const now = Date.now();

test('rozpozná stavy ze session Claude Code', () => {
  const tool = (name, input) => L({ type: 'assistant', cwd: '/Users/x/projekt', message: { content: [{ type: 'tool_use', id: 't1', name, input }] } });
  assert.strictEqual(analyze([tool('Read', { file_path: '/a/b.js' })], now, now).state, 'reading');
  assert.strictEqual(analyze([tool('Edit', { file_path: '/a/b.js' })], now, now).state, 'working');
  assert.strictEqual(analyze([tool('Bash', { command: 'npm test' })], now - 20000, now).state, 'waiting');
  const done = [L({ type: 'user', message: { content: 'ahoj' } }), L({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hotovo.' }] } })];
  assert.strictEqual(analyze(done, now - 10000, now).state, 'done');
  assert.strictEqual(analyze([L({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1' }] } })], now, now).state, 'thinking');
  assert.strictEqual(analyze([tool('Read', { file_path: '/a/b.js' })], now, now).cwd, '/Users/x/projekt');
});

test('každá aktivní session dostane postavu, stará ne', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-proj-'));
  const proj = path.join(root, '-Users-x-muj-projekt');
  fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'aaaa1111-2222.jsonl'), L({ type: 'assistant', cwd: '/Users/x/muj-projekt', message: { content: [{ type: 'tool_use', id: '1', name: 'Grep', input: { pattern: 'TODO' } }] } }) + '\n');
  const old = path.join(proj, 'bbbb3333-4444.jsonl');
  fs.writeFileSync(old, L({ type: 'user', message: { content: 'x' } }) + '\n');
  const t = new Date(Date.now() - 3600 * 1000);
  fs.utimesSync(old, t, t);
  const store = new Store(fs.mkdtempSync(path.join(os.tmpdir(), 'kancelar-c-')));
  const c = createClaude(store, { root });
  c.start();
  await new Promise((r) => setTimeout(r, 200));
  c.stop();
  // stop() postavy odstraní – zkontrolujeme historii zapamatovanou během běhu přes nový běh bez stop
  const c2 = createClaude(store, { root });
  c2.start();
  await new Promise((r) => setTimeout(r, 200));
  const dyn = store.list().filter((a) => a.kind === 'claude');
  assert.strictEqual(dyn.length, 1);
  assert.strictEqual(dyn[0].name, 'Claude muj-projekt');
  assert.strictEqual(dyn[0].state, 'reading');
  c2.stop();
  assert.strictEqual(store.list().filter((a) => a.kind === 'claude').length, 0);
});
