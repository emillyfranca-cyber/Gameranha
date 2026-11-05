// Servidor do WEB HERO: entrega o site e guarda o ranking em um banco SQLite.
//
//   node server.js            -> http://localhost:3333
//   PORT=8080 node server.js  -> outra porta
//   HOST=0.0.0.0 node server.js  -> acessível por outros aparelhos da rede (ex.: telão)
//   OPERATOR_PIN=1234 node server.js -> senha para apagar o ranking (padrão: 2025)
//
// Não precisa instalar nada: usa o SQLite embutido do Node (versão 22.13 ou mais nova).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT) || 3333;
const HOST = process.env.HOST || '127.0.0.1';
const OPERATOR_PIN = process.env.OPERATOR_PIN || '2025';
const ROOT = __dirname;
const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'ranking.db');
const MAX_BODY_BYTES = 4096;

// ------------------------- BANCO DE DADOS -------------------------
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS ranking (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    character  TEXT    NOT NULL,
    score      INTEGER NOT NULL,
    accuracy   INTEGER,
    max_combo  INTEGER,
    created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ranking_score ON ranking (score DESC, id ASC);
`);

const listStmt = db.prepare(`
  SELECT id, name, character, score, accuracy, max_combo AS maxCombo, created_at AS createdAt
  FROM ranking ORDER BY score DESC, id ASC LIMIT ?`);
const insertStmt = db.prepare(
  'INSERT INTO ranking (name, character, score, accuracy, max_combo) VALUES (?, ?, ?, ?, ?)');
const positionStmt = db.prepare(
  'SELECT COUNT(*) + 1 AS position FROM ranking WHERE score > ? OR (score = ? AND id < ?)');
const clearStmt = db.prepare('DELETE FROM ranking');

// ------------------------- VALIDAÇÃO -------------------------
const cleanText = (value, max) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const intInRange = (value, min, max) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

function validateEntry(body) {
  const name = cleanText(body?.name, 16);
  const character = cleanText(body?.character, 32) || 'Herói';
  const score = intInRange(body?.score, 0, 1_000_000);
  if (!name) return { error: 'Nome obrigatório.' };
  if (score === null) return { error: 'Pontuação inválida.' };
  return {
    value: {
      name, character, score,
      accuracy: intInRange(body?.accuracy, 0, 100),
      maxCombo: intInRange(body?.maxCombo, 0, 100000)
    }
  };
}

// ------------------------- HTTP -------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff'
};
const BLOCKED_DIRS = new Set(['data', 'node_modules', 'esp32']);

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new Error('Corpo muito grande.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch (_) { reject(new Error('JSON inválido.')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Operator-Pin'
    });
    res.end();
    return;
  }

  if (url.pathname !== '/api/ranking') return sendJson(res, 404, { error: 'Rota não encontrada.' });

  if (req.method === 'GET') {
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 30, 1), 500);
    return sendJson(res, 200, listStmt.all(limit));
  }

  if (req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (error) { return sendJson(res, 400, { error: error.message }); }
    const { value, error } = validateEntry(body);
    if (error) return sendJson(res, 400, { error });
    const { lastInsertRowid } = insertStmt.run(value.name, value.character, value.score, value.accuracy, value.maxCombo);
    const { position } = positionStmt.get(value.score, value.score, lastInsertRowid);
    return sendJson(res, 201, { id: Number(lastInsertRowid), position: Number(position) });
  }

  if (req.method === 'DELETE') {
    if (req.headers['x-operator-pin'] !== OPERATOR_PIN) return sendJson(res, 403, { error: 'Senha do operador incorreta.' });
    clearStmt.run();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Método não permitido.' });
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405);
    res.end();
    return;
  }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch (_) { res.writeHead(400); res.end(); return; }
  if (pathname === '/') pathname = '/index.html';

  const file = path.normalize(path.join(ROOT, pathname));
  const relative = path.relative(ROOT, file);
  const parts = relative.split(path.sep);
  const forbidden = relative.startsWith('..') || path.isAbsolute(relative) ||
    parts.some(part => part.startsWith('.') || BLOCKED_DIRS.has(part));
  const type = MIME[path.extname(file).toLowerCase()];

  if (forbidden || !type || relative === 'server.js') { res.writeHead(404); res.end('Não encontrado'); return; }

  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Não encontrado'); return; }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { error: 'Erro interno.' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WEB HERO rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Banco de dados do ranking: ${DB_PATH}`);
  if (HOST === '0.0.0.0') console.log('Atenção: acessível por outros aparelhos da rede.');
});

process.on('SIGINT', () => { db.close(); process.exit(0); });
