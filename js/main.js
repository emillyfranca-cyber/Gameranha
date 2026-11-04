// Ligação entre a interface (HTML) e os módulos. Também: modo quiosque e painel do operador.

// Senha do painel do operador (evita que visitantes zerem o placar). Altere aqui.
const OPERATOR_PIN = '2025';
const IDLE_ATTRACT_SECONDS = 60;

// ------------------------- NAVEGAÇÃO -------------------------
function showView(id) {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === id));
  $$('.view').forEach(view => view.classList.toggle('active-view', view.id === id));
  if (id === 'rankingView') Ranking.render();
}

$$('.tab').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

// ------------------------- PERSONAGEM E DIFICULDADE -------------------------
$$('.character-card').forEach(card => card.addEventListener('click', () => {
  $$('.character-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  Game.setCharacter(card.dataset.character, card.dataset.color);
}));

$$('.chip[data-difficulty]').forEach(chip => chip.addEventListener('click', () => {
  $$('.chip[data-difficulty]').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');
  Game.setDifficulty(chip.dataset.difficulty);
  store.set('webHeroDifficulty', chip.dataset.difficulty);
}));

// ------------------------- INÍCIO DA MISSÃO -------------------------
function startGame() {
  const name = $('#playerName').value.trim().replace(/[<>]/g, '').slice(0, 16);
  if (!name) {
    toast('Digite seu codinome antes de começar.');
    $('#playerName').focus();
    return;
  }
  if (!Controller.isReady()) {
    toast('Conecte e calibre o disparador (ou use o modo demo) antes de iniciar.');
    return;
  }
  Game.setPlayer(name);
  ctl.pendingStart = true;
  showCalibrationUI();
  updateCalibrationUI();
  startCountdown();
}

$('#startBtn').addEventListener('click', startGame);
$('#connectBtn').addEventListener('click', () => Controller.connect());
$('#demoBtn').addEventListener('click', () => Controller.toggleDemo());
$('#shootBtn').addEventListener('click', () => Game.shootAtAim());

// ------------------------- MIRA COM MOUSE (SÓ NO MODO DEMO) -------------------------
const arenaEl = $('#arena');
arenaEl.addEventListener('pointermove', event => { if (Controller.mode() === 'demo') Game.pointerAim(event); });
arenaEl.addEventListener('pointerdown', event => {
  if (Controller.mode() !== 'demo') return;
  Game.pointerAim(event);
  Game.shootAtAim();
});
arenaEl.addEventListener('pointerleave', () => {
  if (Controller.mode() === 'demo') $('#crosshair').style.opacity = 0;
});

// ------------------------- SOM, TELA CHEIA E TELÃO -------------------------
function refreshSoundButton() {
  $('#soundBtn').textContent = Sfx.muted ? '🔇' : '🔊';
  $('#soundBtn').setAttribute('aria-pressed', String(Sfx.muted));
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => toast('Tela cheia indisponível.'));
}

function enterBoardMode({ fullscreen = true } = {}) {
  showView('rankingView');
  document.body.classList.add('board-mode');
  if (fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
}

function exitBoardMode() {
  document.body.classList.remove('board-mode', 'attract');
  if (document.fullscreenElement) document.exitFullscreen?.();
}

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.body.classList.contains('board-mode') && !document.body.classList.contains('attract')) {
    document.body.classList.remove('board-mode');
  }
});

$('#soundBtn').addEventListener('click', () => { Sfx.toggle(); refreshSoundButton(); Sfx.play('hit'); });
$('#fullscreenBtn').addEventListener('click', toggleFullscreen);
$('#boardBtn').addEventListener('click', () => enterBoardMode());
$('#rankingView').addEventListener('click', event => {
  if (document.body.classList.contains('board-mode') && !event.target.closest('button')) exitBoardMode();
});

// ------------------------- RANKING -------------------------
$('#exportCsvBtn').addEventListener('click', () => Ranking.exportCsv());
$('#exportJsonBtn').addEventListener('click', () => Ranking.exportJson());
$('#clearRankingBtn').addEventListener('click', () => {
  if (!askOperatorPin()) return;
  if (confirm('Tem certeza que deseja apagar o ranking salvo neste navegador? Exporte um backup antes.')) {
    Ranking.clear();
    Ranking.render();
    toast('Ranking local apagado.');
  }
});

// ------------------------- PAINEL DO OPERADOR -------------------------
let operatorUnlocked = false;

function askOperatorPin() {
  if (operatorUnlocked) return true;
  const typed = prompt('Senha do operador:');
  if (typed === null) return false;
  if (typed === OPERATOR_PIN) { operatorUnlocked = true; return true; }
  toast('Senha incorreta.');
  return false;
}

function refreshOperatorStatus() {
  const modes = { none: 'sem controle', hardware: 'controle físico', demo: 'modo demo' };
  $('#opStatus').textContent =
    `Modo: ${modes[ctl.mode]} · Estado: ${ctl.status} · Firmware: ${ctl.fw || '—'} · Partida: ${Game.phase}`;
}

function openOperatorPanel() {
  if (!askOperatorPin()) return;
  syncSensitivitySliders();
  refreshOperatorStatus();
  $('#operatorPanel').classList.add('visible');
}
const closeOperatorPanel = () => $('#operatorPanel').classList.remove('visible');

function syncSensitivitySliders() {
  $('#sensPitch').value = ctl.sens.pitch;
  $('#sensRoll').value = ctl.sens.roll;
  $('#sensPitchValue').textContent = `${Number(ctl.sens.pitch).toFixed(0)}°`;
  $('#sensRollValue').textContent = `${Number(ctl.sens.roll).toFixed(0)}°`;
}

function applySensitivity() {
  const pitch = Number($('#sensPitch').value);
  const roll = Number($('#sensRoll').value);
  $('#sensPitchValue').textContent = `${pitch}°`;
  $('#sensRollValue').textContent = `${roll}°`;
  Controller.setSensitivity(pitch, roll);
}

$('#sensPitch').addEventListener('change', applySensitivity);
$('#sensRoll').addEventListener('change', applySensitivity);
document.addEventListener('sensitivity', syncSensitivitySliders);

$('#opClose').addEventListener('click', closeOperatorPanel);
$('#opRecalibrate').addEventListener('click', () => { closeOperatorPanel(); Controller.startCalibration(); });
$('#opCenter').addEventListener('click', () => Controller.center());
$('#opSkip').addEventListener('click', () => Game.skipLevel());
$('#opAbort').addEventListener('click', () => { Game.abort(); closeOperatorPanel(); toast('Partida encerrada.'); });
$('#opCsv').addEventListener('click', () => Ranking.exportCsv());
$('#opJson').addEventListener('click', () => Ranking.exportJson());
$('#operatorBtn').addEventListener('click', openOperatorPanel);

// ------------------------- ATALHOS DE TECLADO -------------------------
document.addEventListener('keydown', event => {
  const typing = event.target && (event.target.matches('input,textarea,select') || event.target.isContentEditable);

  if (event.code === 'Space' && Game.isRunning() && !typing) {
    event.preventDefault();
    Game.shootAtAim();
    return;
  }
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

  switch (event.key.toLowerCase()) {
    case 'c': event.preventDefault(); Controller.center(); break;
    case 'm': Sfx.toggle(); refreshSoundButton(); break;
    case 'f': toggleFullscreen(); break;
    case 'o': openOperatorPanel(); break;
    case 'escape': closeOperatorPanel(); break;
  }
});

// ------------------------- MODO ATRAÇÃO (TELA PARADA MOSTRA O RANKING) -------------------------
let lastActivity = Date.now();

function registerActivity() {
  lastActivity = Date.now();
  if (document.body.classList.contains('attract')) {
    document.body.classList.remove('board-mode', 'attract');
    showView('gameView');
  }
}
['pointerdown', 'pointermove', 'keydown', 'touchstart'].forEach(name =>
  document.addEventListener(name, registerActivity, { passive: true }));

setInterval(() => {
  const idleSeconds = (Date.now() - lastActivity) / 1000;
  const onSetup = $('#gameView').classList.contains('active-view') && !$('#setupPanel').classList.contains('hidden');
  const busy = Game.isRunning() || ctl.pendingStart || isCalibrationUIVisible() || $('#operatorPanel').classList.contains('visible');
  if (idleSeconds >= IDLE_ATTRACT_SECONDS && onSetup && !busy && Ranking.count() > 0) {
    document.body.classList.add('attract');
    enterBoardMode({ fullscreen: false });
  }
  if (document.body.classList.contains('board-mode')) Ranking.render();
}, 5000);

// ------------------------- INICIALIZAÇÃO -------------------------
installCalibrationUI();
Ranking.render();
refreshSoundButton();

const savedDifficulty = store.get('webHeroDifficulty', 'normal');
const savedChip = $(`.chip[data-difficulty="${savedDifficulty}"]`);
if (savedChip) savedChip.click();

if (new URLSearchParams(location.search).has('demo')) Controller.enterDemo();
else Controller.autoReconnect();
