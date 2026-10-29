const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

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
  serialBuffer: "",
  shots: 0,
  hits: 0,

  // Posição da mira: valores entre 0 e 1.
  aimX: 0.5,
  aimY: 0.5
};

const levelSettings = {
  1: { interval: 1050, targetLife: 2400, targetCount: 1 },
  2: { interval: 780, targetLife: 1800, targetCount: 2 },
  3: { interval: 560, targetLife: 1450, targetCount: 2 }
};

// =========================
// NAVEGAÇÃO
// =========================

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

  if (id === "rankingView") {
    renderRanking();
  }
}

// =========================
// ESCOLHA DO PERSONAGEM
// =========================

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

// =========================
// BOTÕES
// =========================

$("#startBtn").addEventListener("click", startGame);

// O botão dispara na posição atual da mira.
$("#shootBtn").addEventListener("click", shootAtAim);

$("#connectBtn").addEventListener("click", connectSerial);

$("#clearRankingBtn").addEventListener("click", () => {
  if (confirm("Tem certeza que deseja apagar o ranking salvo neste navegador?")) {
    localStorage.removeItem("webHeroRanking");
    renderRanking();
    toast("Ranking local apagado.");
  }
});

// =========================
// TECLA ESPAÇO
// =========================

document.addEventListener("keydown", event => {
  if (
    event.code === "Space" &&
    state.running &&
    !event.repeat
  ) {
    event.preventDefault();
    shootAtAim();
  }
});

// =========================
// MIRA DO MOUSE
// =========================

$("#arena").addEventListener("pointermove", event => {
  const rect = $("#arena").getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  setAimPosition(
    x / rect.width,
    y / rect.height
  );
});

$("#arena").addEventListener("pointerleave", () => {
  $("#crosshair").style.opacity = 0;
});

// Atualiza a posição da mira.
// Também será usada pelo ESP32.
function setAimPosition(x, y) {
  state.aimX = Math.max(0, Math.min(1, x));
  state.aimY = Math.max(0, Math.min(1, y));

  const arena = $("#arena");
  const crosshair = $("#crosshair");

  if (!arena || !crosshair) return;

  const rect = arena.getBoundingClientRect();

  crosshair.style.left = `${state.aimX * rect.width}px`;
  crosshair.style.top = `${state.aimY * rect.height}px`;
  crosshair.style.opacity = 1;
}

// =========================
// INICIAR A PARTIDA
// =========================

function startGame() {
  const name = $("#playerName")
    .value
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 16);

  if (!name) {
    toast("Digite seu codinome antes de começar.");
    $("#playerName").focus();
    return;
  }

  state.player = name;
  state.score = 0;
  state.level = 1;
  state.time = 30;
  state.shots = 0;
  state.hits = 0;
  state.running = true;

  $("#setupPanel").classList.add("hidden");
  $("#playPanel").classList.remove("hidden");

  $("#hudHero").textContent = state.character.toUpperCase();
  $("#heroAvatar").className = `hero-avatar ${state.characterStyle}`;
  $("#scoreValue").textContent = "0000";
  $("#timeValue").textContent = "30s";
  $("#levelValue").innerHTML = `01 <small>/ 03</small>`;

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

// =========================
// CRONÔMETRO E FASES
// =========================

function tick() {
  if (!state.running) return;

  state.time--;

  $("#timeValue").textContent = `${state.time}s`;

  if (state.time <= 0) {
    endLevel();
  }
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

// =========================
// INIMIGOS
// =========================

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
    gold
      ? "Inimigo procurado especial, vale 50 pontos"
      : "Bandido, vale 10 pontos"
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

    // Mostra a teia no ponto do inimigo.
    drawWeb(target);

    target.classList.add("popped");

    if (target._expiry) {
      clearTimeout(target._expiry);
    }

    setTimeout(() => target.remove(), 180);
  });

  $("#targetLayer").appendChild(target);

  target._expiry = setTimeout(() => {
    target.remove();
  }, settings.targetLife);
}

function addPoints(points) {
  state.score += points;

  $("#scoreValue").textContent =
    String(state.score).padStart(4, "0");
}

// =========================
// DISPARAR NA POSIÇÃO DA MIRA
// =========================

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

  // Procura somente o inimigo que estiver
  // exatamente debaixo da mira.
  const targets = $$(".target");

  const hit = targets.find(target => {
    const r = target.getBoundingClientRect();

    const left = r.left - rect.left;
    const top = r.top - rect.top;
    const right = left + r.width;
    const bottom = top + r.height;

    return (
      x >= left &&
      x <= right &&
      y >= top &&
      y <= bottom
    );
  });

  if (hit) {
    // O clique contabiliza os pontos e desenha
    // a teia usando o evento original do inimigo.
    hit.click();
  } else {
    // Errou: a teia ainda aparece no ponto mirado,
    // mas não ganha pontos.
    drawWebAt(x, y);
  }
}

// =========================
// EFEITO VISUAL DA TEIA
// =========================

// Quando o alvo é atingido, a teia termina nele.
function drawWeb(target) {
  const arenaRect = $("#arena").getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  const x = targetRect.left - arenaRect.left +
    targetRect.width / 2;

  const y = targetRect.top - arenaRect.top +
    targetRect.height / 2;

  drawWebAt(x, y);
}

// Desenha a teia em qualquer ponto da arena,
// mesmo quando o disparo não acerta um inimigo.
function drawWebAt(x2, y2) {
  const arena = $("#arena");
  const a = arena.getBoundingClientRect();

  const svg = $("#webSvg");
  const group = $("#webEffect");
  const line = $("#webLine");

  if (!svg || !group || !line) return;

  // Origem do disparo: região inferior central.
  const x1 = a.width / 2;
  const y1 = a.height - 42;

  svg.setAttribute(
    "viewBox",
    `0 0 ${a.width} ${a.height}`
  );

  group.replaceChildren();

  // Linha principal do disparo.
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  line.setAttribute("stroke-width", "5");
  line.style.opacity = "1";

  line.animate(
    [
      { opacity: 1, strokeWidth: 5 },
      { opacity: 1, strokeWidth: 2 },
      { opacity: 0, strokeWidth: 1 }
    ],
    {
      duration: 560,
      easing: "ease-out"
    }
  );

  // Tamanho da pequena teia no impacto.
  const distance = Math.hypot(x2 - x1, y2 - y1);

  const webLength = Math.min(
    104,
    Math.max(58, distance * 0.34)
  );

  function makeLine(ax, ay, bx, by, cls = "web-strand") {
    const element = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "line"
    );

    element.setAttribute("x1", ax);
    element.setAttribute("y1", ay);
    element.setAttribute("x2", bx);
    element.setAttribute("y2", by);
    element.setAttribute("class", cls);

    group.appendChild(element);

    return element;
  }

  // Fios que partem do ponto atingido pela teia.
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12;

    const endX = x2 + Math.cos(angle) * webLength;
    const endY = y2 + Math.sin(angle) * webLength;

    makeLine(x2, y2, endX, endY, "web-strand");
  }

  // Anéis que formam a rede.
  for (let ring = 1; ring <= 3; ring++) {
    const radius = webLength * ring / 3;

    for (let i = 0; i < 12; i++) {
      const angle1 = (Math.PI * 2 * i) / 12;
      const angle2 = (Math.PI * 2 * (i + 1)) / 12;

      makeLine(
        x2 + Math.cos(angle1) * radius,
        y2 + Math.sin(angle1) * radius,
        x2 + Math.cos(angle2) * radius,
        y2 + Math.sin(angle2) * radius,
        "web-ring"
      );
    }
  }

  // Anima cada fio da teia.
  group.querySelectorAll("line").forEach((element, i) => {
    element.style.opacity = "0";

    element.animate(
      [
        { opacity: 0, strokeWidth: 1 },
        { opacity: 1, strokeWidth: 2.6, offset: 0.22 },
        { opacity: 1, strokeWidth: 1.5, offset: 0.62 },
        { opacity: 0, strokeWidth: 0.5 }
      ],
      {
        duration: 680,
        delay: Math.min(i * 4, 100),
        easing: "ease-out"
      }
    );
  });

  // Efeito circular no ponto do impacto.
  const impact = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );

  impact.setAttribute("cx", x2);
  impact.setAttribute("cy", y2);
  impact.setAttribute("r", 4);
  impact.setAttribute("class", "web-impact");

  group.appendChild(impact);

  impact.animate(
    [
      { r: 3, opacity: 1 },
      { r: webLength * 0.8, opacity: 0.75, offset: 0.35 },
      { r: webLength, opacity: 0 }
    ],
    {
      duration: 520,
      easing: "ease-out"
    }
  );

  setTimeout(() => {
    line.style.opacity = "0";
    group.replaceChildren();
  }, 720);
}

// Mantida para compatibilidade com o código anterior.
function drawMiss() {
  const arena = $("#arena");

  if (!arena) return;

  const rect = arena.getBoundingClientRect();

  drawWebAt(
    rect.width / 2 + (Math.random() * 220 - 110),
    rect.height / 2
  );
}

// =========================
// LIMPAR ALVOS
// =========================

function clearTargets() {
  $$(".target").forEach(target => {
    if (target._expiry) {
      clearTimeout(target._expiry);
    }

    target.remove();
  });
}

// =========================
// RANKING
// =========================

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

  if (!container) return;

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
          ${escapeHTML(entry.character)} · FASE ${entry.level} ·
          ${escapeHTML(entry.date)}
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
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]
  );
}

// =========================
// MENSAGENS NA TELA
// =========================

let toastTimeout;

function toast(message) {
  const element = $("#toast");

  if (!element) return;

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    element.classList.remove("show");
  }, 2600);
}

// =========================
// CONEXÃO SERIAL COM ESP32
// =========================

async function connectSerial() {
  if (!("serial" in navigator)) {
    toast("Web Serial não disponível. Use Chrome ou Edge atualizado.");
    return;
  }

  try {
    state.port = await navigator.serial.requestPort();

    await state.port.open({
      baudRate: 115200
    });

    $("#connectionDot").classList.add("connected");
    $("#connectionText").textContent = "DISPARADOR CONECTADO";
    $("#connectBtn").textContent = "DISPARADOR CONECTADO";

    toast("Controle conectado! Movimente a mira e dispare.");

    readSerial();
  } catch (error) {
    toast("Não foi possível conectar. Confira a placa e a permissão USB.");
    console.error(error);
  }
}

// Lê AIM:x,y e SHOOT enviados pelo ESP32.
async function readSerial() {
  while (state.port && state.port.readable) {
    state.reader = state.port.readable.getReader();

    try {
      while (true) {
        const { value, done } = await state.reader.read();

        if (done) break;

        state.serialBuffer += new TextDecoder().decode(value);

        const lines = state.serialBuffer.split(/\r?\n/);

        state.serialBuffer = lines.pop() || "";

        for (const rawLine of lines) {
          const line = rawLine.trim();

          if (!line) continue;

          // Exemplo: AIM:500,350
          const aimMatch = line.match(
            /^AIM\s*:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i
          );

          if (aimMatch) {
            const rawX = Number(aimMatch[1]);
            const rawY = Number(aimMatch[2]);

            // O ESP32 envia coordenadas de 0 a 1000.
            setAimPosition(
              rawX / 1000,
              rawY / 1000
            );

            continue;
          }

          // Disparo na posição atual do controle.
          if (line.toUpperCase() === "SHOOT") {
            shootAtAim();
          }
        }
      }
    } catch (error) {
      console.error("Leitura serial interrompida", error);
    } finally {
      state.reader.releaseLock();
    }
  }
}

renderRanking();