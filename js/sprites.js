// Sprites SVG dos alvos (desenhados em código: nítidos em qualquer tamanho e fáceis de variar).
//
// Todos usam a caixa 62x82. As animações (balançar, piscar, acenar, asas...) ficam no style.css,
// ligadas às classes dos grupos (.eyes, .arm-l, .wave-l, .wing-l, .spark, .boss-eyes ...).
//
//   Sprites.render('normal')  -> bandido (4 variações sorteadas)
//   Sprites.render('gold')    -> robô dourado
//   Sprites.render('civil')   -> civil simpático (varia pele, roupa e acessório)
//   Sprites.render('clock')   -> relógio voador (+3 s)
//   Sprites.render('boss')    -> chefe mecha

const Sprites = (() => {
  const OUT = '#0b1030';
  const SKIN = '#f0c7a2';
  let uid = 0;

  const pick = list => list[Math.floor(Math.random() * list.length)];
  const wrap = (inner, defs = '') =>
    `<svg viewBox="0 0 62 82" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${inner}</svg>`;
  const stroke = (w = 2) => `stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const shadow = (opacity = 0.35) => `<ellipse cx="31" cy="78" rx="17" ry="3.2" fill="#000" opacity="${opacity}"/>`;

  // ------------------------- PEÇAS DE PESSOA -------------------------
  const legs = (pants, shoes) => `
    <g class="legs">
      <rect x="21" y="55" width="9" height="20" rx="4" fill="${pants}" ${stroke()}/>
      <rect x="32" y="55" width="9" height="20" rx="4" fill="${pants}" ${stroke()}/>
      <rect x="19" y="71" width="12" height="7" rx="3.5" fill="${shoes}" ${stroke()}/>
      <rect x="31" y="71" width="12" height="7" rx="3.5" fill="${shoes}" ${stroke()}/>
    </g>`;

  const torso = fill => `<rect x="18" y="33" width="26" height="26" rx="9" fill="${fill}" ${stroke()}/>`;

  // Braço pendurado (pivô no ombro). `cls` liga a animação de balanço.
  const armLeft = (sleeve, hand, cls = 'arm-l') =>
    `<g class="${cls}"><rect x="10" y="36" width="9" height="20" rx="4.5" fill="${sleeve}" ${stroke()}/><circle cx="14.5" cy="57" r="4.5" fill="${hand}" ${stroke()}/></g>`;
  const armRight = (sleeve, hand, cls = 'arm-r') =>
    `<g class="${cls}"><rect x="43" y="36" width="9" height="20" rx="4.5" fill="${sleeve}" ${stroke()}/><circle cx="47.5" cy="57" r="4.5" fill="${hand}" ${stroke()}/></g>`;

  const eyes = (angry, color = '#fff') => `
    <g class="eyes">
      <ellipse cx="26" cy="22" rx="3.2" ry="3.6" fill="${color}" ${stroke(1)}/>
      <ellipse cx="36" cy="22" rx="3.2" ry="3.6" fill="${color}" ${stroke(1)}/>
      <circle cx="26.6" cy="22.6" r="1.6" fill="${OUT}"/><circle cx="35.4" cy="22.6" r="1.6" fill="${OUT}"/>
    </g>
    ${angry ? `<path d="M22 17 L29 20 M40 17 L33 20" fill="none" ${stroke(2.2)}/>` : ''}`;

  const bag = `
    <g class="prop">
      <path d="M46 53 q-7 2 -6 11 q6 7 12 0 q1 -9 -4 -11z" fill="#b57b3a" ${stroke()}/>
      <path d="M44 53 l5 0" ${stroke(2.2)}/>
      <text x="46.5" y="64" font-size="8" font-weight="900" fill="#ffe9a0" text-anchor="middle" font-family="Arial,sans-serif">$</text>
    </g>`;

  // ------------------------- BANDIDOS (4 variações) -------------------------
  const THUGS = [
    // 1) capuz azul-marinho com estrela magenta
    () => wrap(`${shadow()}
      ${legs('#14183a', '#0b1030')}
      ${armLeft('#1d2247', '#f0c7a2')}${armRight('#1d2247', '#f0c7a2')}
      ${torso('#1d2247')}
      <path d="M31 38 l2 5 5 .5 -4 3.4 1.2 5 -4.2 -2.8 -4.2 2.8 1.2 -5 -4 -3.4 5 -.5z" fill="#ff4d96"/>
      <path d="M16 24 C14 5 48 5 46 24 C46 35 40 37 31 37 C22 37 16 35 16 24Z" fill="#242a52" ${stroke()}/>
      <ellipse cx="31" cy="23" rx="10.5" ry="9.5" fill="${SKIN}" ${stroke(1.5)}/>
      ${eyes(true)}
      <path d="M25 29 q6 4 12 0" fill="none" ${stroke(1.6)}/>
      ${bag}`),

    // 2) gorro roxo, máscara de olhos e camisa listrada
    () => wrap(`${shadow()}
      ${legs('#2b2f55', '#0b1030')}
      ${armLeft('#2a2142', SKIN)}${armRight('#2a2142', SKIN)}
      <rect x="18" y="33" width="26" height="26" rx="9" fill="#e9e6ff" ${stroke()}/>
      <path d="M18 41 h26 M18 48 h26 M18 55 h26" stroke="#3b2a78" stroke-width="3.4" fill="none"/>
      <circle cx="31" cy="21" r="13" fill="${SKIN}" ${stroke()}/>
      <rect x="19" y="18" width="24" height="8" rx="3.5" fill="#10152e"/>
      <g class="eyes"><ellipse cx="26" cy="22" rx="2.8" ry="2.4" fill="#fff"/><ellipse cx="36" cy="22" rx="2.8" ry="2.4" fill="#fff"/>
        <circle cx="26.5" cy="22.2" r="1.2" fill="${OUT}"/><circle cx="35.5" cy="22.2" r="1.2" fill="${OUT}"/></g>
      <path d="M26 30 q5 3 10 0" fill="none" ${stroke(1.6)}/>
      <path d="M17 17 C17 4 45 4 45 17 Z" fill="#6a2dd8" ${stroke()}/>
      <rect x="16" y="14" width="30" height="5.5" rx="2.7" fill="#8a52f0" ${stroke()}/>
      <circle cx="31" cy="5" r="3.2" fill="#8a52f0" ${stroke()}/>
      ${bag}`),

    // 3) boné vermelho, óculos escuros e bandana
    () => wrap(`${shadow()}
      ${legs('#2a3157', '#0b1030')}
      ${armLeft('#243a6b', SKIN)}${armRight('#243a6b', SKIN)}
      ${torso('#243a6b')}
      <rect x="27" y="34" width="8" height="22" rx="2" fill="#e63950" opacity=".85"/>
      <circle cx="31" cy="21" r="13" fill="${SKIN}" ${stroke()}/>
      <path d="M17 17 C17 4 45 4 45 17 Z" fill="#e63950" ${stroke()}/>
      <path d="M31 15 h18 q3 0 3 3.2 h-21z" fill="#b82a40" ${stroke()}/>
      <g class="eyes"><rect x="19" y="19" width="11" height="6.5" rx="2.4" fill="#10152e" ${stroke(1)}/><rect x="32" y="19" width="11" height="6.5" rx="2.4" fill="#10152e" ${stroke(1)}/>
        <rect x="29" y="21" width="4" height="2" fill="#10152e"/><path d="M21 21 l3 0 M34 21 l3 0" stroke="#7fd7ff" stroke-width="1.2"/></g>
      <path d="M18 27 Q31 41 44 27 L41.5 24 Q31 34 20.5 24Z" fill="#ff9d2e" ${stroke()}/>
      ${bag}`),

    // 4) ninja de faixa magenta com pé de cabra
    () => wrap(`${shadow()}
      ${legs('#171b3b', '#0b1030')}
      ${armLeft('#171b3b', '#171b3b')}${armRight('#171b3b', '#171b3b')}
      ${torso('#171b3b')}
      <path d="M22 40 L40 52 M40 40 L22 52" stroke="#ff4d96" stroke-width="2.4" fill="none"/>
      <circle cx="31" cy="21" r="13" fill="#1a2040" ${stroke()}/>
      <rect x="19" y="18" width="24" height="9" rx="4.5" fill="${SKIN}" ${stroke(1)}/>
      ${eyes(true)}
      <rect x="17" y="12" width="28" height="5.5" rx="2.5" fill="#ff4d96" ${stroke()}/>
      <path d="M45 13 q8 -2 9 5 q-6 -2 -9 -1z M45 16 q9 2 8 8 q-5 -4 -8 -5z" fill="#ff4d96" ${stroke(1.4)}/>
      <g class="prop"><path d="M45 58 L56 40" fill="none" stroke="#cfd3ea" stroke-width="3.2" stroke-linecap="round"/><path d="M56 40 q3 -3 4 1" fill="none" stroke="#cfd3ea" stroke-width="3" stroke-linecap="round"/></g>`)
  ];

  // ------------------------- ROBÔ DOURADO (50 pontos) -------------------------
  function gold() {
    const g = `g${++uid}`;
    const defs = `<linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="#ffc83d"/><stop offset="1" stop-color="#d9822b"/></linearGradient>`;
    const fill = `url(#${g})`;
    const star = (x, y, s, delay) =>
      `<path class="spark" style="--s:${delay}s" d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3}Z" fill="#fffbe0"/>`;
    return wrap(`${shadow()}
      <g class="legs">
        <rect x="21" y="56" width="9" height="19" rx="3" fill="${fill}" ${stroke()}/><rect x="32" y="56" width="9" height="19" rx="3" fill="${fill}" ${stroke()}/>
        <rect x="18" y="71" width="13" height="7" rx="3" fill="#8a5a1b" ${stroke()}/><rect x="31" y="71" width="13" height="7" rx="3" fill="#8a5a1b" ${stroke()}/>
      </g>
      <g class="arm-l"><rect x="9" y="36" width="8" height="20" rx="3" fill="${fill}" ${stroke()}/><circle cx="13" cy="58" r="5" fill="#8a5a1b" ${stroke()}/></g>
      <g class="arm-r"><rect x="45" y="36" width="8" height="20" rx="3" fill="${fill}" ${stroke()}/><circle cx="49" cy="58" r="5" fill="#8a5a1b" ${stroke()}/></g>
      <rect x="17" y="33" width="28" height="25" rx="7" fill="${fill}" ${stroke()}/>
      <circle cx="31" cy="46" r="7" fill="#fff7c4" ${stroke()}/>
      <path d="M31 40 v12 M25 46 h12 M27 42 l8 8 M35 42 l-8 8" stroke="#d9822b" stroke-width="1.6"/>
      <path d="M31 8 V1" ${stroke(2)}/><circle class="spark" style="--s:.2s" cx="31" cy="0.5" r="3" fill="#ff4d6a" ${stroke(1.4)}/>
      <rect x="15" y="7" width="32" height="25" rx="9" fill="${fill}" ${stroke()}/>
      <rect x="19" y="14" width="24" height="10" rx="4.5" fill="#12091f"/>
      <g class="eyes"><circle cx="26" cy="19" r="3.3" fill="#ff4d6a"/><circle cx="36" cy="19" r="3.3" fill="#ff4d6a"/>
        <circle cx="26.8" cy="18.2" r="1" fill="#fff"/><circle cx="36.8" cy="18.2" r="1" fill="#fff"/></g>
      <path d="M24 28 h14" stroke="${OUT}" stroke-width="2"/>
      ${star(10, 12, 4.5, 0)}${star(53, 30, 5, 0.4)}${star(50, 8, 3.6, 0.8)}${star(12, 44, 3.6, 0.6)}`, defs);
  }

  // ------------------------- CIVIL SIMPÁTICO (não atirar!) -------------------------
  function civil() {
    const skin = pick(['#f6d1b0', '#e0a878', '#a8714a', '#7a4a2c']);
    const shirt = pick(['#ffffff', '#ffe27a', '#7ee6c9', '#8fd0ff']);
    const pants = pick(['#4b78c9', '#6a5acd', '#3d8f7a']);
    const style = pick(['hair', 'hardhat', 'glasses', 'kid']);

    const head = {
      hair: `<circle cx="31" cy="21" r="13" fill="${skin}" ${stroke()}/>
             <path d="M17 20 C15 5 47 5 45 20 C42 13 34 11 31 11 C26 11 20 13 17 20Z" fill="#5a3418" ${stroke()}/>`,
      hardhat: `<circle cx="31" cy="21" r="13" fill="${skin}" ${stroke()}/>
             <path d="M17 17 C17 3 45 3 45 17Z" fill="#ffd34d" ${stroke()}/><rect x="14" y="15" width="34" height="4.5" rx="2.2" fill="#f2b705" ${stroke()}/>`,
      glasses: `<circle cx="31" cy="21" r="13" fill="${skin}" ${stroke()}/>
             <path d="M18 17 C20 8 42 8 44 17 C40 13 22 13 18 17Z" fill="#3a3a4a" ${stroke()}/>
             <circle cx="26" cy="22" r="4.6" fill="none" ${stroke(1.4)}/><circle cx="36" cy="22" r="4.6" fill="none" ${stroke(1.4)}/><path d="M30.6 22 h.8" ${stroke(1.4)}/>`,
      kid: `<circle cx="31" cy="21" r="13" fill="${skin}" ${stroke()}/>
             <path d="M17 17 C17 4 45 4 45 17Z" fill="#3b82f6" ${stroke()}/><path d="M31 15 h17 q2.5 0 2.5 3 h-19.500z" fill="#2563eb" ${stroke()}/>`
    }[style];

    const faceEyes = style === 'glasses' ? '' :
      `<g class="eyes"><ellipse cx="26" cy="22" rx="2.2" ry="2.6" fill="${OUT}"/><ellipse cx="36" cy="22" rx="2.2" ry="2.6" fill="${OUT}"/>
         <circle cx="25.4" cy="21.2" r=".8" fill="#fff"/><circle cx="35.4" cy="21.2" r=".8" fill="#fff"/></g>`;
    const glassEyes = style === 'glasses'
      ? `<g class="eyes"><circle cx="26" cy="22" r="1.8" fill="${OUT}"/><circle cx="36" cy="22" r="1.8" fill="${OUT}"/></g>` : '';

    return wrap(`${shadow()}
      ${legs(pants, '#2a2f55')}
      <g transform="rotate(158 14.5 38)"><g class="wave-l"><rect x="10" y="36" width="9" height="20" rx="4.5" fill="${shirt}" ${stroke()}/><circle cx="14.5" cy="57" r="4.5" fill="${skin}" ${stroke()}/></g></g>
      <g transform="rotate(-158 47.5 38)"><g class="wave-r"><rect x="43" y="36" width="9" height="20" rx="4.5" fill="${shirt}" ${stroke()}/><circle cx="47.5" cy="57" r="4.5" fill="${skin}" ${stroke()}/></g></g>
      ${torso(shirt)}
      ${style === 'glasses' ? `<path d="M31 33 l-3 5 3 3 3 -3z" fill="#e63950" ${stroke(1.4)}/>` : `<circle cx="31" cy="45" r="3" fill="#ff7aa2"/>`}
      ${head}${faceEyes}${glassEyes}
      <path d="M26 28 q5 5 10 0" fill="none" ${stroke(1.6)}/>
      <circle cx="22" cy="27" r="2.2" fill="#ff7aa2" opacity=".55"/><circle cx="40" cy="27" r="2.2" fill="#ff7aa2" opacity=".55"/>
      <g class="bubble"><path d="M2 2 h17 a3 3 0 0 1 3 3 v9 a3 3 0 0 1 -3 3 h-5 l-3.5 5 -.5 -5 h-8 a3 3 0 0 1 -3 -3 v-9 a3 3 0 0 1 3 -3z" fill="#fff" ${stroke(1.6)}/>
        <rect x="9" y="5" width="3.2" height="7" rx="1.6" fill="#e63950"/><circle cx="10.6" cy="15" r="1.7" fill="#e63950"/></g>`);
  }

  // ------------------------- RELÓGIO VOADOR (+3 s) -------------------------
  function clock() {
    const ticks = Array.from({ length: 12 }, (_, i) => {
      const a = (i * 30 * Math.PI) / 180;
      const long = i % 3 === 0;
      const r1 = long ? 11.5 : 13, r2 = 15;
      return `<line x1="${(31 + Math.sin(a) * r1).toFixed(1)}" y1="${(44 - Math.cos(a) * r1).toFixed(1)}" x2="${(31 + Math.sin(a) * r2).toFixed(1)}" y2="${(44 - Math.cos(a) * r2).toFixed(1)}" stroke="${OUT}" stroke-width="${long ? 2 : 1.2}"/>`;
    }).join('');
    return wrap(`<ellipse cx="31" cy="78" rx="11" ry="2.6" fill="#000" opacity=".22"/>
      <g class="wing-l"><ellipse cx="9" cy="42" rx="9" ry="5" fill="#fff" ${stroke(1.6)} transform="rotate(-18 9 42)"/><path d="M3 41 q5 -2 9 1" fill="none" stroke="#bfe9ff" stroke-width="1.2"/></g>
      <g class="wing-r"><ellipse cx="53" cy="42" rx="9" ry="5" fill="#fff" ${stroke(1.6)} transform="rotate(18 53 42)"/><path d="M59 41 q-5 -2 -9 1" fill="none" stroke="#bfe9ff" stroke-width="1.2"/></g>
      <circle cx="19" cy="26" r="5.5" fill="#38bdf8" ${stroke()}/><circle cx="43" cy="26" r="5.5" fill="#38bdf8" ${stroke()}/>
      <rect x="29" y="21" width="4" height="5" rx="1.5" fill="#bfe9ff" ${stroke(1.4)}/>
      <rect x="23" y="58" width="5" height="9" rx="2.5" fill="#38bdf8" ${stroke(1.6)}/><rect x="34" y="58" width="5" height="9" rx="2.5" fill="#38bdf8" ${stroke(1.6)}/>
      <circle cx="31" cy="44" r="18" fill="#fff" ${stroke(2.4)}/>
      <circle cx="31" cy="44" r="15.5" fill="none" stroke="#38bdf8" stroke-width="1.4"/>
      ${ticks}
      <line class="hand-h" x1="31" y1="44" x2="31" y2="34" stroke="${OUT}" stroke-width="2.6" stroke-linecap="round"/>
      <line class="hand-m" x1="31" y1="44" x2="31" y2="30" stroke="#e63950" stroke-width="1.8" stroke-linecap="round"/>
      <circle cx="31" cy="44" r="2.2" fill="${OUT}"/>
      <g class="eyes"><circle cx="25" cy="50" r="1.5" fill="${OUT}"/><circle cx="37" cy="50" r="1.5" fill="${OUT}"/></g>`);
  }

  // ------------------------- CHEFE (mecha) -------------------------
  function boss() {
    return wrap(`${shadow(0.45)}
      <path d="M9 36 L53 36 L59 77 L3 77Z" fill="#4a1d6b" ${stroke()}/>
      <g class="legs"><rect x="19" y="56" width="10" height="20" rx="3" fill="#2b2552" ${stroke()}/><rect x="33" y="56" width="10" height="20" rx="3" fill="#2b2552" ${stroke()}/>
        <rect x="16" y="71" width="14" height="7" rx="3" fill="#161033" ${stroke()}/><rect x="32" y="71" width="14" height="7" rx="3" fill="#161033" ${stroke()}/></g>
      <g class="arm-l"><rect x="3" y="38" width="9" height="19" rx="3.5" fill="#3a2f66" ${stroke()}/><circle cx="7.5" cy="58" r="5.5" fill="#161033" ${stroke()}/></g>
      <g class="arm-r"><rect x="50" y="38" width="9" height="19" rx="3.5" fill="#3a2f66" ${stroke()}/><circle cx="54.5" cy="58" r="5.5" fill="#161033" ${stroke()}/></g>
      <rect x="13" y="32" width="36" height="27" rx="7" fill="#3a2f66" ${stroke()}/>
      <circle class="reactor" cx="31" cy="46" r="7" fill="#ff4d6a" ${stroke()}/><circle cx="31" cy="46" r="3" fill="#ffd1da"/>
      <path d="M7 31 L12 20 L15 31Z" fill="#dfe2ff" ${stroke(1.6)}/><path d="M55 31 L50 20 L47 31Z" fill="#dfe2ff" ${stroke(1.6)}/>
      <circle cx="12" cy="36" r="7.5" fill="#5b4b9c" ${stroke()}/><circle cx="50" cy="36" r="7.5" fill="#5b4b9c" ${stroke()}/>
      <path d="M17 12 L9 -1 L23 7Z" fill="#dfe2ff" ${stroke(1.6)}/><path d="M45 12 L53 -1 L39 7Z" fill="#dfe2ff" ${stroke(1.6)}/>
      <rect x="14" y="5" width="34" height="27" rx="8" fill="#2b2552" ${stroke()}/>
      <rect x="18" y="13" width="26" height="10" rx="4" fill="#12091f"/>
      <g class="boss-eyes"><path d="M20 15.5 L29 19 L20 22Z" fill="#ff3d5e"/><path d="M42 15.5 L33 19 L42 22Z" fill="#ff3d5e"/></g>
      <rect x="21" y="26" width="20" height="4.5" rx="1.5" fill="#0f0a1c"/><path d="M25 26 v4.5 M29 26 v4.5 M33 26 v4.5 M37 26 v4.5" stroke="#dfe2ff" stroke-width="1"/>`);
  }

  return {
    render(kind) {
      switch (kind) {
        case 'gold': return gold();
        case 'civil': return civil();
        case 'clock': return clock();
        case 'boss': return boss();
        default: return pick(THUGS)();
      }
    },
    thugVariants: THUGS.length
  };
})();
