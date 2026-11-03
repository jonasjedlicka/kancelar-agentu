#!/usr/bin/env node
/* Vývojový pomocník: spustí aplikaci přes Playwright, nastaví stavy a uloží snímky obrazovky.
 * Použití: node scripts/screenshots.js <výstupní složka>   (na Linuxu pod xvfb-run) */
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { _electron: electron } = require('playwright');

const outDir = path.resolve(process.argv[2] || 'docs/screenshots');
const scale = process.env.SCALE || '2';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kancelar-shot-'));
  // falešný domov s jednou aktivní session Claude Code (jen pro ukázku integrace)
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kancelar-home-'));
  const proj = path.join(home, '.claude', 'projects', '-Users-ukazka-web-skoly');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, '5e55a0b1-demo.jsonl'), JSON.stringify({ type: 'assistant', cwd: '/Users/ukazka/web-skoly',
    message: { content: [{ type: 'tool_use', id: 'x1', name: 'Edit', input: { file_path: '/Users/ukazka/web-skoly/index.html' } }] } }) + '\n');
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--no-sandbox', `--force-device-scale-factor=${scale}`],
    env: Object.assign({}, process.env, { HOME: home, KANCELAR_DATA_DIR: dataDir, KANCELAR_PORT: process.env.KANCELAR_PORT || '47811' })
  });
  const logs = [];
  app.process().stdout.on('data', (d) => logs.push(String(d)));
  app.process().stderr.on('data', (d) => logs.push(String(d)));
  const win = await app.firstWindow();
  win.on('console', (m) => logs.push('[renderer] ' + m.type() + ' ' + m.text()));
  win.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.setContentSize(1400, 860); });
  await win.waitForFunction(() => window.__kancelarReady === true, null, { timeout: 15000 });
  const port = JSON.parse(fs.readFileSync(path.join(dataDir, 'server.json'), 'utf8')).port;
  const post = (id, state, task) => fetch(`http://127.0.0.1:${port}/api/agents/${encodeURIComponent(id)}/status`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, task })
  }).then((r) => r.json());

  await win.waitForTimeout(800);
  await win.screenshot({ path: path.join(outDir, '01-prazdna-kancelar.png') });

  await post('skolnik', 'working', 'Kontroluju Edookit');
  await post('sef', 'waiting', 'Schválíš rozpočet na výlet?');
  await post('kuchar', 'reading', 'Recept na svíčkovou');
  await post('tajemnik', 'error', 'Pošta neodešla');
  await post('planovac', 'thinking', 'Plánuju příští týden');
  await post('spravce', 'done', 'Záloha dokončena');
  await post('knihovnik', 'working', 'Třídím poznámky a články');
  await win.waitForTimeout(9000);
  await win.screenshot({ path: path.join(outDir, '02-agenti-pracuji.png') });

  await win.click('.agent[data-id="skolnik"]');
  await win.waitForTimeout(700);
  await win.screenshot({ path: path.join(outDir, '03-vybrany-agent.png') });

  // detail scény v nativních pixelech (zvětšený výřez)
  const crop = await win.evaluate(() => {
    const c = document.getElementById('office');
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await win.screenshot({ path: path.join(outDir, '04-detail.png'), clip: { x: crop.x, y: crop.y, width: crop.width * 0.55, height: crop.height * 0.62 } });

  await win.click('#btn-edit');
  await win.waitForTimeout(300);
  // přetáhni rostlinu
  const s = await win.evaluate(() => {
    const c = document.getElementById('office').getBoundingClientRect();
    return { left: c.left, top: c.top, k: c.width / 512 };
  });
  const tile = (tx, ty) => [s.left + (tx * 16 + 8) * s.k, s.top + (ty * 16 + 8) * s.k];
  let p = tile(12, 18);
  await win.mouse.move(p[0], p[1]);
  await win.mouse.down();
  p = tile(17, 8);
  await win.mouse.move(p[0], p[1], { steps: 8 });
  await win.waitForTimeout(200);
  await win.screenshot({ path: path.join(outDir, '05-editor.png') });
  await win.mouse.up();
  await win.click('#edit-save');
  await win.waitForTimeout(300);


  await win.click('label:has(#opt-demo)');
  await win.waitForTimeout(12000);
  await win.screenshot({ path: path.join(outDir, '06-demo.png') });

  // Claude Code: každá aktivní session dostane postavu
  await win.click('label:has(#opt-claude)');
  await win.waitForTimeout(6000);
  await win.click('.agent[data-id^="claude-"]');
  await win.waitForTimeout(500);
  await win.screenshot({ path: path.join(outDir, '07-claude-code.png') });

  // bezpečnost: stránka nemá Node, vzdálený obsah je zablokovaný
  const sec = await win.evaluate(async (apiPort) => {
    const r = { require: typeof require, process: typeof process, kancelarKeys: Object.keys(window.kancelar) };
    try { await fetch('https://example.com/'); r.fetchRemote = 'PROŠLO'; } catch (e) { r.fetchRemote = 'zablokováno'; }
    try { await fetch('http://127.0.0.1:' + apiPort + '/api/health'); r.fetchLocalApi = 'PROŠLO'; } catch (e) { r.fetchLocalApi = 'zablokováno'; }
    r.img = await new Promise((res) => { const i = new Image(); i.onload = () => res('PROŠLO'); i.onerror = () => res('zablokováno'); i.src = 'https://example.com/x.png'; });
    r.open = window.open('https://example.com') === null ? 'zablokováno' : 'PROŠLO';
    return r;
  }, port);
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
    return { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity };
  });
  console.log('Bezpečnost stránky:', JSON.stringify(sec));
  console.log('webPreferences:', JSON.stringify(prefs));

  const layout = JSON.parse(fs.readFileSync(path.join(dataDir, 'layout.json'), 'utf8'));
  const moved = layout.items.find((i) => i.id === 'plant4');
  console.log('Uložené rozložení – rostlina plant4:', moved);
  console.log('Soubory s daty:', fs.readdirSync(dataDir));
  await app.close();
  console.log(logs.join(''));
})().catch((e) => { console.error(e); process.exit(1); });
