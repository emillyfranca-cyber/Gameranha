// Comunicação com o controle (ESP32 via Web Serial) e modo demonstração.
//
// Protocolo ESP32 -> navegador (uma linha por mensagem):
//   HELLO:FW2            versão do firmware
//   SENSOR_OK / SENSOR_ERROR / CALIBRATION_REQUIRED / CALIBRATING / CALIBRATION_ATTEMPT:n
//   CALIBRATION_RETRY / CALIBRATION_OK / CALIBRATION_ERROR / READY / CENTER_OK / CENTER_ERROR
//   I2C_RECOVERY / SENSOR_RECOVERED
//   AIM:x,y              mira (0..1000)
//   SHOOT                disparo (botão ou movimento brusco)
//   SENS_OK:p,r          faixa atual em graus (vertical, horizontal). O AIM horizontal é
//                        500 + giro/faixa*500; o site converte o giro para a tela (ver mapHorizontal)
// Protocolo navegador -> ESP32:
//   STATUS, CALIBRATE, CENTER, SENS:p,r
//   HIT, MISS, PENALTY, LEVEL   (feedback sonoro e de vibração no controle)

const ctl = {
  mode: 'none',                 // none | hardware | demo
  port: null, reader: null, writer: null, buffer: '', generation: 0,
  status: 'disconnected',       // disconnected | waiting | calibration_required | calibrating | retry | calibrated | ready | error
  attempt: 0,
  pendingStart: false, countdownRunning: false, calibrationRequested: false, centerPending: false,
  fw: null,
  sens: { pitch: 22, roll: 90 },
  // Mão do jogador e alcance CONFORTÁVEL do giro do pulso (graus a partir da pose calibrada).
  // O punho gira mais para um lado do que para o outro; cada lado é esticado até a borda da tela.
  hand: 'right',                // right | left
  reach: { left: 45, right: 20 },
  rel: 0,                       // giro atual do pulso em graus (+ = direita)
  disconnectHandler: null
};

// O firmware usa uma faixa larga de roll (±90°); o site converte o ângulo para a tela.
const FW_ROLL_RANGE = 90;
const DEFAULT_REACH = { right: { left: 45, right: 20 }, left: { left: 20, right: 45 } };

const Controller = (() => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // ------------------------- INTERFACE -------------------------
  function setConnectionUI({ connected, text, connectLabel, connectDisabled, startLabel, startDisabled, demoLabel }) {
    $('#connectionDot').classList.toggle('connected', connected);
    $('#connectionText').textContent = text;
    $('#connectBtn').textContent = connectLabel;
    $('#connectBtn').disabled = connectDisabled;
    $('#startBtn').innerHTML = `${startLabel} <span>↗</span>`;
    $('#startBtn').disabled = startDisabled;
    if (demoLabel) $('#demoBtn').textContent = demoLabel;
  }

  const DISCONNECTED_UI = {
    connected: false, text: 'DISPARADOR NÃO CONECTADO',
    connectLabel: 'CONECTAR DISPARADOR', connectDisabled: false,
    startLabel: 'AGUARDANDO CONTROLE', startDisabled: true,
    demoLabel: 'JOGAR SEM CONTROLE (DEMO)'
  };

  // ------------------------- MODO DEMO -------------------------
  function enterDemo() {
    if (ctl.port) { toast('Desconecte o controle antes de usar o modo demo.'); return; }
    ctl.mode = 'demo';
    ctl.status = 'ready';
    setConnectionUI({
      connected: true, text: 'MODO DEMO · MOUSE OU TOQUE',
      connectLabel: 'CONECTAR DISPARADOR', connectDisabled: true,
      startLabel: 'INICIAR MISSÃO', startDisabled: false,
      demoLabel: 'USAR CONTROLE FÍSICO'
    });
    toast('Modo demo ativado: mire com o mouse e clique para disparar.');
  }

  function leaveDemo() {
    ctl.mode = 'none';
    ctl.status = 'disconnected';
    ctl.pendingStart = false;
    setConnectionUI(DISCONNECTED_UI);
  }

  const toggleDemo = () => (ctl.mode === 'demo' ? leaveDemo() : enterDemo());

  // ------------------------- ENVIO -------------------------
  async function send(command, quiet = false) {
    const writer = ctl.writer;
    if (!writer) {
      if (!quiet) toast('Conecte o controle antes de enviar o comando.');
      return false;
    }
    try {
      await writer.write(encoder.encode(command));
      return ctl.writer === writer;
    } catch (error) {
      console.error('Erro ao enviar comando serial:', error);
      if (!quiet) toast('Falha na comunicação com o controle.');
      return false;
    }
  }

  // Feedback de jogo (som/vibração no controle). Silencioso e opcional.
  function feedback(name) {
    if (ctl.mode === 'hardware' && ctl.writer) send(`${name}\n`, true);
  }

  async function startCalibration() {
    if (!ctl.writer) { toast('Conecte o controle antes de calibrar.'); return; }
    if (ctl.status === 'calibrating') { toast('A calibração já está em andamento.'); return; }
    ctl.pendingStart = false;
    ctl.countdownRunning = false;
    ctl.calibrationRequested = true;
    ctl.status = 'calibrating';
    ctl.attempt = 0;
    showCalibrationUI();
    updateCalibrationUI();
    if (!(await send('CALIBRATE\n'))) {
      ctl.status = 'error';
      ctl.calibrationRequested = false;
      updateCalibrationUI();
    }
  }

  async function center() {
    if (ctl.mode !== 'hardware') return;
    ctl.centerPending = true;
    if (await send('CENTER\n')) toast('Solicitando centralização da mira...');
  }

  // Sensibilidade vertical. O horizontal agora é definido por reach (alcance de cada lado).
  function setSensitivity(pitch) {
    ctl.sens = { pitch, roll: FW_ROLL_RANGE };
    store.set('webHeroSens', ctl.sens);
    send(`SENS:${pitch.toFixed(1)},${FW_ROLL_RANGE.toFixed(1)}\n`, true);
  }

  // ------------------------- MÃO, ALCANCE E MEDIÇÃO -------------------------
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const measure = { active: false, min: 0, max: 0 };

  function setReach(left, right) {
    ctl.reach = { left: clamp(Math.round(left), 8, 85), right: clamp(Math.round(right), 8, 85) };
    store.set('webHeroReach', ctl.reach);
    document.dispatchEvent(new CustomEvent('reach'));
  }

  // Trocar de mão espelha o alcance (o lado fácil passa a ser o outro).
  function setHand(hand) {
    if (hand !== 'right' && hand !== 'left') return;
    if (hand !== ctl.hand) setReach(ctl.reach.right, ctl.reach.left);
    ctl.hand = hand;
    store.set('webHeroHand', hand);
    document.dispatchEvent(new CustomEvent('handchange'));
  }

  function startMeasure() {
    Object.assign(measure, { active: true, min: 0, max: 0 });
    document.dispatchEvent(new CustomEvent('measure'));
  }

  function stopMeasure() {
    if (!measure.active) return;
    measure.active = false;
    document.dispatchEvent(new CustomEvent('measure'));
  }

  // Usa o maior giro medido para cada lado como alcance (ignora lado com menos de 8°).
  function applyMeasure() {
    if (!measure.active) return;
    const left = -measure.min >= 8 ? -measure.min : ctl.reach.left;
    const right = measure.max >= 8 ? measure.max : ctl.reach.right;
    setReach(left, right);
    measure.active = false;
    document.dispatchEvent(new CustomEvent('measure'));
  }

  // Converte o x bruto do firmware (0..1000, 500 = pose calibrada) em x de tela (0..1000).
  // Pose calibrada = ponto onde o alcance da esquerda termina e o da direita começa.
  function mapHorizontal(rawX) {
    const rel = ((rawX - 500) / 500) * ctl.sens.roll;   // graus; + = girou para a direita
    ctl.rel = rel;
    if (measure.active) {
      measure.min = Math.min(measure.min, rel);
      measure.max = Math.max(measure.max, rel);
      document.dispatchEvent(new CustomEvent('measure'));
    }
    const { left, right } = ctl.reach;
    return clamp(((rel + left) / (left + right)) * 1000, 0, 1000);
  }

  // ------------------------- CONEXÃO -------------------------
  async function connect(knownPort = null) {
    if (!('serial' in navigator)) { toast('Web Serial não disponível. Use Chrome ou Edge atualizado.'); return; }
    if (ctl.port) { toast('Já existe um controle conectado.'); return; }
    if (ctl.mode === 'demo') { toast('Saia do modo demo para conectar o controle.'); return; }

    let port = knownPort;
    try {
      if (!port) port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      if (!port.writable || !port.readable) throw new Error('A porta serial não disponibilizou leitura e escrita.');

      ctl.port = port;
      ctl.mode = 'hardware';
      ctl.generation++;
      const generation = ctl.generation;
      ctl.buffer = '';
      ctl.fw = null;
      ctl.writer = port.writable.getWriter();

      setConnectionUI({
        connected: true, text: 'DISPARADOR CONECTADO · VALIDANDO SENSOR',
        connectLabel: 'DISPARADOR CONECTADO', connectDisabled: true,
        startLabel: 'AGUARDANDO CALIBRAÇÃO', startDisabled: true
      });
      $('#demoBtn').disabled = true;
      ctl.status = 'waiting';
      ctl.attempt = 0;
      ctl.calibrationRequested = false;
      showCalibrationUI();
      updateCalibrationUI();

      ctl.disconnectHandler = handleDisconnect;
      navigator.serial.addEventListener('disconnect', ctl.disconnectHandler);
      toast('Controle conectado. Consultando o sensor...');
      readLoop(port, generation);

      await sleep(250);
      if (ctl.port === port) await send('STATUS\n', true);
      send(`SENS:${ctl.sens.pitch.toFixed(1)},${FW_ROLL_RANGE.toFixed(1)}\n`, true);

      setTimeout(() => {
        if (ctl.port === port && !ctl.fw) toast('Firmware desatualizado: grave a versão nova no ESP32.');
      }, 3000);
    } catch (error) {
      if (error?.name !== 'NotFoundError') console.error(error); // NotFoundError = usuário cancelou
      if (port && ctl.port !== port) { try { await port.close(); } catch (_) { /* já fechada */ } }
      await cleanup();
      ctl.mode = 'none';
      ctl.status = 'disconnected';
      setConnectionUI(DISCONNECTED_UI);
      $('#demoBtn').disabled = false;
      hideCalibrationUI();
      if (error?.name !== 'NotFoundError') toast('Não foi possível conectar. Confira a placa e a permissão USB.');
    }
  }

  async function cleanup() {
    const { reader, writer, port } = ctl;
    ctl.reader = ctl.writer = ctl.port = null;
    ctl.buffer = '';
    ctl.generation++;
    if (ctl.disconnectHandler) {
      navigator.serial.removeEventListener('disconnect', ctl.disconnectHandler);
      ctl.disconnectHandler = null;
    }
    try { if (reader) await reader.cancel(); } catch (e) { console.warn('Não foi possível cancelar a leitura:', e); }
    try { if (reader) reader.releaseLock(); } catch (e) { console.warn('Não foi possível liberar o leitor:', e); }
    try { if (writer) await writer.close(); } catch (e) { console.warn('Não foi possível fechar o escritor:', e); }
    try { if (writer) writer.releaseLock(); } catch (e) { console.warn('Não foi possível liberar o escritor:', e); }
    try { if (port) await port.close(); } catch (e) { console.warn('Não foi possível fechar a porta:', e); }
  }

  function handleDisconnect(event) {
    if (event?.target && ctl.port && event.target !== ctl.port) return;
    Object.assign(ctl, {
      pendingStart: false, countdownRunning: false, calibrationRequested: false,
      status: 'disconnected', mode: 'none', writer: null, reader: null, port: null, buffer: ''
    });
    ctl.generation++;
    Game.abort();
    setConnectionUI(DISCONNECTED_UI);
    $('#demoBtn').disabled = false;
    hideCalibrationUI();
    toast('Disparador desconectado. Conecte novamente para continuar.');
  }

  // Reconecta sozinho se o navegador já tem permissão para a porta.
  async function autoReconnect() {
    if (!('serial' in navigator)) return;
    navigator.serial.addEventListener('connect', event => {
      if (!ctl.port && ctl.mode === 'none') connect(event.target);
    });
    try {
      const ports = await navigator.serial.getPorts();
      if (ports.length === 1 && !ctl.port && ctl.mode === 'none') connect(ports[0]);
    } catch (_) { /* sem permissão: o usuário usa o botão */ }
  }

  // ------------------------- LEITURA -------------------------
  async function readLoop(port, generation) {
    const valid = () => ctl.port === port && ctl.generation === generation;
    while (valid() && port.readable) {
      let reader = null;
      try {
        reader = port.readable.getReader();
        ctl.reader = reader;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!valid()) break;
          ctl.buffer += decoder.decode(value, { stream: true });
          const lines = ctl.buffer.split(/\r?\n/);
          ctl.buffer = lines.pop() || '';
          for (const line of lines) {
            if (!valid()) break;
            handleLine(line);
          }
        }
      } catch (error) {
        if (ctl.port === port) console.error('Leitura serial interrompida:', error);
      } finally {
        if (reader) { try { reader.releaseLock(); } catch (e) { console.warn('Erro ao liberar leitura serial:', e); } }
        if (ctl.reader === reader) ctl.reader = null;
      }
      if (!valid()) break;
    }
  }

  function interruptMission(message) {
    Object.assign(ctl, { pendingStart: false, countdownRunning: false, calibrationRequested: false });
    Game.abort();
    $('#startBtn').disabled = true;
    $('#startBtn').innerHTML = 'AGUARDANDO CALIBRAÇÃO <span>↗</span>';
    showCalibrationUI();
    updateCalibrationUI();
    toast(message);
  }

  function handleLine(rawLine) {
    const line = rawLine.trim().toUpperCase();
    if (!line) return;

    if (line === 'SHOOT') { Game.shootAtAim({ silent: true }); return; }
    if (line.startsWith('AIM:')) {
      const [x, y] = line.slice(4).split(',').map(Number);
      if (Number.isFinite(x) && Number.isFinite(y)) Game.updateAim(mapHorizontal(x), y);
      return;
    }
    if (line.startsWith('HELLO:')) { ctl.fw = line.slice(6); return; }
    if (line.startsWith('SENS_OK:')) {
      const [pitch, roll] = line.slice(8).split(',').map(Number);
      if (Number.isFinite(pitch) && Number.isFinite(roll)) {
        ctl.sens = { pitch, roll };
        document.dispatchEvent(new CustomEvent('sensitivity', { detail: ctl.sens }));
      }
      return;
    }

    if (line === 'SENSOR_OK' || line === 'CALIBRATION_REQUIRED') {
      if (Game.isRunning()) return;
      ctl.pendingStart = false;
      ctl.calibrationRequested = false;
      ctl.status = 'calibration_required';
      $('#startBtn').disabled = true;
      $('#startBtn').innerHTML = 'CALIBRE O CONTROLE <span>↗</span>';
      showCalibrationUI();
      updateCalibrationUI();
      return;
    }
    if (line === 'CALIBRATING') { ctl.status = 'calibrating'; showCalibrationUI(); updateCalibrationUI(); return; }
    if (line.startsWith('CALIBRATION_ATTEMPT:')) { ctl.attempt = Number(line.split(':')[1]) || 0; updateCalibrationUI(); return; }
    if (line === 'CALIBRATION_RETRY') { ctl.status = 'retry'; updateCalibrationUI(); return; }
    if (line === 'CALIBRATION_OK') { ctl.status = 'calibrated'; updateCalibrationUI(); return; }

    if (['CALIBRATION_ERROR', 'SENSOR_ERROR', 'IMU_READ_ERROR', 'CENTER_ERROR'].includes(line)) {
      if (Game.isRunning()) interruptMission('Falha no sensor. A missão foi interrompida; calibre novamente.');
      ctl.status = 'error';
      ctl.calibrationRequested = false;
      ctl.centerPending = false;
      $('#startBtn').disabled = true;
      $('#startBtn').innerHTML = 'CALIBRAÇÃO NECESSÁRIA <span>↗</span>';
      showCalibrationUI();
      updateCalibrationUI();
      return;
    }
    if (line === 'CENTER_OK') { ctl.centerPending = false; toast('Centro da mira confirmado.'); return; }

    // READY também é a resposta ao STATUS quando o ESP32 já está calibrado.
    if (line === 'READY') {
      ctl.calibrationRequested = false;
      ctl.status = 'ready';
      $('#startBtn').disabled = false;
      $('#startBtn').innerHTML = 'INICIAR MISSÃO <span>↗</span>';
      updateCalibrationUI();
      if (ctl.pendingStart) {
        setTimeout(() => { if (ctl.pendingStart) startCountdown(); }, 500);
      } else {
        hideCalibrationUI();
        toast('Controle calibrado e pronto para uso.');
      }
      return;
    }
    if (line === 'I2C_RECOVERY') {
      interruptMission('Falha de comunicação com o sensor. Aguarde a recuperação...');
      ctl.status = 'waiting';
      updateCalibrationUI();
      return;
    }
    if (line === 'SENSOR_RECOVERED') {
      interruptMission('Sensor recuperado. Posicione o braço e inicie uma nova calibração.');
      ctl.status = 'calibration_required';
      updateCalibrationUI();
    }
  }

  return {
    mode: () => ctl.mode,
    isReady: () => ctl.mode === 'demo' || (ctl.mode === 'hardware' && !!ctl.writer && ctl.status === 'ready'),
    connect, toggleDemo, enterDemo, leaveDemo,
    send, feedback, startCalibration, center, setSensitivity, autoReconnect,
    setHand, setReach, startMeasure, stopMeasure, applyMeasure,
    measure: () => ({ ...measure }),
    mapHorizontal
  };
})();

// Restaura as preferências salvas neste navegador.
ctl.sens = { pitch: store.get('webHeroSens', ctl.sens).pitch || 22, roll: FW_ROLL_RANGE };
ctl.hand = store.get('webHeroHand', 'right') === 'left' ? 'left' : 'right';
ctl.reach = store.get('webHeroReach', DEFAULT_REACH[ctl.hand]);
