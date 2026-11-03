const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  character: "Peter Parker", characterStyle: "red", player: "",
  score: 0, level: 1, time: 30, running: false,
  targetTimer: null, clockTimer: null,
  port: null, reader: null, writer: null, serialBuffer: "",
  shots: 0, hits: 0, aimX: 0.5, aimY: 0.5,
  calibrationStatus: "disconnected", calibrationAttempt: 0,
  pendingStart: false, countdownRunning: false,
  centerPending: false, serialDisconnectHandler: null,
  connectionGeneration: 0, calibrationRequested: false
};

const levelSettings = {
  1: { interval: 1050, targetLife: 2400, targetCount: 1 },
  2: { interval: 780, targetLife: 1800, targetCount: 2 },
  3: { interval: 560, targetLife: 1450, targetCount: 2 }
};

// ------------------------- CALIBRAÇÃO -------------------------
function installCalibrationUI() {
  if ($('#calibrationOverlay')) return;
  const style = document.createElement('style');
  style.textContent = `
    #calibrationOverlay{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(5,10,22,.94);backdrop-filter:blur(12px);color:#fff;font-family:inherit}
    #calibrationOverlay.visible{display:flex}.calibration-card{width:min(650px,100%);padding:clamp(24px,5vw,42px);border:1px solid rgba(141,226,255,.25);border-radius:24px;background:linear-gradient(145deg,#17243b,#0b1221);box-shadow:0 25px 90px #0008;text-align:center}
    .calibration-eyebrow{color:#8de2ff;font-size:12px;font-weight:800;letter-spacing:3px}.calibration-title{margin:12px 0;font-size:clamp(26px,5vw,38px);font-weight:900}.calibration-description{color:#b8c6d9;line-height:1.7;font-size:15px}
    .calibration-illustration{margin:25px auto;width:170px;height:150px;display:flex;align-items:center;justify-content:center;border-radius:24px;background:#8de2ff14;border:1px solid #8de2ff2e}.calibration-illustration span{font-size:76px;animation:calibrationPulse 2s ease-in-out infinite}
    @keyframes calibrationPulse{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-7px) rotate(5deg)}}
    .calibration-steps{display:grid;gap:10px;margin:25px 0;text-align:left}.calibration-step{display:flex;align-items:center;gap:13px;padding:13px;border-radius:12px;background:#ffffff0b;color:#dbe7f5;font-size:14px;line-height:1.5}
    .calibration-step-number{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:50%;background:#8de2ff26;color:#8de2ff;font-weight:900}
    .calibration-status{margin:20px 0 12px;color:#8de2ff;font-size:15px;font-weight:800}.calibration-progress{height:8px;overflow:hidden;border-radius:10px;background:#ffffff1a}.calibration-progress-bar{width:0;height:100%;border-radius:inherit;background:linear-gradient(90deg,#45b9ff,#8de2ff);transition:width .4s ease}
    .calibration-tip{margin-top:17px;color:#9aaec5;font-size:12px;line-height:1.6}.calibration-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:10px;margin-top:23px}.calibration-action{border:0;border-radius:12px;padding:13px 22px;font-weight:900;cursor:pointer}.calibration-primary{color:#071321;background:#8de2ff}.calibration-secondary{color:#dbe7f5;background:#ffffff1a}.calibration-countdown{margin:20px 0;font-size:clamp(60px,15vw,100px);font-weight:900;color:#8de2ff;text-shadow:0 0 35px #8de2ff66}.calibration-error{color:#ff9a9a}
    @media(max-width:480px){.calibration-card{padding:22px 17px}.calibration-illustration{width:125px;height:115px}.calibration-illustration span{font-size:58px}}
  `;
  document.head.appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'calibrationOverlay';
  overlay.innerHTML = `
    <div class="calibration-card">
      <div class="calibration-eyebrow">WEB HERO · PREPARAÇÃO</div>
      <h2 class="calibration-title">Prepare seu disparador</h2>
      <p class="calibration-description" id="calibrationDescription">Antes da missão, precisamos calibrar o sensor para que a mira acompanhe corretamente os movimentos do seu pulso.</p>
      <div class="calibration-illustration"><span id="calibrationIcon">⌚</span></div>
      <div class="calibration-steps">
        <div class="calibration-step"><span class="calibration-step-number">1</span><span>Posicione o controle no pulso, na posição habitual de uso.</span></div>
        <div class="calibration-step"><span class="calibration-step-number">2</span><span>Deixe o braço parado e confortável, na posição central da mira.</span></div>
        <div class="calibration-step"><span class="calibration-step-number">3</span><span>Não movimente o sensor enquanto a calibração estiver acontecendo.</span></div>
      </div>
      <div class="calibration-status" id="calibrationStatusText">Aguardando controle...</div>
      <div class="calibration-progress"><div class="calibration-progress-bar" id="calibrationProgressBar"></div></div>
      <p class="calibration-tip" id="calibrationTip">Mantenha o pulso relaxado. A calibração pode ser repetida.</p>
      <div id="calibrationCountdown" class="calibration-countdown" style="display:none"></div>
      <div class="calibration-actions">
        <button id="calibrationRetry" class="calibration-action calibration-primary" style="display:none">INICIAR CALIBRAÇÃO</button>
        <button id="calibrationCancel" class="calibration-action calibration-secondary">VOLTAR</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  $('#calibrationCancel').addEventListener('click', () => {
    state.pendingStart = false; state.countdownRunning = false; hideCalibrationUI();
  });
  $('#calibrationRetry').addEventListener('click', startCalibration);
}

function showCalibrationUI(){ $('#calibrationOverlay')?.classList.add('visible'); }
function hideCalibrationUI(){ $('#calibrationOverlay')?.classList.remove('visible'); }

function updateCalibrationUI(){
  const status=state.calibrationStatus, text=$('#calibrationStatusText'), desc=$('#calibrationDescription'), icon=$('#calibrationIcon'), progress=$('#calibrationProgressBar'), retry=$('#calibrationRetry'), countdown=$('#calibrationCountdown');
  if(!text||!desc||!icon||!progress||!retry||!countdown)return;
  text.classList.remove('calibration-error'); retry.style.display='none'; countdown.style.display='none';
  if(status==='waiting'){
    text.textContent='Aguardando resposta do controle...'; desc.textContent='O controle está conectado. Aguarde a identificação do sensor.'; icon.textContent='⌚'; progress.style.width='10%';
  }else if(status==='calibration_required'){
    text.textContent='Sensor detectado. Pronto para calibrar.'; desc.textContent='Posicione o sensor no pulso, mantenha o braço imóvel e pressione INICIAR CALIBRAÇÃO.'; icon.textContent='⌚'; progress.style.width='10%'; retry.textContent='INICIAR CALIBRAÇÃO'; retry.style.display='inline-block';
  }else if(status==='calibrating'){
    text.textContent=state.calibrationAttempt?`Calibrando sensor — tentativa ${state.calibrationAttempt} de 3. Não movimente o pulso!`:'Calibrando sensor. Não movimente o pulso!'; desc.textContent='Estamos medindo o comportamento do giroscópio e verificando se o sensor está estável.'; icon.textContent='🎯'; progress.style.width='55%';
  }else if(status==='retry'){
    text.textContent=state.calibrationAttempt?`Movimento detectado. Nova tentativa (${state.calibrationAttempt} de 3).`:'Movimento detectado. Vamos tentar novamente.'; desc.textContent='O sensor percebeu movimento durante a calibração. Relaxe o braço e mantenha o controle imóvel.'; icon.textContent='✋'; progress.style.width='25%';
  }else if(status==='calibrated'){
    text.textContent='Calibração concluída!'; desc.textContent='Ótimo! O sensor foi calibrado. Prepare-se para a missão.'; icon.textContent='✓'; progress.style.width='100%';
  }else if(status==='ready'){
    text.textContent='Controle pronto!'; desc.textContent='A calibração terminou. A missão está liberada.'; icon.textContent='🕷️'; progress.style.width='100%';
  }else if(status==='error'){
    text.textContent='Não foi possível calibrar o sensor.'; text.classList.add('calibration-error'); desc.textContent='Verifique se o controle está conectado e se o sensor está imóvel. Você pode tentar novamente.'; icon.textContent='⚠️'; progress.style.width='0%'; retry.textContent='TENTAR NOVAMENTE'; retry.style.display='inline-block';
  }
}

async function startCalibration(){
  if(!state.writer){toast('Conecte o controle antes de calibrar.');return;}
  if(state.calibrationStatus==='calibrating'){toast('A calibração já está em andamento.');return;}
  state.pendingStart=false; state.countdownRunning=false; state.calibrationRequested=true; state.calibrationStatus='calibrating'; state.calibrationAttempt=0;
  showCalibrationUI(); updateCalibrationUI();
  const sent=await sendSerialCommand('CALIBRATE\n');
  if(!sent){state.calibrationStatus='error';state.calibrationRequested=false;updateCalibrationUI();}
}

// ------------------------- CONTAGEM REGRESSIVA -------------------------
async function startCountdown(){
  if(state.countdownRunning||!state.pendingStart||!state.writer||state.calibrationStatus!=='ready')return;
  state.countdownRunning=true;
  const text=$('#calibrationStatusText'), description=$('#calibrationDescription'), countdown=$('#calibrationCountdown');
  $('#calibrationIcon').textContent='🚀'; description.textContent='Posicione sua mira. A missão está prestes a começar!'; countdown.style.display='block';
  for(let i=5;i>=1;i--){
    if(!state.pendingStart||!state.writer||state.calibrationStatus!=='ready'){state.countdownRunning=false;return;}
    countdown.textContent=i;text.textContent='Prepare-se!';await new Promise(r=>setTimeout(r,1000));
  }
  if(!state.pendingStart||!state.writer||state.calibrationStatus!=='ready'){state.countdownRunning=false;return;}
  countdown.textContent='VAI!';await new Promise(r=>setTimeout(r,450));
  if(!state.writer||state.calibrationStatus!=='ready'){state.pendingStart=false;state.countdownRunning=false;return;}
  state.pendingStart=false;state.countdownRunning=false;hideCalibrationUI();beginGame();
}

// ------------------------- NAVEGAÇÃO E PERSONAGEM -------------------------
$$('.tab').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
function showView(id){
  $$('.tab').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===id));
  $$('.view').forEach(view=>view.classList.toggle('active-view',view.id===id));
  if(id==='rankingView')renderRanking();
}
$$('.character-card').forEach(card=>card.addEventListener('click',()=>{
  $$('.character-card').forEach(c=>c.classList.remove('selected'));card.classList.add('selected');state.character=card.dataset.character;state.characterStyle=card.dataset.color;
}));

// ------------------------- EVENTOS -------------------------
$('#startBtn').addEventListener('click',startGame);
$('#shootBtn').addEventListener('click',shootAtAim);
$('#connectBtn').addEventListener('click',connectSerial);
$('#clearRankingBtn').addEventListener('click',()=>{
  if(confirm('Tem certeza que deseja apagar o ranking salvo neste navegador?')){localStorage.removeItem('webHeroRanking');renderRanking();toast('Ranking local apagado.');}
});
document.addEventListener('keydown',event=>{
  if(event.code==='Space'&&state.running){event.preventDefault();shootAtAim();}
  const typing=event.target&&(event.target.matches('input,textarea,select')||event.target.isContentEditable);
  if(!typing&&event.key.toLowerCase()==='c'&&state.writer){event.preventDefault();state.centerPending=true;sendSerialCommand('CENTER\n').then(ok=>{if(ok)toast('Solicitando centralização da mira...');});}
});

// ------------------------- INÍCIO DO JOGO -------------------------
function startGame(){
  const name=$('#playerName').value.trim().replace(/[<>]/g,'').slice(0,16);
  if(!name){toast('Digite seu codinome antes de começar.');$('#playerName').focus();return;}
  state.player=name;
  if(!state.writer||state.calibrationStatus!=='ready'){toast('Conecte e calibre o disparador antes de iniciar.');return;}
  state.pendingStart=true;showCalibrationUI();updateCalibrationUI();startCountdown();
}
function beginGame(){
  if(!state.writer||state.calibrationStatus!=='ready'){toast('O controle não está pronto. Missão cancelada.');return;}
  state.score=0;state.level=1;state.time=30;state.shots=0;state.hits=0;state.running=true;
  $('#setupPanel').classList.add('hidden');$('#playPanel').classList.remove('hidden');
  $('#hudHero').textContent=state.character.toUpperCase();$('#heroAvatar').className=`hero-avatar ${state.characterStyle}`;
  $('#scoreValue').textContent='0000';$('#levelValue').innerHTML='01 <small>/ 03</small>';$('#timeValue').textContent='30s';
  $('#arenaMessage').classList.remove('hidden-message');$('#arenaMessage').textContent='3... 2... 1... VAI!';
  clearInterval(state.targetTimer);clearInterval(state.clockTimer);clearTargets();
  setTimeout(()=>{
    if(!state.running)return;$('#arenaMessage').classList.add('hidden-message');spawnTargets();
    state.targetTimer=setInterval(spawnTargets,levelSettings[state.level].interval);state.clockTimer=setInterval(tick,1000);
  },1200);
}

// ------------------------- TEMPO E FASES -------------------------
function tick(){if(!state.running)return;state.time--;$('#timeValue').textContent=`${state.time}s`;if(state.time<=0)endLevel();}
function endLevel(){
  clearInterval(state.targetTimer);clearTargets();
  if(state.level<3){
    state.level++;state.time=30;$('#levelValue').innerHTML=`0${state.level} <small>/ 03</small>`;$('#timeValue').textContent='30s';
    $('#arenaMessage').classList.remove('hidden-message');$('#arenaMessage').textContent=`FASE ${state.level-1} CONCLUÍDA! PREPARE-SE...`;
    setTimeout(()=>{if(!state.running)return;$('#arenaMessage').classList.add('hidden-message');state.targetTimer=setInterval(spawnTargets,levelSettings[state.level].interval);spawnTargets();},1400);
  }else finishGame();
}
function finishGame(){
  state.running=false;clearInterval(state.targetTimer);clearInterval(state.clockTimer);clearTargets();saveScore();
  $('#arenaMessage').classList.remove('hidden-message');
  $('#arenaMessage').innerHTML=`MISSÃO CONCLUÍDA<br><span style="font-size:18px;color:#8de2ff">${state.score} PONTOS</span><br><button id="againBtn" class="primary-btn" style="margin-top:16px">JOGAR NOVAMENTE</button>`;
  $('#againBtn').addEventListener('click',resetGame);toast('Resultado salvo no ranking deste computador!');
}
function resetGame(){$('#playPanel').classList.add('hidden');$('#setupPanel').classList.remove('hidden');$('#arenaMessage').classList.remove('hidden-message');$('#arenaMessage').textContent='PREPARE-SE...';}

// ------------------------- ALVOS -------------------------
function spawnTargets(){if(!state.running)return;const settings=levelSettings[state.level],current=$$('.target').length;for(let i=current;i<settings.targetCount;i++)createTarget(settings);}
function createTarget(settings){
  const arena=$('#arena'),target=document.createElement('button'),gold=Math.random()<0.2;
  target.className=`target${gold?' gold':''}`;target.type='button';target.setAttribute('aria-label',gold?'Inimigo especial, vale 50 pontos':'Bandido, vale 10 pontos');
  target.innerHTML=`<span class="villain-shadow"><i class="villain-hood"></i><i class="villain-face"></i><i class="villain-body"></i><i class="villain-arm left"></i><i class="villain-arm right"></i></span><span class="wanted-tag">PROCURADO</span>`;
  const maxX=Math.max(70,arena.clientWidth-75),maxY=Math.max(150,arena.clientHeight-120);
  target.style.left=`${45+Math.random()*(maxX-45)}px`;target.style.top=`${95+Math.random()*(maxY-95)}px`;
  target.addEventListener('click',event=>{event.stopPropagation();if(!state.running)return;state.hits++;addPoints(gold?50:10);drawWeb(target);target.classList.add('popped');setTimeout(()=>target.remove(),180);});
  $('#targetLayer').appendChild(target);target._expiry=setTimeout(()=>target.remove(),settings.targetLife);
}
function addPoints(points){state.score+=points;$('#scoreValue').textContent=String(state.score).padStart(4,'0');}

// ------------------------- MIRA E DISPARO -------------------------
function updateAim(x,y){state.aimX=Math.max(0,Math.min(1,x/1000));state.aimY=Math.max(0,Math.min(1,y/1000));const arena=$('#arena');$('#crosshair').style.left=`${state.aimX*arena.clientWidth}px`;$('#crosshair').style.top=`${state.aimY*arena.clientHeight}px`;$('#crosshair').style.opacity=1;}
$('#arena').addEventListener('pointermove',event=>{const rect=$('#arena').getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;state.aimX=Math.max(0,Math.min(1,x/rect.width));state.aimY=Math.max(0,Math.min(1,y/rect.height));$('#crosshair').style.left=`${x}px`;$('#crosshair').style.top=`${y}px`;$('#crosshair').style.opacity=1;});
$('#arena').addEventListener('pointerleave',()=>{$('#crosshair').style.opacity=0;});
function shootAtAim(){
  if(!state.running){toast('Inicie uma missão antes de disparar.');return;}state.shots++;
  const arena=$('#arena'),rect=arena.getBoundingClientRect(),x=state.aimX*rect.width,y=state.aimY*rect.height;
  const hit=$$('.target').find(target=>{const r=target.getBoundingClientRect(),left=r.left-rect.left,top=r.top-rect.top;return x>=left&&x<=left+r.width&&y>=top&&y<=top+r.height;});
  if(hit)hit.click();else{drawMissAt(x,y);drawWebAt(x,y);}
}

// ------------------------- EFEITOS VISUAIS -------------------------
function addSvgLine(group,x1,y1,x2,y2,cls){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.setAttribute('x1',x1);line.setAttribute('y1',y1);line.setAttribute('x2',x2);line.setAttribute('y2',y2);line.setAttribute('class',cls);group.appendChild(line);return line;}
function drawWebAt(x,y,radius=54){
  const rect=$('#arena').getBoundingClientRect(),svg=$('#webSvg'),group=$('#webEffect');svg.setAttribute('viewBox',`0 0 ${rect.width} ${rect.height}`);group.replaceChildren();
  for(let i=0;i<12;i++){const angle=2*Math.PI*i/12;addSvgLine(group,x,y,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius,'web-strand');}
  for(let ring=1;ring<=3;ring++){const r=radius*ring/3;for(let i=0;i<12;i++){const a1=2*Math.PI*i/12,a2=2*Math.PI*(i+1)/12;addSvgLine(group,x+Math.cos(a1)*r,y+Math.sin(a1)*r,x+Math.cos(a2)*r,y+Math.sin(a2)*r,'web-ring');}}
  group.querySelectorAll('line').forEach((line,i)=>line.animate([{opacity:0,strokeWidth:1},{opacity:1,strokeWidth:2.6,offset:.25},{opacity:0,strokeWidth:.5}],{duration:650,delay:Math.min(i*4,100),easing:'ease-out'}));
  const impact=document.createElementNS('http://www.w3.org/2000/svg','circle');impact.setAttribute('cx',x);impact.setAttribute('cy',y);impact.setAttribute('r',4);impact.setAttribute('class','web-impact');group.appendChild(impact);impact.animate([{r:3,opacity:1},{r:radius,opacity:0}],{duration:520,easing:'ease-out'});setTimeout(()=>group.replaceChildren(),700);
}
function drawWeb(target){const arena=$('#arena'),a=arena.getBoundingClientRect(),t=target.getBoundingClientRect(),line=$('#webLine'),svg=$('#webSvg'),x=t.left-a.left+t.width/2,y=t.top-a.top+t.height/2;svg.setAttribute('viewBox',`0 0 ${a.width} ${a.height}`);line.setAttribute('x1',a.width/2);line.setAttribute('y1',a.height-42);line.setAttribute('x2',x);line.setAttribute('y2',y);line.style.opacity='1';line.animate([{opacity:1,strokeWidth:5},{opacity:1,strokeWidth:2},{opacity:0,strokeWidth:1}],{duration:560,easing:'ease-out'});drawWebAt(x,y,75);setTimeout(()=>{line.style.opacity='0';},720);}
function drawMissAt(x,y){const a=$('#arena').getBoundingClientRect(),svg=$('#webSvg'),line=$('#webLine');svg.setAttribute('viewBox',`0 0 ${a.width} ${a.height}`);line.setAttribute('x1',a.width/2);line.setAttribute('y1',a.height-42);line.setAttribute('x2',x);line.setAttribute('y2',y);line.style.opacity='1';line.animate([{opacity:1,strokeWidth:5},{opacity:0,strokeWidth:1}],{duration:360});setTimeout(()=>{line.style.opacity='0';},380);}
function clearTargets(){$$('.target').forEach(target=>{if(target._expiry)clearTimeout(target._expiry);target.remove();});}

// ------------------------- RANKING -------------------------
function saveScore(){const scores=JSON.parse(localStorage.getItem('webHeroRanking')||'[]');scores.push({name:state.player,character:state.character,score:state.score,level:3,date:new Date().toLocaleDateString('pt-BR')});scores.sort((a,b)=>b.score-a.score);localStorage.setItem('webHeroRanking',JSON.stringify(scores.slice(0,20)));}
function renderRanking(){const list=JSON.parse(localStorage.getItem('webHeroRanking')||'[]'),container=$('#rankingList');if(!list.length){container.innerHTML='<div class="empty-ranking">✦<br><br>Nenhum herói no placar ainda.<br>Jogue a primeira missão para inaugurar o ranking!</div>';return;}container.innerHTML=list.map((entry,i)=>`<div class="ranking-row"><span class="rank-number ${i<3?'top':''}">${String(i+1).padStart(2,'0')}</span><div><div class="rank-player">${escapeHTML(entry.name)}</div><div class="rank-meta">${escapeHTML(entry.character)} · FASE ${entry.level} · ${escapeHTML(entry.date)}</div></div><strong class="rank-score">${entry.score.toLocaleString('pt-BR')}</strong></div>`).join('');}
function escapeHTML(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

// ------------------------- TOAST -------------------------
let toastTimeout;
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>el.classList.remove('show'),2600);}

// ------------------------- SERIAL / USB -------------------------
async function connectSerial(){
  if(!('serial'in navigator)){toast('Web Serial não disponível. Use Chrome ou Edge atualizado.');return;}
  if(state.port){toast('Já existe um controle conectado.');return;}
  let port=null;
  try{
    port=await navigator.serial.requestPort();
    await port.open({baudRate:115200});
    if(!port.writable||!port.readable)throw new Error('A porta serial não disponibilizou leitura e escrita.');
    state.port=port;state.connectionGeneration++;const generation=state.connectionGeneration;state.serialBuffer='';
    state.writer=port.writable.getWriter();
    $('#connectionDot').classList.add('connected');$('#connectionText').textContent='DISPARADOR CONECTADO · VALIDANDO SENSOR';$('#connectBtn').textContent='DISPARADOR CONECTADO';$('#connectBtn').disabled=true;
    $('#startBtn').disabled=true;$('#startBtn').textContent='AGUARDANDO CALIBRAÇÃO ↗';
    state.calibrationStatus='waiting';state.calibrationAttempt=0;state.calibrationRequested=false;showCalibrationUI();updateCalibrationUI();
    state.serialDisconnectHandler=handleSerialDisconnect;navigator.serial.addEventListener('disconnect',state.serialDisconnectHandler);
    toast('Controle conectado. Consultando o sensor...');
    readSerial(port,generation);
    await new Promise(resolve=>setTimeout(resolve,250));
    if(state.port===port)await sendSerialCommand('STATUS\n');
  }catch(error){
    console.error(error);
    if(port&&state.port!==port){try{await port.close();}catch(_){}}
    await cleanupSerial();
    state.calibrationStatus='disconnected';$('#connectionDot').classList.remove('connected');$('#connectionText').textContent='DISPARADOR NÃO CONECTADO';$('#connectBtn').disabled=false;$('#connectBtn').textContent='CONECTAR DISPARADOR';$('#startBtn').disabled=true;$('#startBtn').textContent='AGUARDANDO CONTROLE ↗';
    toast('Não foi possível conectar. Confira a placa e a permissão USB.');
  }
}

async function cleanupSerial(){
  const reader=state.reader,writer=state.writer,port=state.port;
  state.reader=null;state.writer=null;state.port=null;state.serialBuffer='';state.connectionGeneration++;
  try{if(reader)await reader.cancel();}catch(error){console.warn('Não foi possível cancelar a leitura:',error);}
  try{if(reader)reader.releaseLock();}catch(error){console.warn('Não foi possível liberar o leitor:',error);}
  try{if(writer)await writer.close();}catch(error){console.warn('Não foi possível fechar o escritor:',error);}
  try{if(writer)writer.releaseLock();}catch(error){console.warn('Não foi possível liberar o escritor:',error);}
  try{if(port)await port.close();}catch(error){console.warn('Não foi possível fechar a porta:',error);}
}

function handleSerialDisconnect(event){
  if(event?.target&&state.port&&event.target!==state.port)return;
  state.pendingStart=false;state.countdownRunning=false;state.calibrationRequested=false;state.running=false;state.calibrationStatus='disconnected';
  clearInterval(state.targetTimer);clearInterval(state.clockTimer);clearTargets();state.connectionGeneration++;state.writer=null;state.reader=null;state.port=null;state.serialBuffer='';
  $('#connectionDot').classList.remove('connected');$('#connectionText').textContent='DISPARADOR DESCONECTADO';$('#connectBtn').disabled=false;$('#connectBtn').textContent='CONECTAR DISPARADOR';$('#startBtn').disabled=true;$('#startBtn').textContent='AGUARDANDO CONTROLE ↗';
  $('#setupPanel').classList.remove('hidden');$('#playPanel').classList.add('hidden');hideCalibrationUI();toast('Disparador desconectado. Conecte novamente para continuar.');
}

async function sendSerialCommand(command){
  const writer=state.writer;if(!writer){toast('Conecte o controle antes de enviar o comando.');return false;}
  try{await writer.write(new TextEncoder().encode(command));return state.writer===writer;}
  catch(error){console.error('Erro ao enviar comando serial:',error);toast('Falha na comunicação com o controle.');return false;}
}

function stopForSensorRecovery(message){
  state.pendingStart=false;state.countdownRunning=false;state.calibrationRequested=false;state.running=false;
  clearInterval(state.targetTimer);clearInterval(state.clockTimer);clearTargets();$('#setupPanel').classList.remove('hidden');$('#playPanel').classList.add('hidden');
  $('#startBtn').disabled=true;$('#startBtn').textContent='AGUARDANDO CALIBRAÇÃO ↗';showCalibrationUI();updateCalibrationUI();toast(message);
}

// ------------------------- PROTOCOLO DO ESP32 -------------------------
function handleSerialLine(rawLine){
  const line=rawLine.trim().toUpperCase();if(!line)return;
  if(line==='SHOOT'){shootAtAim();return;}
  if(line.startsWith('AIM:')){const parts=line.slice(4).split(',');if(parts.length===2){const x=Number(parts[0]),y=Number(parts[1]);if(Number.isFinite(x)&&Number.isFinite(y))updateAim(x,y);}return;}

  if(line==='SENSOR_OK'||line==='CALIBRATION_REQUIRED'){
    if(state.running)return;
    state.pendingStart=false;state.calibrationRequested=false;state.calibrationStatus='calibration_required';
    $('#startBtn').disabled=true;$('#startBtn').textContent='CALIBRE O CONTROLE ↗';showCalibrationUI();updateCalibrationUI();return;
  }
  if(line==='CALIBRATING'){state.calibrationStatus='calibrating';showCalibrationUI();updateCalibrationUI();return;}
  if(line.startsWith('CALIBRATION_ATTEMPT:')){state.calibrationAttempt=Number(line.split(':')[1])||0;updateCalibrationUI();return;}
  if(line==='CALIBRATION_RETRY'){state.calibrationStatus='retry';updateCalibrationUI();return;}
  if(line==='CALIBRATION_OK'){state.calibrationStatus='calibrated';updateCalibrationUI();return;}

  if(line==='CALIBRATION_ERROR'||line==='SENSOR_ERROR'||line==='IMU_READ_ERROR'||line==='CENTER_ERROR'){
    if(state.running)stopForSensorRecovery('Falha no sensor. A missão foi interrompida; calibre novamente.');
    state.calibrationStatus='error';state.calibrationRequested=false;state.centerPending=false;$('#startBtn').disabled=true;$('#startBtn').textContent='CALIBRAÇÃO NECESSÁRIA ↗';showCalibrationUI();updateCalibrationUI();return;
  }
  if(line==='CENTER_OK'){state.centerPending=false;toast('Centro da mira confirmado.');return;}

  // READY também pode ser a resposta ao STATUS, se o ESP32 já estiver calibrado.
  if(line==='READY'){
    state.calibrationRequested=false;state.calibrationStatus='ready';$('#startBtn').disabled=false;$('#startBtn').textContent='INICIAR MISSÃO ↗';updateCalibrationUI();
    if(state.pendingStart){setTimeout(()=>{if(state.pendingStart)startCountdown();},500);}else{hideCalibrationUI();toast('Controle calibrado e pronto para uso.');}
    return;
  }
  if(line==='I2C_RECOVERY'){
    stopForSensorRecovery('Falha de comunicação com o sensor. Aguarde a recuperação...');state.calibrationStatus='waiting';updateCalibrationUI();return;
  }
  if(line==='SENSOR_RECOVERED'){
    stopForSensorRecovery('Sensor recuperado. Posicione o braço e inicie uma nova calibração.');state.calibrationStatus='calibration_required';updateCalibrationUI();return;
  }
}

async function readSerial(port,generation){
  while(state.port===port&&state.connectionGeneration===generation&&port.readable){
    let reader=null;
    try{
      reader=port.readable.getReader();state.reader=reader;
      while(true){
        const {value,done}=await reader.read();if(done)break;
        if(state.port!==port||state.connectionGeneration!==generation)break;
        state.serialBuffer+=new TextDecoder().decode(value);
        const lines=state.serialBuffer.split(/\r?\n/);state.serialBuffer=lines.pop()||'';
        for(const line of lines){if(state.port!==port||state.connectionGeneration!==generation)break;handleSerialLine(line);}
      }
    }catch(error){if(state.port===port)console.error('Leitura serial interrompida:',error);}
    finally{if(reader){try{reader.releaseLock();}catch(error){console.warn('Erro ao liberar leitura serial:',error);}}if(state.reader===reader)state.reader=null;}
    if(state.port!==port||state.connectionGeneration!==generation)break;
  }
}

// ------------------------- INICIALIZAÇÃO -------------------------
installCalibrationUI();renderRanking();
