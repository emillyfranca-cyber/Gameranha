const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  character: "Peter Parker", characterStyle: "red", player: "", score: 0,
  level: 1, time: 30, running: false, targetTimer: null, clockTimer: null,
  port: null, reader: null, serialBuffer: "", shots: 0, hits: 0
};
const levelSettings = {
  1: { interval: 1050, targetLife: 2400, targetCount: 1 },
  2: { interval: 780, targetLife: 1800, targetCount: 2 },
  3: { interval: 560, targetLife: 1450, targetCount: 2 }
};

$$(".tab").forEach(btn => btn.addEventListener("click", () => showView(btn.dataset.view)));
function showView(id) {
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === id));
  $$(".view").forEach(v => v.classList.toggle("active-view", v.id === id));
  if (id === "rankingView") renderRanking();
}
$$(".character-card").forEach(card => card.addEventListener("click", () => {
  $$(".character-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  state.character = card.dataset.character;
  state.characterStyle = card.dataset.color;
}));

$("#startBtn").addEventListener("click", startGame);
$("#shootBtn").addEventListener("click", () => shootAt(null));
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
    shootAt(null);
  }
});
$("#arena").addEventListener("pointermove", event => {
  const rect = $("#arena").getBoundingClientRect();
  $("#crosshair").style.left = `${event.clientX - rect.left}px`;
  $("#crosshair").style.top = `${event.clientY - rect.top}px`;
  $("#crosshair").style.opacity = 1;
});
$("#arena").addEventListener("pointerleave", () => $("#crosshair").style.opacity = 0);

function startGame() {
  const name = $("#playerName").value.trim().replace(/[<>]/g, "").slice(0, 16);
  if (!name) { toast("Digite seu codinome antes de começar."); $("#playerName").focus(); return; }
  state.player = name;
  state.score = 0; state.level = 1; state.time = 30; state.shots = 0; state.hits = 0;
  state.running = true;
  $("#setupPanel").classList.add("hidden");
  $("#playPanel").classList.remove("hidden");
  $("#hudHero").textContent = state.character.toUpperCase();
  $("#heroAvatar").className = `hero-avatar ${state.characterStyle}`;
  $("#scoreValue").textContent = "0000";
  $("#arenaMessage").classList.remove("hidden-message");
  $("#arenaMessage").textContent = "3... 2... 1... VAI!";
  clearInterval(state.targetTimer); clearInterval(state.clockTimer);
  clearTargets();
  setTimeout(() => {
    if (!state.running) return;
    $("#arenaMessage").classList.add("hidden-message");
    spawnTargets();
    state.targetTimer = setInterval(spawnTargets, levelSettings[state.level].interval);
    state.clockTimer = setInterval(tick, 1000);
  }, 1200);
}
function tick() {
  if (!state.running) return;
  state.time--;
  $("#timeValue").textContent = `${state.time}s`;
  if (state.time <= 0) endLevel();
}
function endLevel() {
  clearInterval(state.targetTimer); clearTargets();
  if (state.level < 3) {
    state.level++;
    state.time = 30;
    $("#levelValue").innerHTML = `0${state.level} <small>/ 03</small>`;
    $("#timeValue").textContent = "30s";
    $("#arenaMessage").classList.remove("hidden-message");
    $("#arenaMessage").textContent = `FASE ${state.level - 1} CONCLUÍDA! PREPARE-SE...`;
    setTimeout(() => {
      if (!state.running) return;
      $("#arenaMessage").classList.add("hidden-message");
      state.targetTimer = setInterval(spawnTargets, levelSettings[state.level].interval);
      spawnTargets();
    }, 1400);
  } else {
    finishGame();
  }
}
function finishGame() {
  state.running = false;
  clearInterval(state.targetTimer); clearInterval(state.clockTimer); clearTargets();
  saveScore();
  $("#arenaMessage").classList.remove("hidden-message");
  $("#arenaMessage").innerHTML = `MISSÃO CONCLUÍDA<br><span style="font-size:18px;color:#8de2ff">${state.score} PONTOS</span><br><button id="againBtn" class="primary-btn" style="margin-top:16px">JOGAR NOVAMENTE</button>`;
  $("#againBtn").addEventListener("click", resetGame);
  toast("Resultado salvo no ranking deste computador!");
}
function resetGame() {
  $("#playPanel").classList.add("hidden");
  $("#setupPanel").classList.remove("hidden");
  $("#arenaMessage").classList.remove("hidden-message");
  $("#arenaMessage").textContent = "PREPARE-SE...";
}
function spawnTargets() {
  if (!state.running) return;
  const settings = levelSettings[state.level];
  const current = $$(".target").length;
  for (let i = current; i < settings.targetCount; i++) createTarget(settings);
}
function createTarget(settings) {
  const arena = $("#arena");
  const target = document.createElement("button");
  const gold = Math.random() < 0.2;
  target.className = `target${gold ? " gold" : ""}`;
  target.type = "button";
  target.setAttribute("aria-label", gold ? "Inimigo procurado especial, vale 50 pontos" : "Bandido, vale 10 pontos");
  target.innerHTML = '<span class="villain-shadow"><i class="villain-hood"></i><i class="villain-face"></i><i class="villain-body"></i><i class="villain-arm left"></i><i class="villain-arm right"></i></span><span class="wanted-tag">PROCURADO</span>';
  const maxX = Math.max(70, arena.clientWidth - 75);
  const maxY = Math.max(150, arena.clientHeight - 120);
  target.style.left = `${45 + Math.random() * (maxX - 45)}px`;
  target.style.top = `${95 + Math.random() * (maxY - 95)}px`;
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
  target._expiry = setTimeout(() => target.remove(), settings.targetLife);
}
function addPoints(points) {
  state.score += points;
  $("#scoreValue").textContent = String(state.score).padStart(4, "0");
}
function shootAt(target) {
  if (!state.running) { toast("Inicie uma missão antes de disparar."); return; }
  state.shots++;
  if (target && target.classList.contains("target")) {
    target.click();
    return;
  }
  const targets = $$(".target");
  if (targets.length) {
    // O disparador físico não informa a direção: ele mira automaticamente no alvo mais próximo do centro.
    const arenaRect = $("#arena").getBoundingClientRect();
    const cx = arenaRect.width / 2, cy = arenaRect.height / 2;
    targets.sort((a,b) => distanceTo(a,cx,cy) - distanceTo(b,cx,cy));
    const chosen = targets[0];
    drawWeb(chosen);
    chosen.click();
  } else {
    drawMiss();
    toast("Teia disparada! Nenhum alvo na mira.");
  }
}
function distanceTo(el, x, y) {
  const r = el.getBoundingClientRect(), a = $("#arena").getBoundingClientRect();
  const tx = r.left - a.left + r.width/2, ty = r.top - a.top + r.height/2;
  return Math.hypot(tx-x, ty-y);
}
function drawWeb(target) {
  const arena = $("#arena"), a = arena.getBoundingClientRect(), t = target.getBoundingClientRect();
  const svg = $("#webSvg"), group = $("#webEffect"), line = $("#webLine");
  const x1 = a.width / 2, y1 = a.height - 42;
  const x2 = t.left - a.left + t.width / 2, y2 = t.top - a.top + t.height / 2;
  // Ajusta o sistema de coordenadas do SVG ao tamanho real da arena.
  svg.setAttribute("viewBox", `0 0 ${a.width} ${a.height}`);
  group.replaceChildren();
  line.setAttribute("x1", x1); line.setAttribute("y1", y1);
  line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.style.opacity = "1";
  line.setAttribute("stroke-width", "5");
  line.animate([{opacity:1,strokeWidth:5},{opacity:1,strokeWidth:2},{opacity:0,strokeWidth:1}], {duration:560, easing:"ease-out"});
  // Rede de fios que se abre no impacto, para a teia ficar visível e reconhecível.
  const dx = x2-x1, dy = y2-y1, length = Math.hypot(dx,dy) || 1;
  const ux = dx/length, uy = dy/length, px = -uy, py = ux;
  const webLength = Math.min(104, Math.max(58, length * .34));
  const nodes = [];
  const makeLine = (ax,ay,bx,by,cls="web-strand") => {
    const el = document.createElementNS("http://www.w3.org/2000/svg","line");
    el.setAttribute("x1",ax); el.setAttribute("y1",ay); el.setAttribute("x2",bx); el.setAttribute("y2",by);
    el.setAttribute("class",cls); group.appendChild(el); return el;
  };
  // Fios radiais saindo do ponto de impacto.
  for(let i=0;i<12;i++){
    const ang=(Math.PI*2*i)/12;
    const ex=x2+Math.cos(ang)*webLength, ey=y2+Math.sin(ang)*webLength;
    makeLine(x2,y2,ex,ey,"web-strand"); nodes.push([ex,ey]);
  }
  // Anéis conectando os fios, formando uma pequena teia aberta.
  for(let ring=1;ring<=3;ring++){
    const radius=webLength*ring/3;
    for(let i=0;i<12;i++){
      const a1=(Math.PI*2*i)/12, a2=(Math.PI*2*(i+1))/12;
      makeLine(x2+Math.cos(a1)*radius,y2+Math.sin(a1)*radius,
               x2+Math.cos(a2)*radius,y2+Math.sin(a2)*radius,"web-ring");
    }
  }
  group.querySelectorAll("line").forEach((el,i)=>{
    el.style.opacity="0";
    el.animate([{opacity:0,strokeWidth:1},{opacity:1,strokeWidth:2.6,offset:.22},{opacity:1,strokeWidth:1.5,offset:.62},{opacity:0,strokeWidth:.5}],{duration:680,delay:Math.min(i*4,100),easing:"ease-out"});
  });
  const impact=document.createElementNS("http://www.w3.org/2000/svg","circle");
  impact.setAttribute("cx",x2); impact.setAttribute("cy",y2); impact.setAttribute("r",4);
  impact.setAttribute("class","web-impact"); group.appendChild(impact);
  impact.animate([{r:3,opacity:1},{r:webLength*.8,opacity:.75,offset:.35},{r:webLength,opacity:0}],{duration:520,easing:"ease-out"});
  setTimeout(()=>{ line.style.opacity="0"; group.replaceChildren(); },720);
}
function drawMiss() {
  const line = $("#webLine"), svg=$("#webSvg"), a = $("#arena").getBoundingClientRect(), group=$("#webEffect");
  svg.setAttribute("viewBox", `0 0 ${a.width} ${a.height}`); group.replaceChildren();
  line.setAttribute("x1", `${a.width/2}`); line.setAttribute("y1", `${a.height-42}`);
  line.setAttribute("x2", `${a.width/2 + (Math.random()*220-110)}`);
  line.setAttribute("y2", `${a.height/2}`); line.style.opacity = "1";
  line.animate([{opacity:1,strokeWidth:5},{opacity:0,strokeWidth:1}],{duration:360});
  setTimeout(() => line.style.opacity = "0", 380);
}
function clearTargets() {
  $$(".target").forEach(t => { if (t._expiry) clearTimeout(t._expiry); t.remove(); });
}
function saveScore() {
  const scores = JSON.parse(localStorage.getItem("webHeroRanking") || "[]");
  scores.push({name:state.player, character:state.character, score:state.score, level:3, date:new Date().toLocaleDateString("pt-BR")});
  scores.sort((a,b) => b.score - a.score);
  localStorage.setItem("webHeroRanking", JSON.stringify(scores.slice(0,20)));
}
function renderRanking() {
  const list = JSON.parse(localStorage.getItem("webHeroRanking") || "[]");
  const container = $("#rankingList");
  if (!list.length) {
    container.innerHTML = '<div class="empty-ranking">✦<br><br>Nenhum herói no placar ainda.<br>Jogue a primeira missão para inaugurar o ranking!</div>';
    return;
  }
  container.innerHTML = list.map((entry,i) => `
    <div class="ranking-row">
      <span class="rank-number ${i<3 ? "top" : ""}">${String(i+1).padStart(2,"0")}</span>
      <div><div class="rank-player">${escapeHTML(entry.name)}</div><div class="rank-meta">${escapeHTML(entry.character)} · FASE ${entry.level} · ${escapeHTML(entry.date)}</div></div>
      <strong class="rank-score">${entry.score.toLocaleString("pt-BR")}</strong>
    </div>`).join("");
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
let toastTimeout;
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("show"), 2600);
}

// Conexão opcional com ESP32/Arduino via Web Serial (Chrome/Edge em localhost ou HTTPS).
async function connectSerial() {
  if (!("serial" in navigator)) {
    toast("Web Serial não disponível. Use Chrome ou Edge atualizado.");
    return;
  }
  try {
    state.port = await navigator.serial.requestPort();
    await state.port.open({ baudRate: 115200 });
    $("#connectionDot").classList.add("connected");
    $("#connectionText").textContent = "DISPARADOR CONECTADO";
    $("#connectBtn").textContent = "DISPARADOR CONECTADO";
    toast("Disparador conectado. Envie SHOOT pela serial para disparar.");
    readSerial();
  } catch (error) {
    toast("Não foi possível conectar. Confira a placa e a permissão USB.");
    console.error(error);
  }
}
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
        for (const line of lines) {
          if (line.trim().toUpperCase() === "SHOOT") shootAt(null);
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
