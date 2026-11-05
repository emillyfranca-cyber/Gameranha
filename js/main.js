// Ligação entre a interface (HTML) e os módulos. Também: modo quiosque e painel do operador.

const IDLE_ATTRACT_SECONDS = 60;

// ------------------------- NAVEGAÇÃO -------------------------
function showView(id) {
  $$('.tab').forEach(btn => btn.classList.toggle('active', btn.dataset.view === id));
  $$('.view').forEach(view => view.classList.toggle('active-view', view.id === id));
  if (id === 'rankingView') Ranking.render();
}

$$('.tab').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

// ------------------------- PERSONAGEM -------------------------
$$('.character-card').forEach(card => card.addEventListener('click', () => {
  $$('.character-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  Game.setCharacter(card.dataset.character, card.dataset.color);
}));

// ------------------------- INÍCIO, PARADA E CALIBRAÇÃO -------------------------
// O jogo sempre começa fácil e a dificuldade sobe a cada fase (ver LEVELS em game.js).
// O codinome só é pedido no final da partida.
function startGame() {
  if (!Controller.isReady()) {
    toast('Conecte e calibre o disparador antes de iniciar.');
    return;
  }
  ctl.pendingStart = true;
  showCalibrationUI();
  updateCalibrationUI();
  startCountdown();
}

// Para a partida e volta para a tela inicial. A pontuação da partida parada não é salva.
function stopGame({ ask = true } = {}) {
  if (Game.phase === 'idle') return false;
  if (ask && !confirm('Parar o jogo e voltar ao início? A pontuação desta partida será perdida.')) return false;
  Game.abort();
  showView('gameView');
  toast('Jogo parado. Voltando ao início.');
  return true;
}

// Recalibra o sensor (não pode acontecer no meio de uma partida).
function recalibrate() {
  if (Game.isRunning() && !stopGame()) return;
  Controller.startCalibration();
}

$('#startBtn').addEventListener('click', startGame);
$('#connectBtn').addEventListener('click', () => Controller.connect());
$('#recalibrateBtn').addEventListener('click', recalibrate);
$('#stopBtn').addEventListener('click', () => stopGame());

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
$('#clearRankingBtn').addEventListener('click', async () => {
  if (!confirm('Tem certeza que deseja APAGAR todo o ranking (navegador e arquivo vinculado)? Exporte um backup antes.')) return;
  await Ranking.clear();
  await Ranking.render();
  toast('Ranking apagado.');
});

// Arquivo JSON do ranking: vincular na 1ª vez, autorizar nas próximas visitas.
$('#linkFileBtn').addEventListener('click', () => Ranking.fileAction());
$('#opLinkFile').addEventListener('click', () => Ranking.fileAction());
document.addEventListener('rankingfile', () => Ranking.render());

// O navegador pode pedir autorização de novo a cada visita. Aproveita o 1º clique na página.
let authorizationTried = false;
document.addEventListener('pointerdown', () => {
  if (!authorizationTried && Ranking.fileState === 'needs-permission') {
    authorizationTried = true;
    Ranking.restore({ request: true });
  }
});

// ------------------------- PAINEL DO OPERADOR (tecla O ou botão ⚙) -------------------------
const operatorPanel = () => $('#operatorPanel');
const isOperatorPanelOpen = () => operatorPanel().classList.contains('visible');
let operatorTimer = null;

function refreshOperatorStatus() {
  const connection = ctl.mode === 'hardware' ? 'controle conectado' : 'controle desconectado';
  const phases = { idle: 'sem partida', intro: 'começando', playing: 'jogando', between: 'entre fases', over: 'tela final' };
  $('#opStatus').textContent =
    `${connection} · sensor: ${ctl.status} · firmware: ${ctl.fw || '—'} · partida: ${phases[Game.phase] || Game.phase}`;
}

function openOperatorPanel() {
  syncSensitivitySliders();
  syncReach();
  refreshMeasureText();
  refreshOperatorStatus();
  Ranking.render(); // atualiza o estado do arquivo de ranking
  operatorPanel().classList.add('visible');
  clearInterval(operatorTimer);
  operatorTimer = setInterval(refreshOperatorStatus, 1000);
}

function closeOperatorPanel() {
  operatorPanel().classList.remove('visible');
  clearInterval(operatorTimer);
  Controller.stopMeasure();
}

function syncSensitivitySliders() {
  $('#sensPitch').value = ctl.sens.pitch;
  $('#sensPitchValue').textContent = `${Number(ctl.sens.pitch).toFixed(0)}°`;
}

function applySensitivity() {
  const pitch = Number($('#sensPitch').value);
  $('#sensPitchValue').textContent = `${pitch}°`;
  Controller.setSensitivity(pitch);
}

$('#sensPitch').addEventListener('change', applySensitivity);
document.addEventListener('sensitivity', syncSensitivitySliders);

// ----- mão e alcance do pulso -----
function syncReach() {
  $('#reachLeft').value = ctl.reach.left;
  $('#reachRight').value = ctl.reach.right;
  $('#reachLeftValue').textContent = `${ctl.reach.left}°`;
  $('#reachRightValue').textContent = `${ctl.reach.right}°`;
}

function syncHand() {
  $$('.chip[data-hand]').forEach(chip => chip.classList.toggle('selected', chip.dataset.hand === ctl.hand));
  Game.applyHand();
}

function applyReachSliders() {
  Controller.setReach(Number($('#reachLeft').value), Number($('#reachRight').value));
}

function refreshMeasureText() {
  const m = Controller.measure();
  $('#opApplyMeasure').disabled = !m.active;
  $('#opMeasure').textContent = m.active ? 'REINICIAR MEDIÇÃO' : 'MEDIR ALCANCE';
  $('#opMeasureText').textContent = m.active
    ? `Gire o pulso até o limite confortável para a esquerda e para a direita. Medido: esquerda ${(-m.min).toFixed(0)}° · direita ${m.max.toFixed(0)}°`
    : 'Dica: use MEDIR ALCANCE para descobrir o giro confortável deste jogador.';
}

$$('.chip[data-hand]').forEach(chip => chip.addEventListener('click', () => {
  Controller.setHand(chip.dataset.hand);
  toast(chip.dataset.hand === 'right' ? 'Mão direita: personagem no canto direito.' : 'Mão esquerda: personagem no canto esquerdo.');
}));
$('#reachLeft').addEventListener('input', applyReachSliders);
$('#reachRight').addEventListener('input', applyReachSliders);
$('#opMeasure').addEventListener('click', () => {
  if (!Controller.isReady()) { toast('Conecte e calibre o controle para medir o alcance.'); return; }
  Controller.startMeasure();
});
$('#opApplyMeasure').addEventListener('click', () => { Controller.applyMeasure(); toast('Alcance atualizado com as medidas.'); });
document.addEventListener('reach', syncReach);
document.addEventListener('handchange', syncHand);
document.addEventListener('measure', refreshMeasureText);

// ----- botões do painel -----
$('#opClose').addEventListener('click', closeOperatorPanel);
$('#opRecalibrate').addEventListener('click', () => { closeOperatorPanel(); recalibrate(); });
$('#opCenter').addEventListener('click', () => {
  if (ctl.mode !== 'hardware') { toast('Conecte o controle para centralizar a mira.'); return; }
  Controller.center();
});
$('#opSkip').addEventListener('click', () => {
  if (Game.phase !== 'playing') { toast('Só dá para pular a fase durante o jogo.'); return; }
  Game.skipLevel();
  toast('Fase pulada.');
});
$('#opAbort').addEventListener('click', () => {
  if (Game.phase === 'idle') { toast('Não há partida em andamento.'); return; }
  closeOperatorPanel();
  stopGame({ ask: false });
});
$('#opCsv').addEventListener('click', () => Ranking.exportCsv());
$('#opJson').addEventListener('click', () => Ranking.exportJson());
$('#operatorBtn').addEventListener('click', openOperatorPanel);
operatorPanel().addEventListener('click', event => { if (event.target === operatorPanel()) closeOperatorPanel(); });

// ------------------------- ATALHOS DE TECLADO -------------------------
// Sem atalho de disparo: o tiro só sai pelo botão do controle.
document.addEventListener('keydown', event => {
  const target = event.target;
  const typing = target instanceof Element && (target.matches('input,textarea,select') || target.isContentEditable);
  if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

  switch (event.key.toLowerCase()) {
    case 'c':
      event.preventDefault();
      if (ctl.mode === 'hardware') Controller.center();
      break;
    case 'm': Sfx.toggle(); refreshSoundButton(); break;
    case 'f': toggleFullscreen(); break;
    case 'o': isOperatorPanelOpen() ? closeOperatorPanel() : openOperatorPanel(); break;
    case 'escape':
      if (isOperatorPanelOpen()) closeOperatorPanel();
      else if (document.body.classList.contains('board-mode')) exitBoardMode();
      else stopGame();
      break;
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
  const busy = Game.isRunning() || ctl.pendingStart || isCalibrationUIVisible() || isOperatorPanelOpen();
  if (idleSeconds >= IDLE_ATTRACT_SECONDS && onSetup && !busy && Ranking.count() > 0) {
    document.body.classList.add('attract');
    enterBoardMode({ fullscreen: false });
  }
  if (document.body.classList.contains('board-mode')) Ranking.render();
}, 5000);

// ------------------------- INICIALIZAÇÃO -------------------------
installCalibrationUI();
Ranking.render();
Ranking.restore();
syncHand();
syncReach();
refreshSoundButton();
Controller.refreshRecalibrateButton();
Controller.autoReconnect();
