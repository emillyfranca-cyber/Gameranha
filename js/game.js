// Lógica do jogo: fases, alvos, pontuação, combo, chefe e efeitos visuais.

const Game = (() => {
  const LEVEL_SECONDS = 30;
  const BOSS_LIFE_MS = 9000;
  const CLOCK_BONUS_SECONDS = 3;
  const CIVIL_PENALTY = 30;
  const AIM_SMOOTHING_MS = 35;

  // A dificuldade sobe a cada fase: o jogo sempre começa FÁCIL.
  //   interval = tempo entre novos alvos (ms) | life = quanto o alvo fica na tela (ms)
  //   count = alvos simultâneos | pad = folga (px) na área de acerto
  const LEVELS = {
    1: { label: 'FÁCIL',   interval: 1300, life: 2900, count: 1, civil: 0,    clock: 0,    pad: 16 },
    2: { label: 'MÉDIO',   interval: 950,  life: 2200, count: 2, civil: 0.10, clock: 0.06, pad: 10 },
    3: { label: 'DIFÍCIL', interval: 650,  life: 1600, count: 2, civil: 0.16, clock: 0.06, pad: 6 }
  };
  const BOSS_HP = 4;

  const HERO_CLASS = { red: 'peter', black: 'miles', white: 'gwen' };

  const g = {
    phase: 'idle',          // idle | intro | playing | between | over
    runId: 0,               // invalida callbacks atrasados de partidas anteriores
    character: 'Peter Parker', characterStyle: 'red',
    score: 0, level: 1, time: LEVEL_SECONDS,
    shots: 0, hits: 0, combo: 0, maxCombo: 0, civilHits: 0, bossSpawned: false,
    targetTimer: null, clockTimer: null, resultTimer: null, rafId: null, lastFrame: 0,
    aimX: 0.5, aimY: 0.5, shownX: 0.5, shownY: 0.5
  };

  const arena = () => $('#arena');
  const multiplier = () => (g.combo >= 15 ? 4 : g.combo >= 10 ? 3 : g.combo >= 5 ? 2 : 1);
  const isRunning = () => g.phase === 'intro' || g.phase === 'playing' || g.phase === 'between';

  // Executa depois de `ms`, mas só se ainda for a mesma partida.
  function later(fn, ms) {
    const id = g.runId;
    return setTimeout(() => { if (id === g.runId) fn(); }, ms);
  }

  // ------------------------- HUD -------------------------
  function updateHud() {
    $('#scoreValue').textContent = String(g.score).padStart(4, '0');
    $('#levelValue').innerHTML = `0${g.level} <small>/ 03</small>`;
    $('#timeValue').textContent = `${g.time}s`;
    $('#comboValue').innerHTML = `${g.combo} <small>x${multiplier()}</small>`;
    const bar = $('#timeBar');
    bar.style.width = `${Math.max(0, Math.min(100, (g.time / LEVEL_SECONDS) * 100))}%`;
    bar.parentElement.classList.toggle('low', g.time <= 8);
  }

  function setMission() {
    const names = { 1: 'CAPTURE OS BANDIDOS!', 2: 'CUIDADO COM OS CIVIS!', 3: 'ENFRENTE O CHEFE!' };
    $('#missionText').textContent = `FASE ${g.level} · ${LEVELS[g.level].label} · ${names[g.level]}`;
  }

  function showMessage(text) {
    const el = $('#arenaMessage');
    el.classList.remove('hidden-message');
    el.textContent = text;
  }
  function showMessageHtml(html) {
    const el = $('#arenaMessage');
    el.classList.remove('hidden-message');
    el.innerHTML = html;
  }
  const hideMessage = () => $('#arenaMessage').classList.add('hidden-message');

  // ------------------------- CICLO DA PARTIDA -------------------------
  function begin() {
    g.runId++;
    stopTimers();
    clearTargets();
    clearTimeout(g.resultTimer);
    Object.assign(g, {
      score: 0, level: 1, time: LEVEL_SECONDS, shots: 0, hits: 0,
      combo: 0, maxCombo: 0, civilHits: 0, bossSpawned: false, phase: 'intro',
      aimX: 0.5, aimY: 0.5, shownX: 0.5, shownY: 0.5
    });
    $('#setupPanel').classList.add('hidden');
    $('#playPanel').classList.remove('hidden');
    $('#hudHero').textContent = g.character.toUpperCase();
    applyHand();
    updateHud();
    setMission();
    showMessage('PREPARE-SE...');
    $('#crosshair').style.opacity = 1;
    drawCrosshair();
    startAimLoop();

    later(() => showMessage('VAI!'), 500);
    later(() => {
      hideMessage();
      g.phase = 'playing';
      spawnTargets();
      g.targetTimer = setInterval(spawnTargets, spawnInterval());
      g.clockTimer = setInterval(tick, 1000);
    }, 1100);
  }

  // O personagem fica no canto do lado da mão do jogador (o punho gira pouco para esse lado).
  function applyHand() {
    $('#heroAvatar').className = `hero-avatar ${HERO_CLASS[g.characterStyle] || 'peter'} hand-${ctl.hand}`;
  }

  // Onde a teia sai: centro do personagem.
  function webOrigin() {
    const a = arena().getBoundingClientRect();
    const h = $('#heroAvatar').getBoundingClientRect();
    return { x: h.left - a.left + h.width / 2, y: a.height - 42 };
  }

  const spawnInterval = () => LEVELS[g.level].interval;

  function tick() {
    if (g.phase !== 'playing') return;
    g.time--;
    updateHud();
    if (g.time > 0 && g.time <= 3) Sfx.play('count');
    if (g.level === 3 && !g.bossSpawned && g.time <= 18) spawnBoss();
    if (g.time <= 0) endLevel();
  }

  function endLevel() {
    clearInterval(g.targetTimer);
    clearTargets();
    if (g.level < 3) {
      g.phase = 'between';
      g.level++;
      g.time = LEVEL_SECONDS;
      updateHud();
      setMission();
      showMessage(`FASE ${g.level - 1} CONCLUÍDA! PREPARE-SE...`);
      Sfx.play('level');
      Controller.feedback('LEVEL');
      later(() => {
        hideMessage();
        g.phase = 'playing';
        g.targetTimer = setInterval(spawnTargets, spawnInterval());
        spawnTargets();
      }, 1600);
    } else {
      finish();
    }
  }

  function finish() {
    g.phase = 'over';
    stopTimers();
    clearTargets();
    const accuracy = g.shots ? Math.round((g.hits / g.shots) * 100) : 0;
    const runId = g.runId;
    Sfx.play('end');
    Controller.feedback('LEVEL');

    // O nome só é pedido agora, no final da partida.
    showMessageHtml(`
      <div class="result-card">
        <div class="result-title">MISSÃO CONCLUÍDA</div>
        <div class="result-score">${g.score} PONTOS</div>
        <div class="result-stats">
          <span>PRECISÃO<b>${accuracy}%</b></span>
          <span>MELHOR COMBO<b>x${g.maxCombo}</b></span>
          <span>ACERTOS<b>${g.hits}/${g.shots}</b></span>
        </div>
        <form id="saveForm" class="result-save">
          <label class="result-label" for="finalName">DIGITE SEU CODINOME PARA ENTRAR NO RANKING</label>
          <div class="result-save-row">
            <input id="finalName" maxlength="16" placeholder="Ex.: AranhaAzul" autocomplete="off">
            <button id="saveBtn" class="primary-btn" type="submit">SALVAR</button>
          </div>
        </form>
        <div class="result-rank" id="resultRank"></div>
        <div class="result-actions" id="resultActions" style="display:none">
          <button id="againBtn" class="primary-btn" type="button">JOGAR NOVAMENTE</button>
          <button id="rankBtn" class="secondary-btn" type="button">VER RANKING</button>
        </div>
        <button id="skipSave" class="text-btn" type="button">NÃO SALVAR E VOLTAR</button>
        <div class="result-auto" id="autoReset"></div>
      </div>`);

    $('#againBtn').addEventListener('click', reset);
    $('#rankBtn').addEventListener('click', () => { reset(); showView('rankingView'); });
    $('#skipSave').addEventListener('click', reset);

    $('#saveForm').addEventListener('submit', async event => {
      event.preventDefault();
      const name = $('#finalName').value.replace(/[<>]/g, '').trim().slice(0, 16);
      if (!name) { toast('Digite seu codinome para salvar.'); $('#finalName').focus(); return; }
      $('#saveBtn').disabled = true;
      $('#finalName').disabled = true;
      const result = await Ranking.add({
        name, character: g.character, score: g.score, accuracy, maxCombo: g.maxCombo
      });
      if (runId !== g.runId) return; // o operador já voltou ao início

      Sfx.play(result.position === 1 ? 'record' : 'end');
      const where = result.source === 'file' ? '' : ' (salvo só neste navegador: vincule o arquivo JSON na tela de ranking)';
      $('#resultRank').textContent =
        (result.position === 1 ? '🏆 NOVO RECORDE!' :
         result.position ? `VOCÊ FICOU EM ${result.position}º LUGAR` : 'CONTINUE TREINANDO PARA ENTRAR NO TOP') + where;
      $('#saveForm').style.display = 'none';
      $('#skipSave').style.display = 'none';
      $('#resultActions').style.display = 'flex';
      startAutoReset(25, 'Voltando ao início em');
    });

    $('#finalName').focus();
    startAutoReset(60, 'Sem salvar, voltando ao início em');
  }

  function startAutoReset(seconds, prefix = 'Voltando ao início em') {
    let left = seconds;
    const label = $('#autoReset');
    const update = () => { if (label) label.textContent = `${prefix} ${left}s`; };
    update();
    clearTimeout(g.resultTimer);
    const step = () => {
      left--;
      if (left <= 0) { reset(); return; }
      update();
      g.resultTimer = setTimeout(step, 1000);
    };
    g.resultTimer = setTimeout(step, 1000);
  }

  function stopTimers() {
    clearInterval(g.targetTimer);
    clearInterval(g.clockTimer);
    g.targetTimer = g.clockTimer = null;
  }

  // Volta para a tela de preparação.
  function reset() {
    g.runId++;
    clearTimeout(g.resultTimer);
    stopTimers();
    clearTargets();
    stopAimLoop();
    g.phase = 'idle';
    $('#playPanel').classList.add('hidden');
    $('#setupPanel').classList.remove('hidden');
    showMessage('PREPARE-SE...');
  }

  // Interrompe a partida (desconexão, operador, falha de sensor).
  const abort = reset;

  function skipLevel() {
    if (g.phase === 'playing') endLevel();
  }

  // ------------------------- ALVOS -------------------------
  function spawnTargets() {
    if (g.phase !== 'playing') return;
    const current = $$('.target:not(.boss)').length;
    for (let i = current; i < LEVELS[g.level].count; i++) createTarget(pickKind());
  }

  function pickKind() {
    const level = LEVELS[g.level];
    const roll = Math.random();
    if (roll < level.civil) return 'civil';
    if (roll < level.civil + level.clock) return 'clock';
    return Math.random() < 0.2 ? 'gold' : 'normal';
  }

  function spawnBoss() {
    g.bossSpawned = true;
    Sfx.play('boss');
    const a = arena();
    floatText(a.clientWidth / 2, a.clientHeight / 2, 'CHEFE!', 'bad');
    createTarget('boss');
  }

  function createTarget(kind) {
    const a = arena();
    const level = LEVELS[g.level];
    const target = document.createElement('div');
    const tags = { normal: 'PROCURADO', gold: 'PROCURADO', civil: 'CIVIL', clock: '+3s', boss: 'CHEFE' };
    target.className = `target ${kind}`;
    target.dataset.kind = kind;
    target.setAttribute('aria-hidden', 'true');
    target.innerHTML = `
      <span class="villain-shadow">
        <i class="villain-hood"></i><i class="villain-face"></i><i class="villain-body"></i>
        <i class="villain-arm left"></i><i class="villain-arm right"></i>
      </span>
      <span class="wanted-tag">${tags[kind]}</span>
      ${kind === 'boss' ? '<span class="boss-hp"><i></i></span>' : ''}`;

    const margin = kind === 'boss' ? 60 : 0;
    const maxX = Math.max(70, a.clientWidth - 75 - margin);
    const maxY = Math.max(150, a.clientHeight - 120 - margin);
    // Sorteia a posição evitando a área do personagem (alguns sorteios no máximo).
    const hero = $('#heroAvatar').getBoundingClientRect();
    const arenaRect = a.getBoundingClientRect();
    const zone = { l: hero.left - arenaRect.left - 70, r: hero.right - arenaRect.left + 20, t: hero.top - arenaRect.top - 70 };
    let left = 0, top = 0;
    for (let tries = 0; tries < 8; tries++) {
      left = 45 + margin + Math.random() * (maxX - 45 - margin);
      top = 95 + margin + Math.random() * (maxY - 95 - margin);
      const overlapsHero = left + 62 > zone.l && left < zone.r && top + 82 > zone.t;
      if (!overlapsHero) break;
    }
    target.style.left = `${left}px`;
    target.style.top = `${top}px`;

    if (kind === 'boss') {
      target._hp = target._maxHp = BOSS_HP;
    }
    const life = kind === 'boss' ? BOSS_LIFE_MS : level.life;
    target._expiry = setTimeout(() => removeTarget(target), life);
    $('#targetLayer').appendChild(target);
  }

  function removeTarget(target) {
    clearTimeout(target._expiry);
    target.remove();
  }

  function popTarget(target) {
    clearTimeout(target._expiry);
    target.classList.add('popped');
    setTimeout(() => target.remove(), 220);
  }

  function clearTargets() {
    $$('.target').forEach(removeTarget);
  }

  function targetCenter(target) {
    const a = arena().getBoundingClientRect();
    const r = target.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
  }

  // Escolhe o alvo sob a mira (com folga de acordo com a dificuldade).
  function findTarget(x, y) {
    const a = arena().getBoundingClientRect();
    const pad = LEVELS[g.level].pad;
    let best = null;
    let bestDist = Infinity;
    for (const target of $$('.target:not(.popped)')) {
      const r = target.getBoundingClientRect();
      const left = r.left - a.left - pad, right = r.right - a.left + pad;
      const top = r.top - a.top - pad, bottom = r.bottom - a.top + pad;
      if (x < left || x > right || y < top || y > bottom) continue;
      const dist = Math.hypot(x - (left + right) / 2, y - (top + bottom) / 2);
      if (dist < bestDist) { best = target; bestDist = dist; }
    }
    return best;
  }

  // ------------------------- DISPARO E PONTOS -------------------------
  function shootAtAim({ silent = false } = {}) {
    if (g.phase !== 'playing') {
      if (!silent && g.phase === 'idle') toast('Inicie uma missão antes de disparar.');
      return;
    }
    g.shots++;
    Sfx.play('shot');
    const rect = arena().getBoundingClientRect();
    const x = g.aimX * rect.width;
    const y = g.aimY * rect.height;
    const target = findTarget(x, y);
    if (target) hitTarget(target);
    else miss(x, y);
  }

  function miss(x, y) {
    g.combo = 0;
    updateHud();
    Sfx.play('miss');
    Controller.feedback('MISS');
    drawMissAt(x, y);
    drawWebAt(x, y);
  }

  // Registra um acerto válido; devolve true se atingiu um marco de combo.
  function registerHit() {
    g.hits++;
    g.combo++;
    if (g.combo > g.maxCombo) g.maxCombo = g.combo;
    return g.combo === 5 || g.combo === 10 || g.combo === 15;
  }

  function award(base, c, cls = '') {
    const points = base * multiplier();
    g.score += points;
    floatText(c.x, c.y, `+${points}`, cls);
  }

  function hitTarget(target) {
    const kind = target.dataset.kind;
    const c = targetCenter(target);

    if (kind === 'civil') {
      g.civilHits++;
      g.combo = 0;
      g.score = Math.max(0, g.score - CIVIL_PENALTY);
      floatText(c.x, c.y, `-${CIVIL_PENALTY}`, 'bad');
      Sfx.play('penalty');
      Controller.feedback('PENALTY');
      shake();
      popTarget(target);
      updateHud();
      return;
    }

    const milestone = registerHit();

    if (kind === 'boss') {
      target._hp--;
      target.querySelector('.boss-hp i').style.width = `${(target._hp / target._maxHp) * 100}%`;
      drawWeb(target);
      shake();
      if (target._hp > 0) {
        award(25, c);
        Sfx.play('bosshit');
        particles(c.x, c.y, '#ff6a8a');
        Controller.feedback('HIT');
      } else {
        award(200, c, 'gold');
        floatText(c.x, c.y - 34, 'CHEFE DERROTADO!', 'combo');
        Sfx.play('bossdown');
        particles(c.x, c.y, '#ffe06d', 22);
        Controller.feedback('LEVEL');
        popTarget(target);
      }
    } else {
      const base = kind === 'gold' ? 50 : kind === 'clock' ? 15 : 10;
      award(base, c, kind === 'gold' ? 'gold' : '');
      if (kind === 'clock') {
        g.time += CLOCK_BONUS_SECONDS;
        floatText(c.x, c.y - 26, `+${CLOCK_BONUS_SECONDS}s`, 'combo');
      }
      Sfx.play(kind === 'gold' ? 'gold' : kind === 'clock' ? 'clock' : 'hit');
      particles(c.x, c.y, kind === 'gold' ? '#ffe06d' : '#7be2ff');
      Controller.feedback('HIT');
      drawWeb(target);
      popTarget(target);
    }

    if (milestone) {
      floatText(c.x, c.y - 52, `COMBO x${multiplier()}!`, 'combo');
      Sfx.play('combo');
    }
    updateHud();
  }

  // ------------------------- MIRA -------------------------
  // x e y chegam do ESP32 em 0..1000.
  function updateAim(x, y) {
    g.aimX = Math.max(0, Math.min(1, x / 1000));
    g.aimY = Math.max(0, Math.min(1, y / 1000));
    $('#crosshair').style.opacity = 1;
  }

  function drawCrosshair() {
    const a = arena();
    const crosshair = $('#crosshair');
    crosshair.style.left = `${g.shownX * a.clientWidth}px`;
    crosshair.style.top = `${g.shownY * a.clientHeight}px`;
  }

  // O ESP32 envia a mira ~50x por segundo; aqui ela é suavizada a cada frame.
  function startAimLoop() {
    if (g.rafId) return;
    g.lastFrame = performance.now();
    const step = now => {
      const k = 1 - Math.exp(-(now - g.lastFrame) / AIM_SMOOTHING_MS);
      g.lastFrame = now;
      g.shownX += (g.aimX - g.shownX) * k;
      g.shownY += (g.aimY - g.shownY) * k;
      drawCrosshair();
      g.rafId = requestAnimationFrame(step);
    };
    g.rafId = requestAnimationFrame(step);
  }

  function stopAimLoop() {
    if (g.rafId) cancelAnimationFrame(g.rafId);
    g.rafId = null;
  }

  // ------------------------- EFEITOS VISUAIS -------------------------
  function floatText(x, y, text, cls = '') {
    const el = document.createElement('div');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    arena().appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function particles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const dot = document.createElement('span');
      dot.className = 'particle';
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.background = color;
      arena().appendChild(dot);
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 50;
      dot.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(0)`, opacity: 0 }
      ], { duration: 450 + Math.random() * 200, easing: 'ease-out' }).onfinish = () => dot.remove();
    }
  }

  function shake() {
    const a = arena();
    a.classList.remove('shake');
    void a.offsetWidth; // reinicia a animação
    a.classList.add('shake');
    setTimeout(() => a.classList.remove('shake'), 300);
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function addSvgLine(group, x1, y1, x2, y2, cls) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('class', cls);
    group.appendChild(line);
    return line;
  }

  function drawWebAt(x, y, radius = 54) {
    const rect = arena().getBoundingClientRect();
    const svg = $('#webSvg');
    const group = $('#webEffect');
    svg.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    group.replaceChildren();

    for (let i = 0; i < 12; i++) {
      const angle = (2 * Math.PI * i) / 12;
      addSvgLine(group, x, y, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 'web-strand');
    }
    for (let ring = 1; ring <= 3; ring++) {
      const r = (radius * ring) / 3;
      for (let i = 0; i < 12; i++) {
        const a1 = (2 * Math.PI * i) / 12;
        const a2 = (2 * Math.PI * (i + 1)) / 12;
        addSvgLine(group, x + Math.cos(a1) * r, y + Math.sin(a1) * r, x + Math.cos(a2) * r, y + Math.sin(a2) * r, 'web-ring');
      }
    }
    group.querySelectorAll('line').forEach((line, i) => line.animate(
      [{ opacity: 0, strokeWidth: 1 }, { opacity: 1, strokeWidth: 2.6, offset: 0.25 }, { opacity: 0, strokeWidth: 0.5 }],
      { duration: 650, delay: Math.min(i * 4, 100), easing: 'ease-out' }));

    const impact = document.createElementNS(SVG_NS, 'circle');
    impact.setAttribute('cx', x); impact.setAttribute('cy', y); impact.setAttribute('r', 4);
    impact.setAttribute('class', 'web-impact');
    group.appendChild(impact);
    impact.animate([{ r: 3, opacity: 1 }, { r: radius, opacity: 0 }], { duration: 520, easing: 'ease-out' });
    setTimeout(() => group.replaceChildren(), 700);
  }

  function shootLine(x, y, keyframes, duration, hideAfter) {
    const a = arena().getBoundingClientRect();
    const line = $('#webLine');
    $('#webSvg').setAttribute('viewBox', `0 0 ${a.width} ${a.height}`);
    const origin = webOrigin();
    line.setAttribute('x1', origin.x); line.setAttribute('y1', origin.y);
    line.setAttribute('x2', x); line.setAttribute('y2', y);
    line.style.opacity = '1';
    line.animate(keyframes, { duration, easing: 'ease-out' });
    setTimeout(() => { line.style.opacity = '0'; }, hideAfter);
  }

  function drawWeb(target) {
    const c = targetCenter(target);
    shootLine(c.x, c.y,
      [{ opacity: 1, strokeWidth: 5 }, { opacity: 1, strokeWidth: 2 }, { opacity: 0, strokeWidth: 1 }], 560, 720);
    drawWebAt(c.x, c.y, 75);
  }

  function drawMissAt(x, y) {
    shootLine(x, y, [{ opacity: 1, strokeWidth: 5 }, { opacity: 0, strokeWidth: 1 }], 360, 380);
  }

  // ------------------------- API PÚBLICA -------------------------
  return {
    begin, reset, abort, skipLevel, shootAtAim, updateAim, applyHand,
    isRunning,
    setCharacter: (name, style) => { g.character = name; g.characterStyle = style; },
    get phase() { return g.phase; }
  };
})();
