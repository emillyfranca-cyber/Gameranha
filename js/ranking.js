// Ranking local (localStorage) com exportação de backup.

const Ranking = (() => {
  const KEY = 'webHeroRanking';
  const MAX_ENTRIES = 30;

  const load = () => {
    const list = store.get(KEY, []);
    return Array.isArray(list) ? list : [];
  };

  function add(entry) {
    const record = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...entry };
    const list = load();
    list.push(record);
    list.sort((a, b) => b.score - a.score);
    const kept = list.slice(0, MAX_ENTRIES);
    store.set(KEY, kept);
    const index = kept.findIndex(item => item.id === record.id);
    return index === -1 ? null : index + 1; // posição (1-based) ou null se ficou fora
  }

  function formatMeta(entry) {
    const parts = [entry.character];
    if (entry.difficulty) parts.push(entry.difficulty);
    if (typeof entry.accuracy === 'number') parts.push(`${entry.accuracy}% PRECISÃO`);
    if (entry.maxCombo) parts.push(`COMBO x${entry.maxCombo}`);
    if (entry.date) parts.push(entry.date);
    return parts.map(escapeHTML).join(' · ');
  }

  function render(containerId = 'rankingList', limit = MAX_ENTRIES) {
    const container = $(`#${containerId}`);
    if (!container) return;
    const list = load().slice(0, limit);
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

  function exportJson() {
    downloadFile(`webhero-ranking-${stamp()}.json`, JSON.stringify(load(), null, 2), 'application/json');
  }

  function exportCsv() {
    const header = ['posicao', 'nome', 'personagem', 'pontos', 'precisao', 'combo', 'dificuldade', 'data'];
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = load().map((e, i) =>
      [i + 1, e.name, e.character, e.score, e.accuracy ?? '', e.maxCombo ?? '', e.difficulty ?? '', e.date ?? ''].map(cell).join(','));
    // BOM para o Excel abrir acentos corretamente.
    downloadFile(`webhero-ranking-${stamp()}.csv`, '﻿' + [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
  }

  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const clear = () => store.remove(KEY);

  return { add, render, exportJson, exportCsv, clear, count: () => load().length };
})();
