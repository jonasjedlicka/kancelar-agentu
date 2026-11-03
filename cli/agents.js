'use strict';
/* Načítání definic agentů ze složky agents/ v datech aplikace. */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const EXAMPLES = path.join(__dirname, 'agents');

/* Při prvním použití zkopíruje ukázkové agenty (Šéf, Tajemník). Existující soubory nepřepisuje. */
function seed() {
  const dir = L.ensureDir(L.agentsDir());
  for (const f of fs.readdirSync(EXAMPLES)) {
    const target = path.join(dir, f);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(EXAMPLES, f), target);
  }
  return dir;
}

function validate(id, a) {
  const errs = [];
  if (!a || typeof a !== 'object') return ['soubor neobsahuje JSON objekt'];
  for (const k of ['name', 'role', 'system', 'model']) if (typeof a[k] !== 'string' || !a[k].trim()) errs.push(`chybí „${k}“`);
  if (!Number.isFinite(a.timeoutSec) || a.timeoutSec < 5 || a.timeoutSec > 3600) errs.push('„timeoutSec“ musí být číslo 5–3600');
  return errs;
}

function load(idRaw) {
  const dir = seed();
  const id = L.fold(idRaw);
  const file = path.join(dir, id + '.json');
  if (!id || !fs.existsSync(file)) {
    throw new L.FriendlyError(`Agent „${idRaw}“ neexistuje. Dostupní: ${list().map((a) => a.id).join(', ') || '(žádní)'}.\n` +
      `Definice agentů jsou ve složce: ${dir}`);
  }
  let a;
  try { a = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    throw new L.FriendlyError(`Soubor ${file} není platný JSON: ${e.message}`);
  }
  const errs = validate(id, a);
  if (errs.length) throw new L.FriendlyError(`Agent ${file}: ${errs.join(', ')}.`);
  return Object.assign({ id, office: a.office || id, file }, a);
}

function list() {
  const dir = seed();
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    try { return Object.assign({ id: f.slice(0, -5) }, JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))); } catch (_) { return { id: f.slice(0, -5), name: '(neplatný soubor)' }; }
  });
}

module.exports = { load, list, seed };
