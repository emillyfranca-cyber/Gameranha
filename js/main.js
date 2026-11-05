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

// ------------------------- PERSONAGEM -------------------------
$$('.character-card').forEach(card => card.addEventListener('click', () => {
  $$('.character-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
  Game.setCharacter(card.dataset.character, card.dataset.color);
}));

// ------------------------- INÍCIO DA MISSÃO -------------------------
// O jogo sempre começa fácil e a dificuldade sobe a cada fase (ver LEVELS em game.js).
// O codinome só é pedido no final da partida.
function startGame() {
  if (!Controller.isReady()) {
    toast('Conecte e calibre o disparador (ou use o modo demo) antes de iniciar.');
    return;
  }
  ctl.pendingStart = true;
  showCalibrationUI();
  updateCalibrationUI();
  startCountdown();
}

$('#startBtn').addEventListener('click', startGame);
$('#connectBtn').addEventListener('click', () => Controller.connect());
$('#demoBtn').addEventListener('click', () => Controller.toggleDemo());
// Com o controle físico, só o botão do controle atira. Mouse/teclado atiram apenas no modo demo.
function manualShoot() {
  if (Controller.mode() !== 'demo') { toast('Use o botão do controle para disparar.'); return; }
  Game.shootAtAim();
}
$('#shootBtn').addEventListener('click', manualShoot);

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
$('#clearRankingBtn').addEventListener('click', async () => {
  if (!askOperatorPin()) return;
  if (confirm('Tem certeza que deseja APAGAR todo o ranking (navegador e arquivo vinculado)? Exporte um backup antes.')) {
    await Ranking.clear();
    await Ranking.render();
    toast('Ranking apagado.');
  }
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

// ------------------------- PAINEL DO OPERADOR -------------------------
let operatorUnlocked = false;

// Pede a senha do operador (uma vez por sessão). Devolve a senha ou null se recusada.
function askOperatorPin() {
  if (operatorUnlocked) return OPERATOR_PIN;
  const typed = prompt('Senha do operador:');
  if (typed === null) return null;
  if (typed === OPERATOR_PIN) { operatorUnlocked = true; return OPERATOR_PIN; }
  toast('Senha incorreta.');
  return null;
}

function refreshOperatorStatus() {
  const modes = { none: 'sem controle', hardware: 'controle físico', demo: 'modo demo' };
  $('#opStatus').textContent =
    `Modo: ${modes[ctl.mode]} · Estado: ${ctl.status} · Firmware: ${ctl.fw || '—'} · Partida: ${Game.phase}`;
}

function openOperatorPanel() {
  if (!askOperatorPin()) return;
  syncSensitivitySliders();
  syncReach();
  refreshMeasureText();
  refreshOperatorStatus();
  $('#operatorPanel').classList.add('visible');
}
const closeOperatorPanel = () => {
  $('#operatorPanel').classList.remove('visible');
  Controller.stopMeasure();
};

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

// ------------------------- MÃO E ALCANCE DO PULSO -------------------------
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
  const text = $('#opMeasureText');
  $('#opApplyMeasure').disabled = !m.active;
  $('#opMeasure').textContent = m.active ? 'REINICIAR MEDIÇÃO' : 'MEDIR ALCANCE';
  text.textContent = m.active
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
  if (Controller.mode() !== 'hardware') { toast('Conecte e calibre o controle para medir o alcance.'); return; }
  Controller.startMeasure();
});
$('#opApplyMeasure').addEventListener('click', () => { Controller.applyMeasure(); toast('Alcance atualizado com as medidas.'); });
document.addEventListener('reach', syncReach);
document.addEventListener('handchange', syncHand);
document.addEventListener('measure', refreshMeasureText);

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
    if (Controller.mode() === 'demo') Game.shootAtAim();
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
Ranking.restore();
syncHand();
syncReach();
refreshSoundButton();

if (new URLSearchParams(location.search).has('demo')) Controller.enterDemo();
else Controller.autoReconnect();
