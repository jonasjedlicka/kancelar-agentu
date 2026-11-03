'use strict';
/* Lokální HTTP API. Poslouchá výhradně na 127.0.0.1.
 *   GET  /api/health
 *   GET  /api/agents
 *   GET  /api/agents/:id
 *   GET  /api/agents/:id/history
 *   POST /api/agents/:id/status   {"state": "working", "task": "Kontroluju Edookit"}
 */
const http = require('http');
const { STATES, STATE_LABELS, normalizeState, normalizeAgentId } = require('./agents');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 47800;
const MAX_BODY = 16 * 1024;

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Tělo požadavku je příliš velké.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function publicAgent(a) {
  return { id: a.id, name: a.name, kind: a.kind, state: a.state, stateLabel: STATE_LABELS[a.state], task: a.task, updatedAt: a.updatedAt };
}

function createServer(store) {
  let port = null;

  const server = http.createServer(async (req, res) => {
    try {
      // Ochrana proti DNS rebindingu a požadavkům z webových stránek v prohlížeči.
      const host = String(req.headers.host || '');
      if (host !== `${HOST}:${port}` && host !== `localhost:${port}`) {
        return send(res, 403, { ok: false, error: 'Nepovolený Host.' });
      }
      if (req.headers.origin) {
        return send(res, 403, { ok: false, error: 'Požadavky z prohlížeče nejsou povolené.' });
      }
      const url = new URL(req.url, `http://${HOST}:${port}`);
      const parts = url.pathname.split('/').filter(Boolean).map((p) => decodeURIComponent(p));

      if (req.method === 'GET' && url.pathname === '/api/health') {
        return send(res, 200, { ok: true, app: 'Kancelář agentů', port });
      }
      if (parts[0] !== 'api' || parts[1] !== 'agents') {
        return send(res, 404, { ok: false, error: 'Neznámá adresa.' });
      }
      if (req.method === 'GET' && parts.length === 2) {
        return send(res, 200, { ok: true, agents: store.list().map(publicAgent) });
      }
      const id = normalizeAgentId(parts[2]);
      const agent = store.get(id);
      if (!agent) {
        return send(res, 404, {
          ok: false,
          error: `Neznámý agent „${parts[2]}“.`,
          agents: store.list().map((a) => a.id)
        });
      }
      if (req.method === 'GET' && parts.length === 3) {
        return send(res, 200, { ok: true, agent: publicAgent(agent) });
      }
      if (req.method === 'GET' && parts.length === 4 && parts[3] === 'history') {
        const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        return send(res, 200, { ok: true, history: store.getHistory(id, limit) });
      }
      if (req.method === 'POST' && parts.length === 4 && parts[3] === 'status') {
        const ct = String(req.headers['content-type'] || '');
        if (!ct.startsWith('application/json')) {
          return send(res, 415, { ok: false, error: 'Použij Content-Type: application/json.' });
        }
        let body;
        try {
          body = JSON.parse((await readBody(req)) || '{}');
        } catch (err) {
          return send(res, err.status || 400, { ok: false, error: err.status ? err.message : 'Neplatný JSON.' });
        }
        if (!body || typeof body !== 'object') return send(res, 400, { ok: false, error: 'Neplatný JSON.' });
        const state = normalizeState(body.state);
        if (!state) {
          return send(res, 400, { ok: false, error: `Neznámý stav „${body.state}“.`, states: STATES });
        }
        const task = body.task != null ? body.task : (body.message != null ? body.message : '');
        if (typeof task !== 'string') return send(res, 400, { ok: false, error: 'Text úkolu musí být řetězec.' });
        const updated = store.setStatus(id, state, task, 'api');
        return send(res, 200, { ok: true, agent: publicAgent(updated) });
      }
      return send(res, 405, { ok: false, error: 'Nepovolená metoda.' });
    } catch (err) {
      console.error('Chyba API:', err);
      if (!res.headersSent) send(res, 500, { ok: false, error: 'Vnitřní chyba.' });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 5000;

  function listen(startPort) {
    const first = startPort || DEFAULT_PORT;
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const tryPort = (p) => {
        const onError = (err) => {
          server.removeListener('listening', onListening);
          if (err.code === 'EADDRINUSE' && attempt < 20) {
            attempt++;
            tryPort(p + 1);
          } else {
            reject(err);
          }
        };
        const onListening = () => {
          server.removeListener('error', onError);
          port = server.address().port;
          resolve(port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(p, HOST);
      };
      tryPort(first);
    });
  }

  return {
    listen,
    close: () => new Promise((r) => { server.close(() => r()); server.closeAllConnections(); }),
    get port() { return port; }
  };
}

module.exports = { createServer, HOST, DEFAULT_PORT };
