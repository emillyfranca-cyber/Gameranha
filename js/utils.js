// Utilitários compartilhados por todos os módulos.

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

// localStorage pode falhar (modo privado, bloqueio). Nunca deixa o jogo quebrar.
const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* ignora */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (_) { /* ignora */ }
  }
};

let toastTimeout;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove('show'), 2600);
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// O jogo antes se chamava WEB HERO. Copia as preferências e o ranking salvos com o nome antigo.
(function migrateOldStorageKeys() {
  const renames = {
    webHeroRanking: 'gameranhaRanking', webHeroMuted: 'gameranhaMuted', webHeroSens: 'gameranhaSens',
    webHeroReach: 'gameranhaReach', webHeroHand: 'gameranhaHand'
  };
  for (const [oldKey, newKey] of Object.entries(renames)) {
    try {
      const value = localStorage.getItem(oldKey);
      if (value !== null && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    } catch (_) { /* localStorage indisponível: segue sem migrar */ }
  }
})();
