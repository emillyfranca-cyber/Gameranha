// Efeitos sonoros gerados com Web Audio (sem arquivos de áudio).

const Sfx = (() => {
  let ctx = null;
  let muted = store.get('webHeroMuted', false);

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ f = 440, f2 = null, dur = 0.1, type = 'square', vol = 0.12, delay = 0 }) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, t);
    if (f2) osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  const arpeggio = (notes, step = 0.09, opts = {}) =>
    notes.forEach((f, i) => tone({ f, dur: step * 1.4, delay: i * step, ...opts }));

  const sounds = {
    shot:     () => tone({ f: 900, f2: 280, dur: 0.09, type: 'sawtooth', vol: 0.08 }),
    hit:      () => { tone({ f: 700, dur: 0.06 }); tone({ f: 1100, dur: 0.09, delay: 0.06 }); },
    gold:     () => arpeggio([880, 1175, 1568], 0.06),
    combo:    () => arpeggio([660, 880, 1320], 0.05, { type: 'triangle', vol: 0.16 }),
    miss:     () => tone({ f: 220, f2: 120, dur: 0.14, type: 'triangle', vol: 0.14 }),
    penalty:  () => tone({ f: 180, f2: 60, dur: 0.35, type: 'sawtooth', vol: 0.15 }),
    clock:    () => arpeggio([523, 784, 1046], 0.06, { type: 'triangle' }),
    boss:     () => { tone({ f: 110, f2: 70, dur: 0.6, type: 'sawtooth', vol: 0.18 }); tone({ f: 165, f2: 90, dur: 0.6, type: 'square', vol: 0.08 }); },
    bosshit:  () => tone({ f: 300, f2: 140, dur: 0.12, type: 'sawtooth', vol: 0.14 }),
    bossdown: () => arpeggio([392, 523, 659, 784, 1046], 0.08, { type: 'square', vol: 0.14 }),
    level:    () => arpeggio([523, 659, 784, 1046], 0.09),
    count:    () => tone({ f: 620, dur: 0.1, type: 'triangle', vol: 0.14 }),
    go:       () => tone({ f: 1240, dur: 0.3, type: 'square', vol: 0.14 }),
    end:      () => arpeggio([784, 659, 523, 392], 0.13, { type: 'triangle', vol: 0.16 }),
    record:   () => arpeggio([523, 659, 784, 1046, 1318, 1568], 0.09, { vol: 0.14 })
  };

  return {
    play(name) {
      try { sounds[name]?.(); } catch (_) { /* áudio nunca pode derrubar o jogo */ }
    },
    toggle() {
      muted = !muted;
      store.set('webHeroMuted', muted);
      return muted;
    },
    get muted() { return muted; }
  };
})();
