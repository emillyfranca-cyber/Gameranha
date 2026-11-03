const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  character: "Peter Parker",
  characterStyle: "red",
  player: "",
  score: 0,
  level: 1,
  time: 30,
  running: false,
  targetTimer: null,
  clockTimer: null,

  port: null,
  reader: null,
  writer: null,
  serialBuffer: "",

  shots: 0,
  hits: 0,
  aimX: 0.5,
  aimY: 0.5,

  calibrationStatus: "disconnected",
  calibrationAttempt: 0,
  pendingStart: false,
  countdownRunning: false,
  centerPending: false
};

const levelSettings = {
  1: { interval: 1050, targetLife: 2400, targetCount: 1 },
  2: { interval: 780, targetLife: 1800, targetCount: 2 },
  3: { interval: 560, targetLife: 1450, targetCount: 2 }
};

// ============================================================
// TELA DE CALIBRAÇÃO
// ============================================================

function installCalibrationUI() {

  const style = document.createElement("style");

  style.textContent = `
    #calibrationOverlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(5, 10, 22, .94);
      backdrop-filter: blur(12px);
      color: #fff;
      font-family: inherit;
    }

    #calibrationOverlay.visible {
      display: flex;
    }

    .calibration-card {
      width: min(650px, 100%);
      padding: clamp(24px, 5vw, 42px);
      border: 1px solid rgba(141,226,255,.25);
      border-radius: 24px;
      background: linear-gradient(145deg,#17243b,#0b1221);
      box-shadow: 0 25px 90px rgba(0,0,0,.5);
      text-align: center;
    }

    .calibration-eyebrow {
      color: #8de2ff;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 3px;
      text-transform: uppercase;
    }

    .calibration-title {
      margin: 12px 0;
      font-size: clamp(26px,5vw,38px);
      font-weight: 900;
    }

    .calibration-description {
      color: #b8c6d9;
      line-height: 1.7;
      font-size: 15px;
    }

    .calibration-illustration {
      margin: 25px auto;
      width: 170px;
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 24px;
      background: rgba(141,226,255,.08);
      border: 1px solid rgba(141,226,255,.18);
    }

    .calibration-illustration span {
      font-size: 76px;
      animation: calibrationPulse 2s ease-in-out infinite;
    }

    @keyframes calibrationPulse {
      0%,100% { transform: translateY(0) rotate(-5deg); }
      50% { transform: translateY(-7px) rotate(5deg); }
    }

    .calibration-steps {
      display: grid;
      gap: 10px;
      margin: 25px 0;
      text-align: left;
    }

    .calibration-step {
      display: flex;
      align-items: center;
      gap: 13px;
      padding: 13px;
      border-radius: 12px;
      background: rgba(255,255,255,.045);
      color: #dbe7f5;
      font-size: 14px;
      line-height: 1.5;
    }

    .calibration-step-number {
      display: grid;
      place-items: center;
      flex: 0 0 30px;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: rgba(141,226,255,.15);
      color: #8de2ff;
      font-weight: 900;
    }

    .calibration-status {
      margin: 20px 0 12px;
      color: #8de2ff;
      font-size: 15px;
      font-weight: 800;
    }

    .calibration-progress {
      height: 8px;
      overflow: hidden;
      border-radius: 10px;
      background: rgba(255,255,255,.1);
    }

    .calibration-progress-bar {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg,#45b9ff,#8de2ff);
      transition: width .4s ease;
    }

    .calibration-tip {
      margin-top: 17px;
      color: #9aaec5;
      font-size: 12px;
      line-height: 1.6;
    }

    .calibration-actions {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 23px;
    }

    .calibration-action {
      border: 0;
      border-radius: 12px;
      padding: 13px 22px;
      font-weight: 900;
      cursor: pointer;
    }

    .calibration-primary {
      color: #071321;
      background: #8de2ff;
    }

    .calibration-secondary {
      color: #dbe7f5;
      background: rgba(255,255,255,.1);
    }

    .calibration-countdown {
      margin: 20px 0;
      font-size: clamp(60px,15vw,100px);
      font-weight: 900;
      color: #8de2ff;
      text-shadow: 0 0 35px rgba(141,226,255,.4);
    }

    .calibration-error {
      color: #ff9a9a;
    }

    @media(max-width:480px) {
      .calibration-card { padding: 22px 17px; }
      .calibration-illustration { width: 125px; height: 115px; }
      .calibration-illustration span { font-size: 58px; }
    }
  `;

  document.head.appendChild(style);

  const overlay = document.createElement("div");

  overlay.id = "calibrationOverlay";

  overlay.innerHTML = `
    <div class="calibration-card">

      <div class="calibration-eyebrow">
        WEB HERO · PREPARAÇÃO
      </div>

      <h2 class="calibration-title">
        Prepare seu disparador
      </h2>

      <p class="calibration-description" id="calibrationDescription">
        Antes da missão, precisamos calibrar o sensor para que
        a mira acompanhe corretamente os movimentos do seu pulso.
      </p>

      <div class="calibration-illustration">
        <span id="calibrationIcon">⌚</span>
      </div>

      <div class="calibration-steps">
        <div class="calibration-step">
          <span class="calibration-step-number">1</span>
          <span>Posicione o controle no pulso, na posição habitual de uso.</span>
        </div>

        <div class="calibration-step">
          <span class="calibration-step-number">2</span>
          <span>Deixe o braço parado e confortável, na posição central da mira.</span>
        </div>

        <div class="calibration-step">
          <span class="calibration-step-number">3</span>
          <span>Não movimente o sensor enquanto a calibração estiver acontecendo.</span>
        </div>
      </div>

      <div class="calibration-status" id="calibrationStatusText">
        Aguardando controle...
      </div>

      <div class="calibration-progress">
        <div
          class="calibration-progress-bar"
          id="calibrationProgressBar"
        ></div>
      </div>

      <p class="calibration-tip" id="calibrationTip">
        Dica: mantenha o pulso relaxado. A calibração pode ser
        repetida se o sensor detectar movimento.
      </p>

      <div id="calibrationCountdown" class="calibration-countdown"
           style="display:none"></div>

      <div class="calibration-actions">
        <button
          id="calibrationRetry"
          class="calibration-action calibration-primary"
          style="display:none"
        >
          TENTAR NOVAMENTE
        </button>

        <button
          id="calibrationCancel"
          class="calibration-action calibration-secondary"
        >
          VOLTAR
        </button>
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  $("#calibrationCancel").addEventListener("click", () => {
    state.pendingStart = false;
    state.countdownRunning = false;
    hideCalibrationUI();
  });

  $("#calibrationRetry").addEventListener("click", async () => {

    if (!state.writer) {
      toast("Conecte o controle antes de calibrar.");
      return;
    }

    state.calibrationStatus = "calibrating";

    showCalibrationUI();
    updateCalibrationUI();

    await sendSerialCommand("CALIBRATE\n");
  });
}

function showCalibrationUI() {
  $("#calibrationOverlay").classList.add("visible");
}

function hideCalibrationUI() {
  $("#calibrationOverlay").classList.remove("visible");
}

function updateCalibrationUI() {

  const status = state.calibrationStatus;
  const text = $("#calibrationStatusText");
  const description = $("#calibrationDescription");
  const icon = $("#calibrationIcon");
  const progress = $("#calibrationProgressBar");
  const retry = $("#calibrationRetry");
  const countdown = $("#calibrationCountdown");

  retry.style.display = "none";
  countdown.style.display = "none";

  if (status === "waiting") {

    text.textContent = "Aguardando resposta do controle...";
    icon.textContent = "⌚";
    progress.style.width = "10%";

  } else if (status === "calibrating") {

    text.textContent = "Calibrando sensor. Não movimente o pulso!";
    description.textContent =
      "Estamos medindo o comportamento do giroscópio e verificando se o sensor está estável.";

    icon.textContent = "🎯";
    progress.style.width = "55%";

  } else if (status === "retry") {

    text.textContent = "Movimento detectado. Vamos tentar novamente.";
    description.textContent =
      "O sensor percebeu movimento durante a calibração. Relaxe o braço e mantenha o controle imóvel.";

    icon.textContent = "✋";
    progress.style.width = "25%";

  } else if (status === "calibrated") {

    text.textContent = "Calibração concluída!";
    description.textContent =
      "Ótimo! O sensor foi calibrado. Prepare-se para a missão.";

    icon.textContent = "✓";
    progress.style.width = "100%";

  } else if (status === "ready") {

    text.textContent = "Controle pronto!";
    description.textContent =
      "A calibração terminou. A missão começará em instantes.";

    icon.textContent = "🕷️";
    progress.style.width = "100%";

  } else if (status === "error") {

    text.textContent = "Não foi possível calibrar o sensor.";
    text.classList.add("calibration-error");

    description.textContent =
      "Verifique se o controle está conectado e se o sensor está imóvel. Você pode tentar novamente.";

    icon.textContent = "⚠️";
    progress.style.width = "0%";
    retry.style.display = "inline-block";
  }
}

// ============================================================
// CONTAGEM REGRESSIVA
// ============================================================

async function startCountdown() {

  if (state.countdownRunning || !state.pendingStart) return;

  state.countdownRunning = true;

  const text = $("#calibrationStatusText");
  const description = $("#calibrationDescription");
  const countdown = $("#calibrationCountdown");

  $("#calibrationIcon").textContent = "🚀";

  description.textContent =
    "Posicione sua mira. A missão está prestes a começar!";

  countdown.style.display = "block";

  for (let i = 5; i >= 1; i--) {

    if (!state.pendingStart) {
      state.countdownRunning = false;
      return;
    }

    countdown.textContent = i;
    text.textContent = "Prepare-se!";

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!state.pendingStart) {
    state.countdownRunning = false;
    return;
  }

  countdown.textContent = "VAI!";

  await new Promise(resolve => setTimeout(resolve, 450));

  state.pendingStart = false;
  state.countdownRunning = false;

  hideCalibrationUI();

  beginGame();
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

$$(".tab").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.view));
});

function showView(id) {

  $$(".tab").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === id);
  });

  $$(".view").forEach(view => {
    view.classList.toggle("active-view", view.id === id);
  });

  if (id === "rankingView") renderRanking();
}

// ============================================================
// PERSONAGEM
// ============================================================

$$(".character-card").forEach(card => {

  card.addEventListener("click", () => {

    $$(".character-card").forEach(c => {
      c.classList.remove("selected");
    });

    card.classList.add("selected");

    state.character = card.dataset.character;
    state.characterStyle = card.dataset.color;
  });
});

// ============================================================
// EVENTOS
// ============================================================

$("#startBtn").addEventListener("click", startGame);

$("#shootBtn").addEventListener("click", shootAtAim);

$("#connectBtn").addEventListener("click", connectSerial);

$("#clearRankingBtn").addEventListener("click", () => {

  if (confirm("Tem certeza que deseja apagar o ranking salvo neste navegador?")) {

    localStorage.removeItem("webHeroRanking");

    renderRanking();

    toast("Ranking local apagado.");
  }
});

document.addEventListener("keydown", event => {

  if (event.code === "Space" && state.running) {
    event.preventDefault();
    shootAtAim();
  }

  const typing =
    event.target &&
    (
      event.target.matches("input, textarea, select") ||
      event.target.isContentEditable
    );

  if (
    !typing &&
    event.key.toLowerCase() === "c" &&
    state.writer
  ) {

    event.preventDefault();

    state.centerPending = true;

    sendSerialCommand("CENTER\n").then(success => {
      if (success) toast("Solicitando centralização da mira...");
    });
  }
});

// ============================================================
// INÍCIO DO JOGO
// ============================================================

function startGame() {

  const name = $("#playerName").value
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 16);

  if (!name) {
    toast("Digite seu codinome antes de começar.");
    $("#playerName").focus();
    return;
  }

  state.player = name;

  // Sem controle físico: mantém o jogo por mouse.
  if (!state.writer) {
    beginGame();
    return;
  }

  state.pendingStart = true;

  showCalibrationUI();

  if (state.calibrationStatus === "ready") {

    updateCalibrationUI();
    startCountdown();

  } else if (state.calibrationStatus === "error") {

    updateCalibrationUI();

  } else {

    state.calibrationStatus = "waiting";
    updateCalibrationUI();

    sendSerialCommand("STATUS\n");
  }
}

function beginGame() {

  state.score = 0;
  state.level = 1;
  state.time = 30;
  state.shots = 0;
  state.hits = 0;
  state.running = true;

  $("#setupPanel").classList.add("hidden");
  $("#playPanel").classList.remove("hidden");

  $("#hudHero").textContent =
    state.character.toUpperCase();

  $("#heroAvatar").className =
    `hero-avatar ${state.characterStyle}`;

  $("#scoreValue").textContent = "0000";

  $("#arenaMessage").classList.remove("hidden-message");
  $("#arenaMessage").textContent = "3... 2... 1... VAI!";

  clearInterval(state.targetTimer);
  clearInterval(state.clockTimer);

  clearTargets();

  setTimeout(() => {

    if (!state.running) return;

    $("#arenaMessage").classList.add("hidden-message");

    spawnTargets();

    state.targetTimer = setInterval(
      spawnTargets,
      levelSettings[state.level].interval
    );

    state.clockTimer = setInterval(tick, 1000);

  }, 1200);
}

// ============================================================
// TEMPO E FASES
// ============================================================

function tick() {

  if (!state.running) return;

  state.time--;

  $("#timeValue").textContent = `${state.time}s`;

  if (state.time <= 0) endLevel();
}

function endLevel() {

  clearInterval(state.targetTimer);
  clearTargets();

  if (state.level < 3) {

    state.level++;
    state.time = 30;

    $("#levelValue").innerHTML =
      `0${state.level} <small>/ 03</small>`;

    $("#timeValue").textContent = "30s";

    $("#arenaMessage").classList.remove("hidden-message");

    $("#arenaMessage").textContent =
      `FASE ${state.level - 1} CONCLUÍDA! PREPARE-SE...`;

    setTimeout(() => {

      if (!state.running) return;

      $("#arenaMessage").classList.add("hidden-message");

      state.targetTimer = setInterval(
        spawnTargets,
        levelSettings[state.level].interval
      );

      spawnTargets();

    }, 1400);

  } else {

    finishGame();
  }
}

function finishGame() {

  state.running = false;

  clearInterval(state.targetTimer);
  clearInterval(state.clockTimer);

  clearTargets();
  saveScore();

  $("#arenaMessage").classList.remove("hidden-message");

  $("#arenaMessage").innerHTML = `
    MISSÃO CONCLUÍDA
    <br>
    <span style="font-size:18px;color:#8de2ff">
      ${state.score} PONTOS
    </span>
    <br>
    <button id="againBtn" class="primary-btn" style="margin-top:16px">
      JOGAR NOVAMENTE
    </button>
  `;

  $("#againBtn").addEventListener("click", resetGame);

  toast("Resultado salvo no ranking deste computador!");
}

function resetGame() {

  $("#playPanel").classList.add("hidden");
  $("#setupPanel").classList.remove("hidden");

  $("#arenaMessage").classList.remove("hidden-message");
  $("#arenaMessage").textContent = "PREPARE-SE...";
}

// ============================================================
// ALVOS
// ============================================================

function spawnTargets() {

  if (!state.running) return;

  const settings = levelSettings[state.level];
  const current = $$(".target").length;

  for (let i = current; i < settings.targetCount; i++) {
    createTarget(settings);
  }
}

function createTarget(settings) {

  const arena = $("#arena");
  const target = document.createElement("button");

  const gold = Math.random() < 0.2;

  target.className = `target${gold ? " gold" : ""}`;
  target.type = "button";

  target.setAttribute(
    "aria-label",
    gold ? "Inimigo especial, vale 50 pontos" : "Bandido, vale 10 pontos"
  );

  target.innerHTML = `
    <span class="villain-shadow">
      <i class="villain-hood"></i>
      <i class="villain-face"></i>
      <i class="villain-body"></i>
      <i class="villain-arm left"></i>
      <i class="villain-arm right"></i>
    </span>
    <span class="wanted-tag">PROCURADO</span>
  `;

  const maxX = Math.max(70, arena.clientWidth - 75);
  const maxY = Math.max(150, arena.clientHeight - 120);

  target.style.left =
    `${45 + Math.random() * (maxX - 45)}px`;

  target.style.top =
    `${95 + Math.random() * (maxY - 95)}px`;

  target.addEventListener("click", event => {

    event.stopPropagation();

    if (!state.running) return;

    state.hits++;

    addPoints(gold ? 50 : 10);

    drawWeb(target);

    target.classList.add("popped");

    setTimeout(() => target.remove(), 180);
  });

  $("#targetLayer").appendChild(target);

  target._expiry = setTimeout(
    () => target.remove(),
    settings.targetLife
  );
}

function addPoints(points) {

  state.score += points;

  $("#scoreValue").textContent =
    String(state.score).padStart(4, "0");
}

// ============================================================
// MIRA
// ============================================================

function updateAim(x, y) {

  state.aimX = Math.max(0, Math.min(1, x / 1000));
  state.aimY = Math.max(0, Math.min(1, y / 1000));

  const arena = $("#arena");

  $("#crosshair").style.left =
    `${state.aimX * arena.clientWidth}px`;

  $("#crosshair").style.top =
    `${state.aimY * arena.clientHeight}px`;

  $("#crosshair").style.opacity = 1;
}

$("#arena").addEventListener("pointermove", event => {

  const rect = $("#arena").getBoundingClientRect();

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  state.aimX = Math.max(0, Math.min(1, x / rect.width));
  state.aimY = Math.max(0, Math.min(1, y / rect.height));

  $("#crosshair").style.left = `${x}px`;
  $("#crosshair").style.top = `${y}px`;
  $("#crosshair").style.opacity = 1;
});

$("#arena").addEventListener("pointerleave", () => {
  $("#crosshair").style.opacity = 0;
});

// ============================================================
// DISPARO
// ============================================================

function shootAtAim() {

  if (!state.running) {
    toast("Inicie uma missão antes de disparar.");
    return;
  }

  state.shots++;

  const arena = $("#arena");
  const rect = arena.getBoundingClientRect();

  const x = state.aimX * rect.width;
  const y = state.aimY * rect.height;

  const hit = $$(".target").find(target => {

    const r = target.getBoundingClientRect();

    const left = r.left - rect.left;
    const top = r.top - rect.top;

    return (
      x >= left &&
      x <= left + r.width &&
      y >= top &&
      y <= top + r.height
    );
  });

  if (hit) {
    hit.click();
  } else {
    drawMissAt(x, y);
    drawWebAt(x, y);
  }
}

// ============================================================
// EFEITOS VISUAIS
// ============================================================

function addSvgLine(group, x1, y1, x2, y2, cls) {

  const line = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "line"
  );

  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("class", cls);

  group.appendChild(line);

  return line;
}

function drawWebAt(x, y, radius = 54) {

  const arena = $("#arena");
  const rect = arena.getBoundingClientRect();

  const svg = $("#webSvg");
  const group = $("#webEffect");

  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

  group.replaceChildren();

  for (let i = 0; i < 12; i++) {

    const angle = 2 * Math.PI * i / 12;

    addSvgLine(
      group,
      x,
      y,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      "web-strand"
    );
  }

  for (let ring = 1; ring <= 3; ring++) {

    const r = radius * ring / 3;

    for (let i = 0; i < 12; i++) {

      const a1 = 2 * Math.PI * i / 12;
      const a2 = 2 * Math.PI * (i + 1) / 12;

      addSvgLine(
        group,
        x + Math.cos(a1) * r,
        y + Math.sin(a1) * r,
        x + Math.cos(a2) * r,
        y + Math.sin(a2) * r,
        "web-ring"
      );
    }
  }

  group.querySelectorAll("line").forEach((line, i) => {

    line.animate(
      [
        { opacity: 0, strokeWidth: 1 },
        { opacity: 1, strokeWidth: 2.6, offset: 0.25 },
        { opacity: 0, strokeWidth: 0.5 }
      ],
      {
        duration: 650,
        delay: Math.min(i * 4, 100),
        easing: "ease-out"
      }
    );
  });

  const impact = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );

  impact.setAttribute("cx", x);
  impact.setAttribute("cy", y);
  impact.setAttribute("r", 4);
  impact.setAttribute("class", "web-impact");

  group.appendChild(impact);

  impact.animate(
    [
      { r: 3, opacity: 1 },
      { r: radius, opacity: 0 }
    ],
    { duration: 520, easing: "ease-out" }
  );

  setTimeout(() => group.replaceChildren(), 700);
}

function drawWeb(target) {

  const arena = $("#arena");
  const a = arena.getBoundingClientRect();
  const t = target.getBoundingClientRect();

  const line = $("#webLine");
  const svg = $("#webSvg");

  const x = t.left - a.left + t.width / 2;
  const y = t.top - a.top + t.height / 2;

  svg.setAttribute("viewBox", `0 0 ${a.width} ${a.height}`);

  line.setAttribute("x1", a.width / 2);
  line.setAttribute("y1", a.height - 42);
  line.setAttribute("x2", x);
  line.setAttribute("y2", y);

  line.style.opacity = "1";

  line.animate(
    [
      { opacity: 1, strokeWidth: 5 },
      { opacity: 1, strokeWidth: 2 },
      { opacity: 0, strokeWidth: 1 }
    ],
    { duration: 560, easing: "ease-out" }
  );

  drawWebAt(x, y, 75);

  setTimeout(() => {
    line.style.opacity = "0";
  }, 720);
}

function drawMissAt(x, y) {

  const a = $("#arena").getBoundingClientRect();
  const svg = $("#webSvg");
  const line = $("#webLine");

  svg.setAttribute("viewBox", `0 0 ${a.width} ${a.height}`);

  line.setAttribute("x1", a.width / 2);
  line.setAttribute("y1", a.height - 42);
  line.setAttribute("x2", x);
  line.setAttribute("y2", y);

  line.style.opacity = "1";

  line.animate(
    [
      { opacity: 1, strokeWidth: 5 },
      { opacity: 0, strokeWidth: 1 }
    ],
    { duration: 360 }
  );

  setTimeout(() => {
    line.style.opacity = "0";
  }, 380);
}

// ============================================================
// LIMPEZA DE ALVOS
// ============================================================

function clearTargets() {

  $$(".target").forEach(target => {

    if (target._expiry) {
      clearTimeout(target._expiry);
    }

    target.remove();
  });
}

// ============================================================
// RANKING
// ============================================================

function saveScore() {

  const scores = JSON.parse(
    localStorage.getItem("webHeroRanking") || "[]"
  );

  scores.push({
    name: state.player,
    character: state.character,
    score: state.score,
    level: 3,
    date: new Date().toLocaleDateString("pt-BR")
  });

  scores.sort((a, b) => b.score - a.score);

  localStorage.setItem(
    "webHeroRanking",
    JSON.stringify(scores.slice(0, 20))
  );
}

function renderRanking() {

  const list = JSON.parse(
    localStorage.getItem("webHeroRanking") || "[]"
  );

  const container = $("#rankingList");

  if (!list.length) {

    container.innerHTML = `
      <div class="empty-ranking">
        ✦<br><br>
        Nenhum herói no placar ainda.<br>
        Jogue a primeira missão para inaugurar o ranking!
      </div>
    `;

    return;
  }

  container.innerHTML = list.map((entry, i) => `
    <div class="ranking-row">
      <span class="rank-number ${i < 3 ? "top" : ""}">
        ${String(i + 1).padStart(2, "0")}
      </span>

      <div>
        <div class="rank-player">
          ${escapeHTML(entry.name)}
        </div>

        <div class="rank-meta">
          ${escapeHTML(entry.character)}
          · FASE ${entry.level}
          · ${escapeHTML(entry.date)}
        </div>
      </div>

      <strong class="rank-score">
        ${entry.score.toLocaleString("pt-BR")}
      </strong>
    </div>
  `).join("");
}

function escapeHTML(value) {

  return String(value).replace(
    /[&<>"']/g,
    c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[c]
  );
}

// ============================================================
// TOAST
// ============================================================

let toastTimeout;

function toast(message) {

  const el = $("#toast");

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    el.classList.remove("show");
  }, 2600);
}

// ============================================================
// CONEXÃO SERIAL
// ============================================================

async function connectSerial() {

  if (!("serial" in navigator)) {
    toast("Web Serial não disponível. Use Chrome ou Edge atualizado.");
    return;
  }

  try {

    state.port = await navigator.serial.requestPort();

    await state.port.open({ baudRate: 115200 });

    if (state.port.writable) {
      state.writer = state.port.writable.getWriter();
    }

    $("#connectionDot").classList.add("connected");
    $("#connectionText").textContent = "DISPARADOR CONECTADO";
    $("#connectBtn").textContent = "DISPARADOR CONECTADO";

    state.calibrationStatus = "waiting";

    toast("Controle conectado. Consultando o sensor...");

    readSerial();

    // Consulta o estado atual. Não depende de mensagens enviadas
    // antes de o navegador abrir a conexão serial.
    await new Promise(resolve => setTimeout(resolve, 300));

    await sendSerialCommand("STATUS\n");

  } catch (error) {

    console.error(error);

    toast("Não foi possível conectar. Confira a placa e a permissão USB.");
  }
}

async function sendSerialCommand(command) {

  if (!state.writer) {
    toast("Conecte o controle antes de enviar o comando.");
    return false;
  }

  try {

    await state.writer.write(
      new TextEncoder().encode(command)
    );

    return true;

  } catch (error) {

    console.error("Erro ao enviar comando serial:", error);

    toast("Falha na comunicação com o controle.");

    return false;
  }
}

// ============================================================
// INTERPRETAÇÃO DAS MENSAGENS
// ============================================================

function handleSerialLine(rawLine) {

  const line = rawLine.trim().toUpperCase();

  if (!line) return;

  if (line === "SHOOT") {
    shootAtAim();
    return;
  }

  if (line.startsWith("AIM:")) {

    const parts = line.slice(4).split(",");

    if (parts.length === 2) {

      const x = Number(parts[0]);
      const y = Number(parts[1]);

      if (Number.isFinite(x) && Number.isFinite(y)) {
        updateAim(x, y);
      }
    }

    return;
  }

  if (line === "CALIBRATING") {

    state.calibrationStatus = "calibrating";

    updateCalibrationUI();

    return;
  }

  if (line.startsWith("CALIBRATION_ATTEMPT:")) {

    state.calibrationAttempt =
      Number(line.split(":")[1]) || 0;

    return;
  }

  if (line === "CALIBRATION_RETRY") {

    state.calibrationStatus = "retry";

    updateCalibrationUI();

    return;
  }

  if (line === "CALIBRATION_OK") {

    state.calibrationStatus = "calibrated";

    updateCalibrationUI();

    return;
  }

  if (
    line === "CALIBRATION_ERROR" ||
    line === "SENSOR_ERROR" ||
    line === "IMU_READ_ERROR" ||
    line === "CENTER_ERROR"
  ) {

    state.calibrationStatus = "error";
    state.centerPending = false;

    updateCalibrationUI();

    if (state.pendingStart) {
      showCalibrationUI();
    }

    return;
  }

  if (line === "CENTER_OK") {

    state.centerPending = false;

    toast("Centro da mira confirmado.");

    return;
  }

  if (line === "READY") {

    state.calibrationStatus = "ready";

    if (state.pendingStart) {

      updateCalibrationUI();

      setTimeout(() => {
        if (state.pendingStart) startCountdown();
      }, 700);

    } else {

      toast("Controle calibrado e pronto para uso.");
    }

    return;
  }

  if (line === "SENSOR_RECOVERED") {

    toast("Comunicação com o sensor restabelecida.");

    sendSerialCommand("STATUS\n");

    return;
  }

  if (line === "I2C_RECOVERY") {

    toast("Restabelecendo comunicação com o sensor...");

    return;
  }
}

// ============================================================
// LEITURA SERIAL
// ============================================================

async function readSerial() {

  while (state.port && state.port.readable) {

    state.reader = state.port.readable.getReader();

    try {

      while (true) {

        const { value, done } = await state.reader.read();

        if (done) break;

        state.serialBuffer +=
          new TextDecoder().decode(value);

        const lines = state.serialBuffer.split(/\r?\n/);

        state.serialBuffer = lines.pop() || "";

        for (const line of lines) {
          handleSerialLine(line);
        }
      }

    } catch (error) {

      console.error("Leitura serial interrompida:", error);

    } finally {

      state.reader.releaseLock();
    }
  }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

installCalibrationUI();
renderRanking();