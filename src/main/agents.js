'use strict';
/* Definice stálých agentů a stavů. Sdílí hlavní proces, server i testy. */

const STATES = ['idle', 'working', 'reading', 'thinking', 'waiting', 'done', 'error'];

const STATE_LABELS = {
  idle: 'volno',
  working: 'pracuje',
  reading: 'čte',
  thinking: 'přemýšlí',
  waiting: 'čeká na schválení',
  done: 'hotovo',
  error: 'chyba'
};

/* Přijímáme anglické i české názvy stavů (bez ohledu na diakritiku a velikost písmen). */
const STATE_ALIASES = {
  idle: 'idle', volno: 'idle', free: 'idle', off: 'idle',
  working: 'working', work: 'working', pracuje: 'working', prace: 'working', busy: 'working',
  reading: 'reading', read: 'reading', cte: 'reading', cteni: 'reading',
  thinking: 'thinking', think: 'thinking', premysli: 'thinking', premysleni: 'thinking',
  waiting: 'waiting', wait: 'waiting', approval: 'waiting', ceka: 'waiting',
  cekanaschvaleni: 'waiting', schvaleni: 'waiting', ceka_na_schvaleni: 'waiting',
  done: 'done', hotovo: 'done', finished: 'done', ok: 'done',
  error: 'error', chyba: 'error', fail: 'error', failed: 'error'
};

const AGENTS = [
  { id: 'sef', name: 'Šéf', role: 'Řídí kancelář' },
  { id: 'skolnik', name: 'Školník', role: 'Škola a rozvrhy' },
  { id: 'kuchar', name: 'Kuchař', role: 'Jídlo a nákupy' },
  { id: 'tajemnik', name: 'Tajemník', role: 'Pošta a dokumenty' },
  { id: 'planovac', name: 'Plánovač', role: 'Kalendář a termíny' },
  { id: 'spravce', name: 'Správce', role: 'Počítače a domácnost' },
  { id: 'knihovnik', name: 'Knihovník', role: 'Poznámky a znalosti' }
];

function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeState(s) {
  const key = fold(s).replace(/[\s-]+/g, '');
  return STATE_ALIASES[key] || STATE_ALIASES[fold(s).replace(/[\s-]+/g, '_')] || null;
}

function normalizeAgentId(s) {
  return fold(s).replace(/[^a-z0-9_-]/g, '');
}

module.exports = { STATES, STATE_LABELS, AGENTS, normalizeState, normalizeAgentId, fold };
