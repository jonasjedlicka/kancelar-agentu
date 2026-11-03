#!/usr/bin/env node
'use strict';
/* Vstupní bod pro „kancelar run“, „kancelar test-model“ a „kancelar agents“. */
const L = require('./lib');

async function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'run') {
    if (rest.length < 2) { console.error('Použití: kancelar run <agent> "<úkol>"'); return 64; }
    return require('./run').run(rest[0], rest.slice(1).join(' '));
  }
  if (cmd === 'test-model') return require('./test-model').testModel(rest[0]);
  if (cmd === 'agents') {
    const list = require('./agents').list();
    for (const a of list) console.log(`${a.id.padEnd(12)} ${a.name} – ${a.role || ''} [${a.model}, limit ${a.timeoutSec} s]`);
    console.log('\nSložka: ' + L.agentsDir());
    return 0;
  }
  if (cmd === 'flush') return (await L.flushOutbox()) ? 0 : 2;
  console.error('Neznámý příkaz.');
  return 64;
}

main(process.argv.slice(2)).then((code) => process.exit(code || 0), (err) => {
  console.error(err instanceof L.FriendlyError ? 'Chyba: ' + err.message : err.stack || err.message);
  process.exit(1);
});
