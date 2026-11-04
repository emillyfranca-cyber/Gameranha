// Lógica do jogo: fases, alvos, pontuação, combo, chefe e efeitos visuais.

const Game = (() => {
  const LEVEL_SECONDS = 30;
  const BOSS_LIFE_MS = 9000;
  const CLOCK_BONUS_SECONDS = 3;
  const CIVIL_PENALTY = 30;
  const AIM_SMOOTHING_MS = 35;

  const LEVELS = {
    1: { interval: 1050, life: 2400, count: 1, civil: 0,    clock: 0 },
    2: { interval: 780,  life: 1800, count: 2, civil: 0.12, clock: 0.06 },
    3: { interval: 560,  life: 1450, count: 2, civil: 0.18, clock: 0.06 }
  };

  const DIFFICULTIES = {
    easy:   { label: 'FÁCIL',   interval: 1.25, life: 1.3, civil: 0.6, pad: 16, bossHp: 3 },
    normal: { label: 'NORMAL',  interval: 1,    life: 1,   civil: 1,   pad: 8,  bossHp: 4 },
    hard:   { label: 'DIFÍCIL', interval: 0.85, life: 0.8, civil: 1.4, pad: 2,  bossHp: 6 }
  };

  const HERO_CLASS = { red: 'peter', black: 'miles', white: 'gwen' };

  const g = {
    phase: 'idle',          // idle | intro | playing | between | over
    runId: 0,               // invalida callbacks atrasados de partidas anteriores
    player: '', character: 'Peter Parker', characterStyle: 'red', difficulty: 'normal',
    score: 0, level: 1, time: LEVEL_SECONDS,
    shots: 0, hits: 0, combo: 0, maxCombo: 0, civilHits: 0, bossSpawned: false,
    targetTimer: null, clockTimer: null, resultTimer: null, rafId: null, lastFrame: 0,
    aimX: 0.5, aimY: 0.5, shownX: 0.5, shownY: 0.5
  };

  const arena = () => $('#arena');
  const diff = () => DIFFICULTIES[g.difficulty];
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
    $('#missionText').textContent = `FASE ${g.level} · ${names[g.level]}`;
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
    $('#heroAvatar').className = `hero-avatar ${HERO_CLASS[g.characterStyle] || 'peter'}`;
    updateHud();
    setMission();
    showMessage('PREPARE-SE...');
    $('#crosshair').style.opacity = Controller.mode() === 'hardware' ? 1 : 0;
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

  const spawnInterval = () => LEVELS[g.level].interval * diff().interval;

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
    const position = Ranking.add({
      name: g.player, character: g.character, score: g.score, accuracy,
      maxCombo: g.maxCombo, difficulty: diff().label,
      date: new Date().toLocaleDateString('pt-BR')
    });
    Sfx.play(position === 1 ? 'record' : 'end');
    Controller.feedback('LEVEL');

    const rankText = position === 1 ? '🏆 NOVO RECORDE!'
      : position ? `VOCÊ FICOU EM ${position}º LUGAR`
      : 'CONTINUE TREINANDO PARA ENTRAR NO RANKING';

    showMessageHtml(`
      <div class="result-card">
        <div class="result-title">MISSÃO CONCLUÍDA</div>
        <div class="result-score">${g.score} PONTOS</div>
        <div class="result-stats">
          <span>PRECISÃO<b>${accuracy}%</b></span>
          <span>MELHOR COMBO<b>x${g.maxCombo}</b></span>
          <span>ACERTOS<b>${g.hits}/${g.shots}</b></span>
        </div>
        <div class="result-rank">${rankText}</div>
        <div class="result-actions">
          <button id="againBtn" class="primary-btn" type="button">JOGAR NOVAMENTE</button>
          <button id="rankBtn" class="secondary-btn" type="button">VER RANKING</button>
        </div>
        <div class="result-auto" id="autoReset"></div>
      </div>`);
    $('#againBtn').addEventListener('click', reset);
    $('#rankBtn').addEventListener('click', () => { reset(); showView('rankingView'); });
    startAutoReset(25);
  }

  function startAutoReset(seconds) {
    let left = seconds;
    const label = $('#autoReset');
    const update = () => { if (label) label.textContent = `Voltando ao início em ${left}s`; };
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
    const civil = level.civil * diff().civil;
    const roll = Math.random();
    if (roll < civil) return 'civil';
    if (roll < civil + level.clock) return 'clock';
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
    target.style.left = `${45 + margin + Math.random() * (maxX - 45 - margin)}px`;
    target.style.top = `${95 + margin + Math.random() * (maxY - 95 - margin)}px`;

    if (kind === 'boss') {
      target._hp = target._maxHp = diff().bossHp;
    }
    const life = kind === 'boss' ? BOSS_LIFE_MS : level.life * diff().life;
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
    const pad = diff().pad;
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

  // Modo demo: a mira acompanha o ponteiro imediatamente.
  function pointerAim(event) {
    const rect = arena().getBoundingClientRect();
    g.aimX = g.shownX = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    g.aimY = g.shownY = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    drawCrosshair();
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
    line.setAttribute('x1', a.width / 2); line.setAttribute('y1', a.height - 42);
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
    begin, reset, abort, skipLevel, shootAtAim, updateAim, pointerAim,
    isRunning,
    setPlayer: name => { g.player = name; },
    setCharacter: (name, style) => { g.character = name; g.characterStyle = style; },
    setDifficulty: key => { if (DIFFICULTIES[key]) g.difficulty = key; },
    get difficulty() { return g.difficulty; },
    get phase() { return g.phase; }
  };
})();
