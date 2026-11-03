'use strict';
/* kancelar run <agent> "<úkol>" – spustí agenta nad lokálním modelem v Ollamě. */
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const Agents = require('./agents');

const MAX_TASK = 8000;

function shortTask(t) {
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? t.slice(0, 59) + '…' : t;
}
function fmtSec(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' s'; }

function writeResult(agent, task, info) {
  const started = info.started;
  let file = path.join(L.resultsDir(), `${L.stamp(started)}_${agent.id}.md`);
  for (let n = 2; fs.existsSync(file); n++) file = path.join(L.resultsDir(), `${L.stamp(started)}_${agent.id}-${n}.md`);
  const lines = [
    `# ${agent.name}: ${shortTask(task)}`,
    '',
    `- Stav: ${info.ok ? 'hotovo' : 'chyba'}`,
    `- Začátek: ${started.toLocaleString('cs-CZ')}`,
    `- Délka běhu: ${fmtSec(info.durationMs)}`,
    `- Model: ${agent.model}`,
    info.stats ? `- Tokeny: ${info.stats.promptTokens} na vstupu, ${info.stats.outTokens} na výstupu (${info.stats.tokPerSec.toFixed(1).replace('.', ',')} tok/s), načtení modelu ${fmtSec(info.stats.loadMs)}` : null,
    info.memory ? `- Paměť modelu: ${L.gb(info.memory.size)} (z toho GPU ${L.gb(info.memory.vram)})` : null,
    info.queuedMs > 500 ? `- Čekání ve frontě: ${fmtSec(info.queuedMs)}` : null,
    '',
    '## Úkol',
    '',
    task,
    '',
    info.ok ? '## Odpověď' : '## Chyba',
    '',
    info.ok ? info.text : info.error,
    ''
  ].filter((x) => x !== null);
  fs.writeFileSync(file, lines.join('\n'));
  return file;
}

async function run(agentId, task) {
  const agent = Agents.load(agentId);
  task = String(task || '').trim();
  if (!task) throw new L.FriendlyError('Chybí text úkolu: ./kancelar run <agent> "<úkol>"');
  if (task.length > MAX_TASK) throw new L.FriendlyError(`Úkol je moc dlouhý (max. ${MAX_TASK} znaků).`);

  const queuedAt = Date.now();
  const release = await L.acquireSlot(`${agent.name}: ${shortTask(task)}`, async (who) => {
    console.log(`Ve frontě – teď pracuje ${who || 'jiný agent'}. Počkám…`);
    await L.report(agent.office, 'idle', 'Ve frontě: ' + shortTask(task));
  });
  const queuedMs = Date.now() - queuedAt;
  const started = new Date();
  let interrupted = false;
  const onSig = async () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    await L.report(agent.office, 'error', 'Přerušeno uživatelem');
    release();
    process.exit(130);
  };
  process.on('SIGINT', onSig);
  process.on('SIGTERM', onSig);

  console.log(`${agent.name} (${agent.model}) přemýšlí…`);
  const online = await L.report(agent.office, 'thinking', shortTask(task));
  if (!online) console.log('  Kancelář neběží – stav se nahlásí, až ji spustíš.');

  let info;
  try {
    await L.checkOllama(agent.model);
    const system = agent.system + '\nNemáš žádné nástroje, soubory ani internet. Odpovídej jen textem, česky.';
    const stats = await L.chat(agent.model, system, task, agent.timeoutSec * 1000);
    if (!stats.text) throw new L.FriendlyError('Model vrátil prázdnou odpověď.');
    const memory = await L.modelMemory(agent.model);
    info = { ok: true, text: stats.text, stats, memory, started, queuedMs, durationMs: Date.now() - started.getTime() };
  } catch (err) {
    const msg = err instanceof L.FriendlyError ? err.message : 'Neočekávaná chyba: ' + err.message;
    info = { ok: false, error: msg, started, queuedMs, durationMs: Date.now() - started.getTime() };
  }
  const file = writeResult(agent, task, info);
  release();
  if (info.ok) {
    await L.report(agent.office, 'done', 'Hotovo: ' + shortTask(task));
    console.log('\n' + info.text + '\n');
    console.log(`Hotovo za ${fmtSec(info.durationMs)}` + (info.stats.tokPerSec ? `, ${info.stats.tokPerSec.toFixed(1).replace('.', ',')} tok/s` : '') +
      (info.memory ? `, model v paměti ${L.gb(info.memory.size)}` : '') + '.');
  } else {
    await L.report(agent.office, 'error', info.error.split('\n')[0].slice(0, 120));
    console.error('Chyba: ' + info.error);
  }
  console.log('Výsledek: ' + file);
  return info.ok ? 0 : 1;
}

module.exports = { run, shortTask, fmtSec };
