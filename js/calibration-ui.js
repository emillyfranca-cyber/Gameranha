// Tela de calibração e contagem regressiva que antecede a missão.

const CALIBRATION_CSS = `
  #calibrationOverlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(5,10,22,.94);backdrop-filter:blur(12px);color:#fff;font-family:inherit}
  #calibrationOverlay.visible{display:flex}
  .calibration-card{width:min(650px,100%);padding:clamp(24px,5vw,42px);border:1px solid rgba(141,226,255,.25);border-radius:24px;background:linear-gradient(145deg,#17243b,#0b1221);box-shadow:0 25px 90px #0008;text-align:center}
  .calibration-eyebrow{color:#8de2ff;font-size:12px;font-weight:800;letter-spacing:3px}
  .calibration-title{margin:12px 0;font-size:clamp(20px,4vw,30px);font-weight:900}
  .calibration-description{color:#b8c6d9;line-height:1.7;font-size:15px}
  .calibration-illustration{margin:25px auto;width:170px;height:150px;display:flex;align-items:center;justify-content:center;border-radius:24px;background:#8de2ff14;border:1px solid #8de2ff2e}
  .calibration-illustration span{font-size:76px;animation:calibrationPulse 2s ease-in-out infinite}
  @keyframes calibrationPulse{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-7px) rotate(5deg)}}
  .calibration-steps{display:grid;gap:10px;margin:25px 0;text-align:left}
  .calibration-step{display:flex;align-items:center;gap:13px;padding:13px;border-radius:12px;background:#ffffff0b;color:#dbe7f5;font-size:14px;line-height:1.5}
  .calibration-step-number{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:50%;background:#8de2ff26;color:#8de2ff;font-weight:900}
  .calibration-status{margin:20px 0 12px;color:#8de2ff;font-size:15px;font-weight:800}
  .calibration-progress{height:8px;overflow:hidden;border-radius:10px;background:#ffffff1a}
  .calibration-progress-bar{width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#45b9ff,#8de2ff);transition:width .4s ease}
  .calibration-tip{margin-top:17px;color:#9aaec5;font-size:12px;line-height:1.6}
  .calibration-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin-top:23px}
  .calibration-action{border:0;border-radius:12px;padding:13px 22px;font-weight:900;cursor:pointer}
  .calibration-primary{color:#071321;background:#8de2ff}
  .calibration-secondary{color:#dbe7f5;background:#ffffff1a}
  .calibration-countdown{margin:20px 0;font-size:clamp(60px,15vw,100px);font-weight:900;color:#8de2ff;text-shadow:0 0 35px #8de2ff66}
  .calibration-error{color:#ff9a9a}
  @media(max-width:480px){.calibration-card{padding:22px 17px}.calibration-illustration{width:125px;height:115px}.calibration-illustration span{font-size:58px}}
`;

function installCalibrationUI() {
  if ($('#calibrationOverlay')) return;
  const style = document.createElement('style');
  style.textContent = CALIBRATION_CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'calibrationOverlay';
  overlay.innerHTML = `
    <div class="calibration-card">
      <div class="calibration-eyebrow">WEB HERO · PREPARAÇÃO</div>
      <h2 class="calibration-title">Prepare seu disparador</h2>
      <p class="calibration-description" id="calibrationDescription">Antes da missão, precisamos calibrar o sensor para que a mira acompanhe corretamente os movimentos do seu pulso.</p>
      <div class="calibration-illustration"><span id="calibrationIcon">⌚</span></div>
      <div class="calibration-steps" id="calibrationSteps">
        <div class="calibration-step"><span class="calibration-step-number">1</span><span>Posicione o controle no pulso, na posição habitual de uso.</span></div>
        <div class="calibration-step"><span class="calibration-step-number">2</span><span>Deixe o braço parado e confortável, na posição central da mira.</span></div>
        <div class="calibration-step"><span class="calibration-step-number">3</span><span>Não movimente o sensor enquanto a calibração estiver acontecendo.</span></div>
      </div>
      <div class="calibration-status" id="calibrationStatusText">Aguardando controle...</div>
      <div class="calibration-progress"><div class="calibration-progress-bar" id="calibrationProgressBar"></div></div>
      <p class="calibration-tip" id="calibrationTip">Mantenha o pulso relaxado. Dica: segurar o botão do controle por 1 segundo também inicia a calibração.</p>
      <div id="calibrationCountdown" class="calibration-countdown" style="display:none"></div>
      <div class="calibration-actions">
        <button id="calibrationRetry" class="calibration-action calibration-primary" style="display:none">INICIAR CALIBRAÇÃO</button>
        <button id="calibrationCancel" class="calibration-action calibration-secondary">VOLTAR</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  $('#calibrationCancel').addEventListener('click', () => {
    ctl.pendingStart = false;
    ctl.countdownRunning = false;
    hideCalibrationUI();
  });
  $('#calibrationRetry').addEventListener('click', () => Controller.startCalibration());
}

const showCalibrationUI = () => $('#calibrationOverlay')?.classList.add('visible');
const hideCalibrationUI = () => $('#calibrationOverlay')?.classList.remove('visible');
const isCalibrationUIVisible = () => !!$('#calibrationOverlay')?.classList.contains('visible');

function updateCalibrationUI() {
  const text = $('#calibrationStatusText');
  const desc = $('#calibrationDescription');
  const icon = $('#calibrationIcon');
  const progress = $('#calibrationProgressBar');
  const retry = $('#calibrationRetry');
  const countdown = $('#calibrationCountdown');
  if (!text || !desc || !icon || !progress || !retry || !countdown) return;

  text.classList.remove('calibration-error');
  retry.style.display = 'none';
  countdown.style.display = 'none';
  $('#calibrationSteps').style.display = ctl.mode === 'demo' ? 'none' : 'grid';

  const attempt = ctl.attempt;
  switch (ctl.status) {
    case 'waiting':
      text.textContent = 'Aguardando resposta do controle...';
      desc.textContent = 'O controle está conectado. Aguarde a identificação do sensor.';
      icon.textContent = '⌚'; progress.style.width = '10%';
      break;
    case 'calibration_required':
      text.textContent = 'Sensor detectado. Pronto para calibrar.';
      desc.textContent = 'Posicione o sensor no pulso, mantenha o braço imóvel e pressione INICIAR CALIBRAÇÃO.';
      icon.textContent = '⌚'; progress.style.width = '10%';
      retry.textContent = 'INICIAR CALIBRAÇÃO'; retry.style.display = 'inline-block';
      break;
    case 'calibrating':
      text.textContent = attempt ? `Calibrando sensor — tentativa ${attempt} de 3. Não movimente o pulso!` : 'Calibrando sensor. Não movimente o pulso!';
      desc.textContent = 'Estamos medindo o comportamento do giroscópio e verificando se o sensor está estável.';
      icon.textContent = '🎯'; progress.style.width = '55%';
      break;
    case 'retry':
      text.textContent = attempt ? `Movimento detectado. Nova tentativa (${attempt} de 3).` : 'Movimento detectado. Vamos tentar novamente.';
      desc.textContent = 'O sensor percebeu movimento durante a calibração. Relaxe o braço e mantenha o controle imóvel.';
      icon.textContent = '✋'; progress.style.width = '25%';
      break;
    case 'calibrated':
      text.textContent = 'Calibração concluída!';
      desc.textContent = 'Ótimo! O sensor foi calibrado. Prepare-se para a missão.';
      icon.textContent = '✓'; progress.style.width = '100%';
      break;
    case 'ready':
      text.textContent = ctl.mode === 'demo' ? 'Modo demonstração' : 'Controle pronto!';
      desc.textContent = ctl.mode === 'demo' ? 'Use o mouse ou o toque para mirar e clicar para disparar.' : 'A calibração terminou. A missão está liberada.';
      icon.textContent = '🕷️'; progress.style.width = '100%';
      break;
    case 'error':
      text.textContent = 'Não foi possível calibrar o sensor.';
      text.classList.add('calibration-error');
      desc.textContent = 'Verifique se o controle está conectado e se o sensor está imóvel. Você pode tentar novamente.';
      icon.textContent = '⚠️'; progress.style.width = '0%';
      retry.textContent = 'TENTAR NOVAMENTE'; retry.style.display = 'inline-block';
      break;
  }
}

// ------------------------- CONTAGEM REGRESSIVA -------------------------
async function startCountdown() {
  if (ctl.countdownRunning || !ctl.pendingStart || !Controller.isReady()) return;
  ctl.countdownRunning = true;

  const text = $('#calibrationStatusText');
  const description = $('#calibrationDescription');
  const countdown = $('#calibrationCountdown');
  const stillValid = () => ctl.pendingStart && Controller.isReady();
  const abort = () => { ctl.countdownRunning = false; };

  $('#calibrationIcon').textContent = '🚀';
  $('#calibrationSteps').style.display = 'none';
  description.textContent = 'Posicione sua mira. A missão está prestes a começar!';
  countdown.style.display = 'block';

  const from = ctl.mode === 'demo' ? 3 : 5;
  for (let i = from; i >= 1; i--) {
    if (!stillValid()) return abort();
    countdown.textContent = i;
    text.textContent = 'Prepare-se!';
    Sfx.play('count');
    await sleep(1000);
  }
  if (!stillValid()) return abort();

  countdown.textContent = 'VAI!';
  Sfx.play('go');
  await sleep(450);
  if (!Controller.isReady()) { ctl.pendingStart = false; return abort(); }

  ctl.pendingStart = false;
  ctl.countdownRunning = false;
  hideCalibrationUI();
  Game.begin();
}
