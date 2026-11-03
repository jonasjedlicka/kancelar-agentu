'use strict';
/* Demo režim: agenti sami střídají práci. */
const TASKS = {
  sef: ['Rozděluju úkoly', 'Schvaluju rozpočet', 'Porada s týmem', 'Kontroluju výsledky'],
  skolnik: ['Kontroluju Edookit', 'Hlídám domácí úkoly', 'Čtu zprávy od učitelů', 'Zapisuju známky'],
  kuchar: ['Plánuju jídelníček', 'Píšu nákupní seznam', 'Hledám recept na guláš', 'Počítám zásoby'],
  tajemnik: ['Třídím e-maily', 'Odpovídám na poštu', 'Archivuju dokumenty', 'Píšu dopis'],
  planovac: ['Plánuju týden', 'Hlídám termíny', 'Ladím kalendář', 'Připomínám schůzky'],
  spravce: ['Zálohuju data', 'Aktualizuju systém', 'Kontroluju síť', 'Uklízím disk'],
  knihovnik: ['Třídím poznámky', 'Hledám v archivu', 'Čtu dokumentaci', 'Píšu shrnutí']
};
const WEIGHTS = [
  ['working', 5], ['reading', 3], ['thinking', 3], ['idle', 3], ['done', 2], ['waiting', 1.5], ['error', 0.6]
];

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function pickState() {
  const total = WEIGHTS.reduce((s, w) => s + w[1], 0);
  let r = Math.random() * total;
  for (const [s, w] of WEIGHTS) { if ((r -= w) <= 0) return s; }
  return 'working';
}

function createDemo(store) {
  let timer = null;
  function step() {
    const ids = Object.keys(TASKS);
    const id = pick(ids);
    const state = pickState();
    let task = '';
    if (state === 'working' || state === 'reading' || state === 'thinking') task = pick(TASKS[id]);
    if (state === 'waiting') task = 'Schválíš: ' + pick(TASKS[id]).toLowerCase() + '?';
    if (state === 'error') task = 'Nepodařilo se: ' + pick(TASKS[id]).toLowerCase();
    if (state === 'done') task = pick(TASKS[id]) + ' – hotovo';
    store.setStatus(id, state, task, 'demo');
    timer = setTimeout(step, 2500 + Math.random() * 4500);
  }
  return {
    start() { if (!timer) timer = setTimeout(step, 300); },
    stop() { clearTimeout(timer); timer = null; },
    get running() { return !!timer; }
  };
}

module.exports = { createDemo };
