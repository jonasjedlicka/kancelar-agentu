'use strict';
/* kancelar test-model [model] – 6 úloh v češtině. Měří čas, rychlost a jestli výstup splnil
 * formu (JSON, délka…). Správnost obsahu neposuzuje – odpovědi se vypíšou k ručnímu hodnocení. */
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const SYSTEM = 'Jsi pečlivý asistent. Odpovídej česky a přesně podle zadání. Nepřidávej úvod ani závěr.';

function words(s) { return s.trim().split(/\s+/).filter(Boolean).length; }
function sentences(s) { return s.trim().split(/[.!?…]+(?:\s|$)/).filter((x) => x.trim()).length; }
function stripFences(s) { return s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim(); }

const TASKS = [
  {
    id: 'shrnuti',
    title: 'Stručné shrnutí textu',
    prompt: 'Shrň následující text nejvýše ve dvou větách.\n\n' +
      'Ve čtvrtek se třída 4.B vydá na výlet do Muzea Jindřichohradecka. Sraz je v 7:30 před školou, ' +
      'návrat plánujeme kolem 15:00. Děti si mají vzít svačinu, pití, pláštěnku a 150 Kč na vstupné. ' +
      'V muzeu je čeká prohlídka s průvodcem a odpoledne dílna, kde si vyrobí vlastní mýdlo. ' +
      'Kdo nemůže jet, zůstane ve škole ve vedlejší třídě s paní učitelkou Novou.',
    check: (t) => {
      const s = sentences(t), w = words(t);
      return { ok: s <= 2 && w <= 60, note: `${s} vět, ${w} slov (limit 2 věty, 60 slov)` };
    }
  },
  {
    id: 'zprava',
    title: 'Zkrácení zprávy rodiči',
    prompt: 'Zkrať tuto zprávu pro rodiče nejvýše na 300 znaků. Zachovej datum, čas a co mají děti přinést.\n\n' +
      'Vážení rodiče, dovolujeme si Vás informovat, že v pondělí 17. listopadu je státní svátek, a proto se ' +
      'nevyučuje. V úterý 18. listopadu proběhne od 16:00 v jídelně školy třídní schůzka, na které probereme ' +
      'prospěch za první čtvrtletí a plánovaný lyžařský kurz. Prosíme, aby děti v úterý přinesly podepsanou ' +
      'přihlášku na lyžařský kurz a zálohu 1 000 Kč v obálce se jménem. Děkujeme za spolupráci, třídní učitelka.',
    check: (t) => ({ ok: t.length <= 300, note: `${t.length} znaků (limit 300)` })
  },
  {
    id: 'terminy',
    title: 'Termíny z textu do JSON',
    prompt: 'Vytáhni z textu všechny termíny. Vrať POUZE JSON pole objektů ve tvaru ' +
      '{"datum": "RRRR-MM-DD", "udalost": "krátký popis"}. Nic jiného nepiš. Rok je 2026.\n\n' +
      'Ahoj, připomínám: zubař je 4. prosince v 8:15, vánoční besídka ve škole 18. 12. od 17 hodin. ' +
      'Kroužek keramiky končí 10. prosince a přihlášky na tábor se odevzdávají do 15. ledna 2027.',
    check: (t) => {
      let strict = true, v;
      try { v = JSON.parse(t.trim()); } catch (_) {
        strict = false;
        try { v = JSON.parse(stripFences(t)); } catch (_) { return { ok: false, note: 'neplatný JSON' }; }
      }
      if (!Array.isArray(v)) return { ok: false, note: 'JSON není pole' };
      const good = v.every((x) => x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.datum)) && typeof x.udalost === 'string' && x.udalost.trim());
      return { ok: good && strict, note: `${v.length} položek` + (good ? '' : ', špatný tvar položek') + (strict ? '' : ', obalené v ```') };
    }
  },
  {
    id: 'priority',
    title: 'Rozdělení úkolů podle důležitosti',
    prompt: 'Rozděl tyto úkoly do tří skupin s nadpisy přesně „Důležité“, „Střední“ a „Může počkat“. ' +
      'Každý úkol uveď právě jednou jako odrážku.\n\n' +
      '- zaplatit školní obědy (splatnost zítra)\n- objednat Emu k zubaři\n- vyměnit žárovku v předsíni\n' +
      '- podepsat přihlášku na lyžák (odevzdat v úterý)\n- uklidit sklep\n- koupit dárek k narozeninám babičky (za 3 týdny)',
    check: (t) => {
      const heads = ['Důležité', 'Střední', 'Může počkat'].filter((h) => t.includes(h));
      const items = t.split('\n').filter((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l)).length;
      return { ok: heads.length === 3 && items === 6, note: `${heads.length}/3 nadpisy, ${items} odrážek (čekáno 6)` };
    }
  },
  {
    id: 'preklepy',
    title: 'Oprava překlepů',
    input: 'Dobrí den, chtěla bych se zeptat jestli muže Ema zítra odejít ze školi uš v 11:30, protože má objednaneho lékaře. Děkuji a hezkí den, Jana Nováková',
    get prompt() { return 'Oprav v textu překlepy a gramatické chyby. Vrať jen opravený text.\n\n' + this.input; },
    check(t) {
      const r = t.length / this.input.length;
      return { ok: r >= 0.85 && r <= 1.2, note: `délka ${Math.round(r * 100)} % originálu (čekáno 85–120 %)` };
    }
  },
  {
    id: 'rozvrh',
    title: 'Otázka na rozvrh',
    prompt: 'Rozvrh Emy (4.B):\nPondělí: čeština, matematika, angličtina, tělocvik\nÚterý: matematika, prvouka, čeština, výtvarka\n' +
      'Středa: čeština, angličtina, hudebka\nČtvrtek: matematika, čeština, prvouka, tělocvik\nPátek: čeština, matematika, pracovní činnosti\n\n' +
      'Kolik hodin matematiky má Ema za týden a ve které dny? Odpověz jednou větou.',
    check: (t) => {
      const s = sentences(t), w = words(t);
      return { ok: s <= 1 && w <= 35, note: `${s} vět, ${w} slov (limit 1 věta, 35 slov)` };
    }
  }
];

function fmt(n, d) { return n.toFixed(d).replace('.', ','); }

async function testModel(model) {
  model = model || 'qwen3:8b';
  const release = await L.acquireSlot('test modelu ' + model, async (who) => console.log(`Ve frontě – teď pracuje ${who || 'jiný agent'}. Počkám…`));
  try {
    await L.checkOllama(model);
    console.log(`Testuji model ${model} na ${TASKS.length} úlohách v češtině…\n`);
    const rows = [];
    for (const [i, t] of TASKS.entries()) {
      process.stdout.write(`${i + 1}/${TASKS.length} ${t.title}… `);
      try {
        const r = await L.chat(model, SYSTEM, t.prompt, 240000);
        const c = t.check(r.text);
        rows.push({ t, r, c });
        console.log(`${fmt(r.wallMs / 1000, 1)} s, ${fmt(r.tokPerSec, 1)} tok/s, forma ${c.ok ? 'OK' : 'NE'}`);
      } catch (err) {
        rows.push({ t, err: err.message });
        console.log('chyba: ' + err.message);
      }
    }
    const mem = await L.modelMemory(model);
    const started = new Date();
    const out = [
      `# Test modelu ${model}`, '',
      `- Datum: ${started.toLocaleString('cs-CZ')}`,
      `- Nastavení: num_ctx ${L.OPTIONS.num_ctx}, temperature ${L.OPTIONS.temperature}, thinking vypnuté`,
      mem ? `- Paměť modelu: ${L.gb(mem.size)} (z toho GPU ${L.gb(mem.vram)})` : '- Paměť modelu: nezjištěno',
      '',
      '| # | Úloha | Čas | tok/s | Tokeny (vstup/výstup) | Forma | Poznámka | Známka |',
      '|---|---|---|---|---|---|---|---|'
    ];
    rows.forEach((x, i) => {
      if (x.err) out.push(`| ${i + 1} | ${x.t.title} | – | – | – | chyba | ${x.err.replace(/\|/g, '/')} | |`);
      else out.push(`| ${i + 1} | ${x.t.title} | ${fmt(x.r.wallMs / 1000, 1)} s | ${fmt(x.r.tokPerSec, 1)} | ${x.r.promptTokens}/${x.r.outTokens} | ${x.c.ok ? 'OK' : 'NE'} | ${x.c.note} | |`);
    });
    const done = rows.filter((x) => !x.err);
    const total = done.reduce((s, x) => s + x.r.wallMs, 0);
    out.push('', `Celkem ${fmt(total / 1000, 1)} s, forma splněna v ${done.filter((x) => x.c.ok).length} z ${TASKS.length} úloh. ` +
      'Sloupec „Známka“ vyplň sám podle odpovědí níže.', '');
    rows.forEach((x, i) => {
      out.push(`## ${i + 1}. ${x.t.title}`, '', '**Zadání:**', '', x.t.prompt.split('\n').map((l) => '> ' + l).join('\n'), '', '**Odpověď:**', '');
      out.push(x.err ? '_chyba: ' + x.err + '_' : x.r.text, '');
    });
    const file = path.join(L.resultsDir(), `test-model_${model.replace(/[^a-zA-Z0-9.-]+/g, '-')}_${L.stamp(started)}.md`);
    fs.writeFileSync(file, out.join('\n'));
    console.log('\n' + out.join('\n'));
    console.log('Uloženo: ' + file);
    return done.length === TASKS.length ? 0 : 1;
  } finally {
    release();
  }
}

module.exports = { testModel, TASKS };
