// Ranking salvo em um arquivo JSON (File System Access API) e também no navegador.
//
// - O operador escolhe o arquivo UMA vez (botão "VINCULAR ARQUIVO JSON"). O navegador
//   lembra dele; a cada pontuação salva o arquivo é reescrito.
// - O localStorage guarda uma cópia: se o arquivo não estiver vinculado, nada se perde.
// - Funciona em Chrome/Edge (os mesmos navegadores exigidos pela Web Serial).
//   Em outros navegadores, use o botão BACKUP JSON.
//
// Formato do arquivo: { "version": 1, "app": "gameranha", "updatedAt": "...", "entries": [ ... ] }

const Ranking = (() => {
  const LOCAL_KEY = 'gameranhaRanking';
  const IDB_NAME = 'gameranhaFiles';
  const LEGACY_IDB_NAME = 'webHeroFiles';   // nome antigo (antes de o jogo se chamar Gameranha)
  const IDB_STORE = 'handles';
  const IDB_KEY = 'ranking';
  const MAX_ENTRIES = 500;
  const FS_SUPPORTED = 'showSaveFilePicker' in window;
  const PICKER_TYPES = [{ description: 'Ranking Gameranha (JSON)', accept: { 'application/json': ['.json'] } }];

  let handle = null;          // FileSystemFileHandle do arquivo vinculado
  let fileName = '';
  let fileState = FS_SUPPORTED ? 'none' : 'unsupported'; // none | linked | needs-permission | error | unsupported
  let cachedCount = 0;

  const notify = () => document.dispatchEvent(new CustomEvent('rankingfile'));

  // ------------------------- IndexedDB (guarda o "atalho" do arquivo) -------------------------
  function openDb(name = IDB_NAME) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function idbRun(mode, action, dbName) {
    const db = await openDb(dbName);
    return new Promise((resolve, reject) => {
      const request = action(db.transaction(IDB_STORE, mode).objectStore(IDB_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  const idbGet = () => idbRun('readonly', store => store.get(IDB_KEY)).catch(() => null);
  const idbGetLegacy = () => idbRun('readonly', store => store.get(IDB_KEY), LEGACY_IDB_NAME).catch(() => null);
  const idbSet = value => idbRun('readwrite', store => store.put(value, IDB_KEY)).catch(() => null);

  // ------------------------- LISTA -------------------------
  const isValid = e => e && typeof e.name === 'string' && Number.isFinite(Number(e.score));

  // null/vazio continuam null (Number(null) seria 0 e mostraria "0% PRECISÃO").
  const numberOrNull = value =>
    value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);

  function normalize(entry) {
    const createdAt = entry.createdAt || new Date().toISOString();
    return {
      id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: String(entry.name).replace(/[<>]/g, '').trim().slice(0, 16) || 'Herói',
      character: String(entry.character || 'Herói').slice(0, 32),
      score: Math.max(0, Math.round(Number(entry.score))),
      accuracy: numberOrNull(entry.accuracy),
      maxCombo: numberOrNull(entry.maxCombo),
      date: entry.date || new Date(createdAt).toLocaleDateString('pt-BR'),
      createdAt
    };
  }

  const sortList = list => list.sort((a, b) => b.score - a.score || String(a.createdAt).localeCompare(String(b.createdAt)));

  function merge(...lists) {
    const byId = new Map();
    for (const list of lists) for (const e of list) if (isValid(e)) {
      const entry = normalize(e);
      if (!byId.has(entry.id)) byId.set(entry.id, entry);
    }
    return sortList([...byId.values()]).slice(0, MAX_ENTRIES);
  }

  const loadLocal = () => {
    const list = store.get(LOCAL_KEY, []);
    return Array.isArray(list) ? list.filter(isValid).map(normalize) : [];
  };
  const saveLocal = list => { store.set(LOCAL_KEY, list); cachedCount = list.length; };

  // ------------------------- ARQUIVO -------------------------
  async function hasPermission(request = false) {
    const options = { mode: 'readwrite' };
    if ((await handle.queryPermission(options)) === 'granted') return true;
    return request && (await handle.requestPermission(options)) === 'granted';
  }

  // Lê o arquivo. Lança erro se o conteúdo não for um ranking válido.
  async function readFile() {
    const text = await (await handle.getFile()).text();
    if (!text.trim()) return [];
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(list)) throw new Error('Formato inválido');
    return list.filter(isValid);
  }

  async function writeFile(list) {
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify({
      version: 1, app: 'gameranha', updatedAt: new Date().toISOString(), entries: list
    }, null, 2));
    await writable.close();
  }

  // Junta o conteúdo do arquivo com o do navegador e grava o resultado nos dois.
  async function syncWithFile() {
    const merged = merge(loadLocal(), await readFile());
    saveLocal(merged);
    await writeFile(merged);
    fileState = 'linked';
  }

  // Reabre o arquivo vinculado em visitas anteriores. Com request=true pede autorização
  // (precisa ser chamado dentro de um clique/toque do usuário).
  async function restore({ request = false } = {}) {
    if (!FS_SUPPORTED) return;
    try {
      if (!handle) handle = await idbGet();
      if (!handle) {
        // Migra o arquivo vinculado quando o jogo ainda se chamava WEB HERO.
        handle = await idbGetLegacy();
        if (handle) await idbSet(handle);
      }
      if (!handle) { fileState = 'none'; return; }
      fileName = handle.name;
      if (await hasPermission(request)) await syncWithFile();
      else fileState = 'needs-permission';
    } catch (error) {
      console.error('Ranking: falha ao abrir o arquivo vinculado', error);
      fileState = 'error';
    }
    notify();
  }

  // Usa um arquivo já escolhido (também usado pelos testes automáticos).
  async function attachHandle(newHandle) {
    const previous = { handle, fileName, fileState };
    handle = newHandle;
    fileName = handle.name;
    try {
      await syncWithFile();
    } catch (error) {
      if (error instanceof SyntaxError || error.message === 'Formato inválido') {
        const replace = confirm(`O arquivo "${fileName}" não é um ranking válido.\n\nSubstituir o conteúdo dele pelo ranking atual?`);
        if (!replace) {
          // Mantém o arquivo que estava vinculado antes.
          ({ handle, fileName, fileState } = previous);
          notify();
          return false;
        }
        await writeFile(loadLocal());
        fileState = 'linked';
      } else {
        console.error(error);
        ({ handle, fileName, fileState } = previous);
        fileState = 'error';
        notify();
        return false;
      }
    }
    await idbSet(handle); // só lembra o arquivo depois de aceito
    notify();
    return true;
  }

  // Escolhe (ou cria) o arquivo do ranking.
  async function linkFile() {
    if (!FS_SUPPORTED) { toast('Este navegador não permite vincular arquivo. Use o Chrome ou o Edge.'); return false; }
    let picked;
    try {
      picked = await window.showSaveFilePicker({ suggestedName: 'ranking-gameranha.json', types: PICKER_TYPES });
    } catch (error) {
      if (error.name === 'AbortError') return false; // cancelou
      throw error;
    }
    return attachHandle(picked);
  }

  // Botão único: autoriza o arquivo já escolhido ou escolhe um novo.
  async function fileAction() {
    if (fileState === 'needs-permission') return restore({ request: true });
    return linkFile();
  }

  // ------------------------- API PÚBLICA -------------------------
  async function load(limit = 30) {
    const list = loadLocal();
    cachedCount = list.length;
    return list.slice(0, limit);
  }

  // Salva uma pontuação. Devolve { position, source } com source 'file' ou 'local'.
  async function add(entry) {
    const record = normalize(entry);
    const list = merge(loadLocal(), [record]);
    saveLocal(list);

    let source = 'local';
    if (handle) {
      try {
        if (await hasPermission(true)) { await writeFile(list); fileState = 'linked'; source = 'file'; }
        else fileState = 'needs-permission';
      } catch (error) {
        console.error('Ranking: falha ao gravar o arquivo', error);
        fileState = 'error';
      }
      notify();
    }
    const index = list.findIndex(e => e.id === record.id);
    return { position: index === -1 ? null : index + 1, source };
  }

  function statusText() {
    switch (fileState) {
      case 'linked': return `Ranking gravado no arquivo "${fileName}" (e também neste navegador).`;
      case 'needs-permission': return `O arquivo "${fileName}" precisa de autorização neste computador: clique em AUTORIZAR ARQUIVO.`;
      case 'error': return 'Não foi possível gravar no arquivo. O ranking continua salvo neste navegador; tente VINCULAR ARQUIVO JSON de novo.';
      case 'unsupported': return 'Este navegador não permite gravar em arquivo. O ranking fica salvo neste navegador: use BACKUP JSON.';
      default: return 'Ranking salvo só neste navegador. Clique em VINCULAR ARQUIVO JSON para gravar também em um arquivo.';
    }
  }

  const buttonLabel = () =>
    fileState === 'needs-permission' ? 'AUTORIZAR ARQUIVO' : fileState === 'linked' ? 'TROCAR ARQUIVO' : 'VINCULAR ARQUIVO JSON';

  function updateFileUi() {
    const label = $('#rankingSource');
    if (label) label.textContent = statusText();
    ['#linkFileBtn', '#opLinkFile'].forEach(selector => {
      const button = $(selector);
      if (!button) return;
      button.textContent = buttonLabel();
      button.hidden = fileState === 'unsupported';
    });
    const operatorStatus = $('#opFileStatus');
    if (operatorStatus) operatorStatus.textContent = statusText();
  }

  function formatMeta(entry) {
    const parts = [entry.character];
    if (typeof entry.accuracy === 'number') parts.push(`${entry.accuracy}% PRECISÃO`);
    if (entry.maxCombo) parts.push(`COMBO x${entry.maxCombo}`);
    if (entry.date) parts.push(entry.date);
    return parts.map(escapeHTML).join(' · ');
  }

  async function render(containerId = 'rankingList', limit = 30) {
    updateFileUi();
    const container = $(`#${containerId}`);
    if (!container) return;
    const list = await load(limit);
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

  // Baixa uma cópia do ranking (funciona em qualquer navegador).
  async function exportJson() {
    const payload = { version: 1, app: 'gameranha', updatedAt: new Date().toISOString(), entries: await load(MAX_ENTRIES) };
    downloadFile(`gameranha-ranking-${stamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
  }

  async function exportCsv() {
    const header = ['posicao', 'nome', 'personagem', 'pontos', 'precisao', 'combo', 'data'];
    const cell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = (await load(MAX_ENTRIES)).map((e, i) =>
      [i + 1, e.name, e.character, e.score, e.accuracy ?? '', e.maxCombo ?? '', e.date].map(cell).join(','));
    // BOM para o Excel abrir acentos corretamente.
    downloadFile(`gameranha-ranking-${stamp()}.csv`, '﻿' + [header.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8');
  }

  // Apaga o ranking do navegador e, se vinculado, do arquivo.
  async function clear() {
    saveLocal([]);
    if (handle) {
      try { if (await hasPermission(true)) await writeFile([]); } catch (error) { console.error(error); fileState = 'error'; }
      notify();
    }
  }

  return {
    load, add, render, clear, exportJson, exportCsv,
    restore, linkFile, fileAction, attachHandle,
    count: () => cachedCount,
    get fileState() { return fileState; },
    get supported() { return FS_SUPPORTED; }
  };
})();
