// Ranking: salvo no banco SQLite pelo servidor (server.js).
// Se o servidor não estiver rodando, usa o localStorage do navegador como reserva.

const Ranking = (() => {
  const LOCAL_KEY = 'webHeroRanking';
  const LOCAL_MAX = 50;
  const REQUEST_TIMEOUT_MS = 2500;
  // Por padrão a API é do mesmo endereço da página. Para outro servidor: index.html?api=http://IP:3000
  const API_BASE = (new URLSearchParams(location.search).get('api') || '').replace(/\/$/, '');

  let source = 'local';   // 'server' | 'local' (resultado da última operação)
  let cachedCount = 0;

  // ------------------------- SERVIDOR -------------------------
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(API_BASE + path, {
        ...options,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------- RESERVA LOCAL -------------------------
  const loadLocal = () => {
    const list = store.get(LOCAL_KEY, []);
    return Array.isArray(list) ? list : [];
  };

  function addLocal(entry) {
    const record = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...entry };
    const list = loadLocal();
    list.push(record);
    list.sort((a, b) => b.score - a.score);
    const kept = list.slice(0, LOCAL_MAX);
    store.set(LOCAL_KEY, kept);
    const index = kept.findIndex(item => item.id === record.id);
    return index === -1 ? null : index + 1;
  }

  // ------------------------- API PÚBLICA -------------------------
  async function load(limit = 30) {
    try {
      const list = await api(`/api/ranking?limit=${limit}`);
      source = 'server';
      cachedCount = list.length;
      return list;
    } catch (_) {
      source = 'local';
      const list = loadLocal().slice(0, limit);
      cachedCount = list.length;
      return list;
    }
  }

  // Salva uma pontuação. Devolve { position, source }.
  async function add(entry) {
    const record = { ...entry, date: new Date().toLocaleDateString('pt-BR') };
    try {
      const result = await api('/api/ranking', { method: 'POST', body: JSON.stringify(entry) });
      source = 'server';
      addLocal(record); // cópia de segurança no navegador
      return { position: result.position, source: 'server' };
    } catch (_) {
      source = 'local';
      return { position: addLocal(record), source: 'local' };
    }
  }

  function formatMeta(entry) {
    const parts = [entry.character];
    if (typeof entry.accuracy === 'number') parts.push(`${entry.accuracy}% PRECISÃO`);
    if (entry.maxCombo) parts.push(`COMBO x${entry.maxCombo}`);
    const date = entry.date || (entry.createdAt ? new Date(entry.createdAt).toLocaleDateString('pt-BR') : '');
    if (date) parts.push(date);
    return parts.map(escapeHTML).join(' · ');
  }

  async function render(containerId = 'rankingList', limit = 30) {
    const container = $(`#${containerId}`);
    if (!container) return;
    const list = await load(limit);

    const label = $('#rankingSource');
    if (label) {
      label.textContent = source === 'server'
        ? 'Ranking salvo no banco de dados (SQLite) do servidor.'
        : 'Servidor do ranking desligado: mostrando só os resultados salvos neste navegador. Inicie com "node server.js".';
    }

    if (!list.length) {
      container.innerHTML = '<div class="empty-ranking">✦<br><br>Nenhum herói no placar ainda.<br>Jogue a primeira missão para inaugurar o ranking!</div>';
      return;
    }
    container.innerHTML = list.map((entry, i) => `
      <div class="ranking-row">
        <span class="rank-number ${i < 3 ? 'top' : ''}">${String(i + 1).padStart(2, '0')}</span>
        <div>
          <div class="rank-player">${escapeHTML(entry.name)}</div>
          <div class="rank-meta">${formatMeta(entry)}</div>
        </div>
        <strong class="rank-score">${Number(entry.score).toLocaleString('pt-BR')}</strong>
      </div>`).join('');
  }

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  async function exportJson() {
    downloadFile(`webhero-ranking-${stamp()}.json`, JSON.stringify(await load(500), null, 2), 'application/json');
  }

  async function exportCsv() {
    const header = ['posicao', 'nome', 'personagem', 'pontos', 'precisao', 'combo', 'data'];
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = (await load(500)).map((e, i) => [
      i + 1, e.name, e.character, e.score, e.accuracy ?? '', e.maxCombo ?? '',
      e.date || (e.createdAt ? new Date(e.createdAt).toLocaleString('pt-BR') : '')
    ].map(cell).join(','));
    // BOM para o Excel abrir acentos corretamente.
    downloadFile(`webhero-ranking-${stamp()}.csv`, '﻿' + [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
  }

  // Apaga o ranking do servidor (exige a senha do operador) e o da reserva local.
  async function clear(pin) {
    let serverCleared = false;
    try {
      await api('/api/ranking', { method: 'DELETE', headers: { 'X-Operator-Pin': pin } });
      serverCleared = true;
    } catch (_) { /* servidor desligado ou senha recusada */ }
    store.remove(LOCAL_KEY);
    return serverCleared;
  }

  return { load, add, render, exportJson, exportCsv, clear, count: () => cachedCount, get source() { return source; } };
})();
