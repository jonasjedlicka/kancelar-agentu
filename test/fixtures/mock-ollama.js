'use strict';
/* Napodobenina Ollamy pro testy (/api/tags, /api/ps, /api/chat). Jen pro testy – žádný model neběží. */
const http = require('http');

function reply(prompt) {
  if (/JSON pole/.test(prompt)) return '[{"datum":"2026-12-04","udalost":"zubař"},{"datum":"2026-12-18","udalost":"vánoční besídka"},{"datum":"2026-12-10","udalost":"konec keramiky"},{"datum":"2027-01-15","udalost":"přihlášky na tábor"}]';
  if (/Rozděl tyto úkoly/.test(prompt)) return 'Důležité\n- zaplatit obědy\n- podepsat přihlášku\nStřední\n- objednat k zubaři\n- dárek pro babičku\nMůže počkat\n- žárovka\n- sklep';
  if (/Oprav v textu/.test(prompt)) return 'Dobrý den, chtěla bych se zeptat, jestli může Ema zítra odejít ze školy už v 11:30, protože má objednaného lékaře. Děkuji a hezký den, Jana Nováková';
  if (/Kolik hodin matematiky/.test(prompt)) return 'Ema má čtyři hodiny matematiky, a to v pondělí, úterý, čtvrtek a pátek.';
  if (/Zkrať tuto zprávu/.test(prompt)) return 'Po 17. 11. se neučí. Út 18. 11. v 16:00 třídní schůzka v jídelně. Děti v úterý přinesou podepsanou přihlášku na lyžák a zálohu 1 000 Kč v obálce.';
  if (/Shrň/.test(prompt)) return 'Ve čtvrtek jede 4.B do muzea, sraz v 7:30, návrat v 15:00. Děti potřebují svačinu, pití, pláštěnku a 150 Kč.';
  return '<think>skryté</think>Navrhuji tři kroky:\n- zjistit termín\n- napsat e-mail\n- zkontrolovat odpověď';
}

function start(opts) {
  opts = Object.assign({ models: ['qwen3:8b'], delayMs: 30 }, opts);
  const state = { requests: [], active: 0, maxActive: 0 };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/api/tags') return send(200, { models: opts.models.map((name) => ({ name, model: name })) });
      if (req.url === '/api/ps') return send(200, { models: opts.models.slice(0, 1).map((name) => ({ name, model: name, size: 6.1 * 1024 ** 3, size_vram: 6.1 * 1024 ** 3 })) });
      if (req.url === '/api/chat' && req.method === 'POST') {
        const j = JSON.parse(body);
        state.requests.push(j);
        if (!opts.models.includes(j.model)) return send(404, { error: `model "${j.model}" not found, try pulling it first` });
        state.active++; state.maxActive = Math.max(state.maxActive, state.active);
        const t = setTimeout(() => {
          state.active--;
          const text = reply(j.messages[j.messages.length - 1].content);
          send(200, { model: j.model, message: { role: 'assistant', content: text }, done: true,
            prompt_eval_count: 120, eval_count: 60, eval_duration: 2.5e9, load_duration: 1.2e9, total_duration: 4e9 });
        }, opts.delayMs);
        res.on('close', () => { if (!res.writableEnded) { clearTimeout(t); state.active--; } });
        return;
      }
      send(404, { error: 'not found' });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, state, close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); })
  })));
}

module.exports = { start };
if (require.main === module) {
  start({ delayMs: parseInt(process.env.MOCK_DELAY || '1500', 10) }).then((m) => console.log(m.url));
}
