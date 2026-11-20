(() => {
'use strict';

/* ---------- Utilitaires ---------- */
const TAU = Math.PI * 2;
const SPEED = 84;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return n >>> 0; }
const hrand = n => hash(n) / 4294967296;
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgba(h, a) { const [r, g, b] = hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }
function mix(h1, h2, t) { const a = hexToRgb(h1), b = hexToRgb(h2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], t)).toString(16).padStart(2, '0')).join(''); }
const $ = id => document.getElementById(id);
const vib = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };
const REDUCED = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
const FX = REDUCED ? 0.4 : 1;

/* ---------- Factions et installations ---------- */
const FAC = [
  { col: '#7f7f8a' },  // neutre (gris plus sombre et moins bleu : se distingue mieux du cyan)
  { col: '#7fe0ff' },  // toi
  { col: '#ff6a5c' },  // corail
  { col: '#ffc24a' },  // or
  { col: '#c983ff' },  // orchidée
];
FAC.forEach(f => { f.light = mix(f.col, '#ffffff', 0.55); f.dark = mix(f.col, '#06041a', 0.6); });

const T = {
  home:    { r: 30, prod: 1.45, cap: 50, ct: 12 },
  star:    { r: 23, prod: 0.85, cap: 30, ct: 6 },
  outpost: { r: 15, prod: 0.4,  cap: 14, ct: 2.8 },
  forge:   { r: 33, prod: 1.8,  cap: 60, ct: 11 },
  bastion: { r: 21, prod: 0.2,  cap: 10, ct: 8, range: 155, rate: 2.2 },
  relay:   { r: 20, prod: 0.3,  cap: 12, ct: 5 },
  mother:  { r: 38, prod: 1.6,  cap: 70, ct: 14, range: 120, rate: 1.2 },
};

/* ---------- Variantes, caractères, boss (niveau 11+) ---------- */
const FNAME = ['', '', 'Corail', 'Or', 'Orchidée'];
const MODS = { hole: 'Trou noir au centre.', storm: 'Tempête au centre.', rich: 'Production accrue.' };
const PERS = {
  rush:   { n: ['fonceur', 'fonceuse'], aiInterval: 0.7, aggr: 1.3, margin: 1, defend: 0.8 },
  turtle: { n: ['prudent', 'prudente'], aiInterval: 1.15, aggr: 0.5, margin: 1.15, defend: 1.4 },
  opp:    { n: ['opportuniste', 'opportuniste'], aiInterval: 1, aggr: 1, margin: 1, defend: 1, opp: true },
};
// Tirages séparés de makeParams pour ne décaler aucune carte existante.
function addVariants(P) {
  P.mods = []; P.persona = {};
  // Deux bases suffisent comme avantage : pas de bonus de production, moins de vaisseaux au départ.
  if (P.extraEnemyHome) { P.enemyProd = 1; P.enemyStart = Math.round(P.enemyStart * 0.7); }
  if (P.L < 11) return P;
  const r = mulberry32(hash(P.L * 31337 + 5));
  const x = r();
  if (!P.boss) {
    if (x < 0.3) P.mods.push('hole'); else if (x < 0.6) P.mods.push('storm'); else if (x < 0.8) P.mods.push('rich');
    if (P.L >= 16 && r() < 0.35) P.mods.push(P.mods[0] === 'rich' ? (r() < 0.5 ? 'hole' : 'storm') : 'rich');
  }
  P.rich = P.mods.includes('rich');
  const ks = Object.keys(PERS);
  for (let f = 2; f <= P.enemies + 1; f++) P.persona[f] = ks[(r() * ks.length) | 0];
  return P;
}
function aiParams(P, f) {
  const m = PERS[P.persona && P.persona[f]]; if (!m) return null;
  return Object.assign({}, P, { aiInterval: P.aiInterval * m.aiInterval, aggr: Math.min(1, P.aggr * m.aggr), margin: P.margin * m.margin, defend: P.defend * m.defend, opp: !!m.opp });
}
// Coût d'un trajet pour l'IA : infini à travers le trou noir, rallongé dans la tempête.
function segD(a, b, c) {
  const dx = b.x - a.x, dy = b.y - a.y, u = clamp(((c.x - a.x) * dx + (c.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a.x + dx * u - c.x, a.y + dy * u - c.y);
}
function route(a, b) {
  if (G.hole && segD(a, b, G.hole) < G.hole.r + 22) return Infinity;
  const d = dist(a, b);
  return G.storm && segD(a, b, G.storm) < G.storm.r ? d * 1.7 : d;
}

const CARDS = {
  outpost: { t: 'Satellite', s: 'Petit et vite capturé. Il produit peu, mais chaque capture augmente ta flotte maximale.' },
  forge:   { t: 'Chantier orbital', s: 'Produit deux fois plus qu’une planète. Sa capture est longue : garde assez de vaisseaux sur place.' },
  relay:   { t: 'Relais', s: 'Les vaisseaux qui partent d’un relais que tu contrôles voyagent deux fois plus vite. Idéal pour frapper loin.' },
  bastion: { t: 'Bastion', s: 'Une fois capturé, il abat les vaisseaux ennemis à portée, en vol comme en orbite. Neutre, il reste inactif.' },
  garrison:{ t: 'Garnisons', s: 'Certaines planètes et installations neutres sont gardées. Envoie plus de vaisseaux que la garnison pour les capturer.' },
  hole:    { t: 'Trou noir', s: 'Tout vaisseau qui passe trop près du centre est englouti. Contourne-le en faisant escale ailleurs.', type: 'star', draw: (c, t) => drawHole(c, 0, 0, 30, t) },
  storm:   { t: 'Tempête', s: 'Au centre, une tempête ralentit beaucoup les vaisseaux. Un détour est parfois plus rapide.', type: 'star', draw: (c, t) => drawStorm(c, 0, 0, 48, t) },
  rich:    { t: 'Abondance', s: 'Tout produit plus vite, chez toi comme chez l’ennemi. La partie s’emballe : attaque tôt.', type: 'star' },
  persona: { t: 'Caractères', s: 'Chaque adversaire a son style. Le fonceur attaque sans cesse, le prudent se défend, l’opportuniste frappe les plus faibles.', type: 'home', owner: 2 },
  boss:    { t: 'Boss', s: 'Un vaisseau-mère. Il produit beaucoup et abat les vaisseaux à portée. Frappe-le d’un seul coup, avec une grosse vague.', type: 'mother', owner: 2 },
};

/* ---------- Sauvegarde ---------- */
const SAVE_KEY = 'orbis.v1';
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
// stars/times : meilleur résultat par niveau ; daily : défi du jour réussi ; fail : défaites d'affilée au même niveau.
const save = Object.assign({ level: 1, best: 1, pct: 0.5, muted: false, speed: 1, seen: {}, stars: {}, times: {}, daily: null, fail: null }, load());
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ---------- Son (synthétisé) ---------- */
const Snd = {
  ac: null, out: null, nb: null, last: {},
  ensure() {
    if (this.ac) { this.wake(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain(); this.out.gain.value = save.muted ? 0 : 0.55;
      const comp = this.ac.createDynamicsCompressor();
      this.out.connect(comp); comp.connect(this.ac.destination);
      this.ambient();
      if (save.muted) this.ac.suspend();
    } catch (e) { this.ac = null; }
  },
  // Contexte suspendu quand le son est coupé ou l'app cachée : le fond sonore ne tourne pas pour rien.
  wake() { if (this.ac && this.ac.state === 'suspended' && !save.muted && !document.hidden) this.ac.resume(); },
  sleep() { if (this.ac && this.ac.state === 'running') this.ac.suspend(); },
  setMuted(m) {
    save.muted = m; persist(); if (!this.out) return;
    this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ac.currentTime, 0.05);
    clearTimeout(this.tm); if (m) this.tm = setTimeout(() => this.sleep(), 300); else this.wake();
  },
  ok(k, ms) { const n = performance.now(); if (this.last[k] && n - this.last[k] < ms) return false; this.last[k] = n; return true; },
  tone(f, d, o = {}) {
    if (!this.ac || save.muted) return;
    const { type = 'sine', v = 0.12, to = null, at = 0 } = o;
    const ac = this.ac, t = ac.currentTime + at, osc = ac.createOscillator(), g = ac.createGain();
    osc.type = type; osc.frequency.setValueAtTime(f, t); if (to) osc.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(this.out); osc.start(t); osc.stop(t + d + 0.05);
  },
  noise(d, o = {}) {
    if (!this.ac || save.muted) return;
    const { v = 0.06, f = 1200, at = 0 } = o, ac = this.ac;
    if (!this.nb) { const b = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate), ch = b.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1; this.nb = b; }
    const t = ac.currentTime + at, s = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = this.nb; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(bp); bp.connect(g); g.connect(this.out); s.start(t); s.stop(t + d + 0.05);
  },
  ambient() {
    const ac = this.ac, g = ac.createGain(), lp = ac.createBiquadFilter();
    g.gain.value = 0.03; lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 2;
    [55, 82.41, 110.3].forEach((fr, i) => { const o = ac.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = fr; o.detune.value = (i - 1) * 6; o.connect(lp); o.start(); });
    const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 0.045; lg.gain.value = 160; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    lp.connect(g); g.connect(this.out);
  },
  send() { if (this.ok('send', 70)) { this.noise(0.28, { v: 0.05, f: 800 }); this.tone(360, 0.2, { type: 'triangle', v: 0.045, to: 640 }); } },
  tap() { if (this.ok('tap', 40)) this.tone(880, 0.07, { v: 0.03 }); },
  capture() { this.tone(659, 0.5, { v: 0.08 }); this.tone(988, 0.6, { v: 0.055, at: 0.07 }); this.tone(1319, 0.8, { v: 0.035, at: 0.14 }); },
  lost() { this.tone(220, 0.7, { type: 'triangle', v: 0.09, to: 130 }); },
  zap() { if (this.ok('zap', 90)) this.tone(1700, 0.08, { type: 'square', v: 0.012, to: 500 }); },
  clash() { if (this.ok('clash', 120)) this.noise(0.09, { v: 0.03, f: 2600 }); },
  win() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.9, { v: 0.06, at: i * 0.1 })); },
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 1, { type: 'triangle', v: 0.06, at: i * 0.17 })); },
};

/* ---------- Sprites ---------- */
// Une seule source de lumière pour toute la scène : en haut à gauche.
const LA = -2.42, LX = Math.cos(LA), LY = Math.sin(LA), INK = '#06041a';
const SPR = { glow: [], dot: [], ship: [], orb: [], atmo: [], ringB: [], ringF: [], shade: null, star: null };
const HULLS = [
  'M28 12 L22 6.5 L13 6.5 L10 12 L13 17.5 L22 17.5 Z',
  'M35 12 L13 3.5 L17 12 L13 20.5 Z',
  'M34 12 L20 6 L11 2.5 L15 9.5 L12 12 L15 14.5 L11 21.5 L20 18 Z',
  'M33 12 L12 1.5 L15.5 8 L11 12 L15.5 16 L12 22.5 Z',
  'M36 12 C30 9 22 9.5 14 10 L11 6 L8.5 6 L11 12 L8.5 18 L11 18 L14 14 C22 14.5 30 15 36 12 Z',
];
function makeHull(i, F) {
  const c = mkCanvas(80, 48), x = c.getContext('2d'); x.scale(2, 2); x.lineJoin = 'round';
  let g = x.createRadialGradient(11, 12, 0, 11, 12, 11);
  g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(0.2, rgba(F.light, 0.8)); g.addColorStop(0.5, rgba(F.col, 0.3)); g.addColorStop(1, rgba(F.col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 24, 24);
  const hull = new Path2D(HULLS[i]);
  x.strokeStyle = rgba(INK, 0.75); x.lineWidth = 2.4; x.stroke(hull);
  g = x.createLinearGradient(0, 3, 0, 21);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, F.light); g.addColorStop(0.5, F.col); g.addColorStop(0.52, mix(F.col, INK, 0.3)); g.addColorStop(1, F.dark);
  x.fillStyle = g; x.fill(hull);
  x.strokeStyle = rgba(F.light, 0.85); x.lineWidth = 0.7; x.stroke(hull);
  x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 0.6; x.beginPath(); x.moveTo(15, 12); x.lineTo(i === 0 ? 24 : 30, 12); x.stroke();
  x.fillStyle = rgba(INK, 0.8); x.beginPath(); x.ellipse(i === 0 ? 20.5 : 25, 12, 3, 1.5, 0, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,.95)'; x.beginPath(); x.ellipse(i === 0 ? 21 : 25.6, 11.7, 2, 0.9, 0, 0, TAU); x.fill();
  return c;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
// Anneau des planètes mères : moitié arrière (PI..TAU) ou avant (0..PI), avec l'ombre portée de la planète.
function makeRing(F, a0, a1) {
  const c = mkCanvas(288, 288), x = c.getContext('2d'), r = mulberry32(77);
  x.translate(144, 144); x.rotate(-0.35);
  x.save(); x.scale(1, 0.27);
  for (let q = 96; q < 127; q += 1.5) {
    const v = r();
    x.strokeStyle = rgba(v > 0.6 ? F.light : F.col, q > 108 && q < 112 ? 0.06 : 0.22 + v * 0.5); x.lineWidth = 1.7;
    x.beginPath(); x.arc(0, 0, q, a0, a1); x.stroke();
  }
  x.strokeStyle = rgba(F.light, 0.9); x.lineWidth = 1.2;
  x.beginPath(); x.arc(0, 0, 95.5, a0, a1); x.stroke(); x.beginPath(); x.arc(0, 0, 127, a0, a1); x.stroke();
  x.restore();
  x.rotate(0.35 + LA + Math.PI); x.globalCompositeOperation = 'destination-out';
  const g = x.createLinearGradient(0, -60, 0, 60);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.3, 'rgba(0,0,0,.8)'); g.addColorStop(0.7, 'rgba(0,0,0,.8)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, -60, 150, 120);
  return c;
}
function buildSprites() {
  FAC.forEach((F, i) => {
    let c = mkCanvas(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, rgba(F.col, 0.85)); g.addColorStop(0.22, rgba(F.col, 0.32)); g.addColorStop(0.55, rgba(F.col, 0.08)); g.addColorStop(1, rgba(F.col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); SPR.glow[i] = c;

    c = mkCanvas(32, 32); x = c.getContext('2d'); g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.16, rgba(F.light, 1)); g.addColorStop(0.34, rgba(F.col, 0.55)); g.addColorStop(1, rgba(F.col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 32, 32); SPR.dot[i] = c;
    SPR.ship[i] = makeHull(i, F);

    c = mkCanvas(128, 128); x = c.getContext('2d');
    g = x.createRadialGradient(64 + LX * 26, 64 + LY * 26, 4, 64, 64, 64);
    g.addColorStop(0, mix(F.col, '#ffffff', 0.8)); g.addColorStop(0.3, mix(F.col, '#ffffff', 0.18));
    g.addColorStop(0.72, mix(F.col, '#100830', 0.45)); g.addColorStop(1, mix(F.col, INK, 0.8));
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 63, 0, TAU); x.fill();
    SPR.orb[i] = c;

    // atmosphère : liseré net + halo à la couleur de la faction, plus vif côté lumière (rayon planète = 61,4)
    c = mkCanvas(176, 176); x = c.getContext('2d'); g = x.createRadialGradient(88, 88, 46, 88, 88, 86);
    g.addColorStop(0, rgba(F.col, 0)); g.addColorStop(0.3, rgba(F.col, 0.3)); g.addColorStop(0.385, rgba(F.light, 1));
    g.addColorStop(0.44, rgba(F.col, 0.6)); g.addColorStop(0.65, rgba(F.col, 0.14)); g.addColorStop(1, rgba(F.col, 0));
    x.fillStyle = g; x.fillRect(0, 0, 176, 176);
    x.globalCompositeOperation = 'destination-in';
    g = x.createLinearGradient(88 + LX * 70, 88 + LY * 70, 88 - LX * 70, 88 - LY * 70);
    g.addColorStop(0, '#000'); g.addColorStop(0.45, 'rgba(0,0,0,.85)'); g.addColorStop(1, 'rgba(0,0,0,.42)');
    x.fillStyle = g; x.fillRect(0, 0, 176, 176); SPR.atmo[i] = c;

    SPR.ringB[i] = makeRing(F, Math.PI, TAU); SPR.ringF[i] = makeRing(F, 0, Math.PI);
  });
  // ombre propre des planètes (terminateur doux + reflet), commune à toutes (rayon planète = 62)
  let c = mkCanvas(128, 128), x = c.getContext('2d');
  let g = x.createRadialGradient(64 + LX * 30, 64 + LY * 30, 4, 64 + LX * 8, 64 + LY * 8, 70);
  g.addColorStop(0, 'rgba(6,4,26,0)'); g.addColorStop(0.5, 'rgba(6,4,26,.04)'); g.addColorStop(0.74, 'rgba(6,4,26,.5)'); g.addColorStop(0.9, 'rgba(6,4,26,.86)'); g.addColorStop(1, 'rgba(6,4,26,.95)');
  x.beginPath(); x.arc(64, 64, 62, 0, TAU); x.fillStyle = g; x.fill();
  g = x.createRadialGradient(64 + LX * 30, 64 + LY * 30, 0, 64 + LX * 30, 64 + LY * 30, 34);
  g.addColorStop(0, 'rgba(255,255,255,.3)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fill(); SPR.shade = c;

  c = mkCanvas(16, 16); x = c.getContext('2d'); g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(220,225,255,.45)'); g.addColorStop(1, 'rgba(200,210,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 16, 16); SPR.star = c;
  SPR.mother = FAC.map(makeMother);
}

/* ---------- Écran ---------- */
const cv = $('c'), ctx = cv.getContext('2d');
const view = { w: 1, h: 1, top: 0, bottom: 0, sc: 1, ox: 0, oy: 0 };
let dpr = 1, BG = null, TW = [];

const G = {
  mode: 'menu', paused: false, demo: true, nodes: [], ships: [], parts: [], W: 560, H: 900, t: 0, P: null,
  sel: new Set(), gest: null, ai: {}, facs: [], tot: [0, 0, 0, 0, 0], cap: [0, 0, 0, 0, 0],
  over: false, cardOpen: false, hudT: 0, checkT: 0, sent: 0, hintStep: 0,
};

function playArea() {
  const playing = G.mode === 'play';
  const top = playing ? $('hud').offsetHeight + 8 : 16;
  const bottom = playing ? $('dock').offsetHeight + 8 : 16;
  return { top, bottom, w: view.w - 16, h: Math.max(80, view.h - top - bottom) };
}
function layout() {
  const a = playArea();
  view.top = a.top; view.bottom = a.bottom;
  view.sc = Math.min(a.w / G.W, a.h / G.H);
  view.ox = (view.w - G.W * view.sc) / 2;
  view.oy = a.top + (a.h - G.H * view.sc) / 2;
}
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  view.w = Math.max(1, document.body.clientWidth); view.h = Math.max(1, document.body.clientHeight);
  cv.width = Math.round(view.w * dpr); cv.height = Math.round(view.h * dpr);
  layout();
  buildBg(G.P ? G.P.seed : 1);
  render();
}

function buildBg(seed) {
  const w = view.w, h = view.h;
  const c = mkCanvas(Math.max(1, Math.round(w * dpr)), Math.max(1, Math.round(h * dpr))), x = c.getContext('2d');
  x.scale(dpr, dpr);
  const r = mulberry32(seed ^ 0x9e3779b9);
  let g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#140e36'); g.addColorStop(0.55, '#0b0822'); g.addColorStop(1, '#070518');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'lighter';
  const hues = [262, 198, 318, 232, 176, 290];
  const h1 = hues[(r() * hues.length) | 0], h2 = hues[(r() * hues.length) | 0];
  for (let i = 0; i < 7; i++) {
    const hx = r() * w, hy = r() * h, rad = (0.3 + r() * 0.6) * Math.max(w, h), hue = i % 2 ? h1 : h2;
    g = x.createRadialGradient(hx, hy, 0, hx, hy, rad);
    g.addColorStop(0, `hsla(${hue},78%,${42 + r() * 14}%,${0.09 + r() * 0.08})`);
    g.addColorStop(0.5, `hsla(${hue},78%,40%,${0.03 + r() * 0.03})`);
    g.addColorStop(1, `hsla(${hue},78%,40%,0)`);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
  }
  // nébuleuse : bruit fractal calculé en basse résolution, puis agrandi (deux teintes, veines de poussière sombre)
  const nw = Math.ceil(w / 4), nh = Math.ceil(h / 4), nc = mkCanvas(nw, nh), nx = nc.getContext('2d'), im = nx.createImageData(nw, nh), d = im.data;
  const pal = [['#6a45e0', '#1fa3c9'], ['#c93f9e', '#3f5bd6'], ['#1fb9a3', '#6a3fd6'], ['#d6703f', '#7a3fd6']][(r() * 4) | 0];
  const A = hexToRgb(pal[0]), B = hexToRgb(pal[1]), o1 = (r() * 64) | 0, o2 = (r() * 64) | 0, sc = 3.4 / Math.max(nw, nh);
  for (let py = 0, i = 0; py < nh; py++) for (let px = 0; px < nw; px++, i += 4) {
    const u = px * sc, v = py * sc, a = fbm(u, v + o1, 5, 64, o1), b = fbm(u + 7.3, v + o2, 4, 64, o2);
    const da = Math.pow(clamp((a - 0.42) * 3.2, 0, 1), 1.6) * 0.2 + Math.pow(1 - Math.abs(a * 2 - 1), 10) * 0.05;
    const db = Math.pow(clamp((b - 0.46) * 3.4, 0, 1), 1.6) * 0.17;
    const k = 1 - clamp((fbm(u * 2, v * 2 + 31, 4, 64, o2 + 11) - 0.5) * 4.5, 0, 0.8);
    d[i] = (A[0] * da + B[0] * db) * k; d[i + 1] = (A[1] * da + B[1] * db) * k; d[i + 2] = (A[2] * da + B[2] * db) * k; d[i + 3] = 255;
  }
  nx.putImageData(im, 0, 0); x.imageSmoothingQuality = 'high'; x.drawImage(nc, 0, 0, w, h);
  const n = Math.round(w * h / 1700);
  for (let i = 0; i < n; i++) {
    const sx = r() * w, sy = r() * h, big = r() > 0.93, s = big ? 0.9 + r() * 0.9 : 0.25 + r() * 0.6, a = 0.25 + r() * 0.6;
    x.fillStyle = r() < 0.16 ? `hsla(${r() < 0.5 ? 205 : 40},90%,86%,${a})` : `rgba(255,255,255,${a})`;
    x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
  }
  for (let i = 0; i < 4; i++) {  // quelques étoiles brillantes, avec halo et aigrettes
    const sx = r() * w, sy = r() * h, s = 0.9 + r() * 1.1, hue = r() < 0.5 ? 210 : 35;
    g = x.createRadialGradient(sx, sy, 0, sx, sy, s * 8);
    g.addColorStop(0, `hsla(${hue},90%,90%,.55)`); g.addColorStop(0.25, `hsla(${hue},90%,75%,.12)`); g.addColorStop(1, `hsla(${hue},90%,70%,0)`);
    x.fillStyle = g; x.fillRect(sx - s * 8, sy - s * 8, s * 16, s * 16);
    x.strokeStyle = `hsla(${hue},90%,92%,.28)`; x.lineWidth = 0.6;
    x.beginPath(); x.moveTo(sx - s * 9, sy); x.lineTo(sx + s * 9, sy); x.moveTo(sx, sy - s * 9); x.lineTo(sx, sy + s * 9); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(3,2,12,.62)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  BG = c;
  TW = [];
  for (let i = 0; i < Math.round(n / 9 * FX); i++) TW.push({ x: r() * w, y: r() * h, p: r() * TAU, s: 0.5 + r() * 1.6, z: 0.7 + r() * 1.3 });
}

/* ---------- Niveaux ---------- */
function makeParams(L) {
  const r = mulberry32(hash(L * 7919 + 13));
  const t = 1 - 1 / (1 + (L - 1) / 9);
  const boss = L >= 10 && L % 10 === 0;
  const breather = L > 4 && L % 5 === 0 && !boss;
  const d = breather ? t * 0.55 : boss ? t * 0.8 : t;
  let enemies = 1;
  if (L === 6) enemies = 2;
  else if (L > 6) {
    const x = r();
    enemies = L < 12 ? (x < 0.4 ? 2 : 1) : L < 20 ? (x < 0.45 ? 2 : x < 0.62 ? 3 : 1) : (x < 0.4 ? 2 : x < 0.72 ? 3 : 1);
  }
  const types = ['star'];
  if (L >= 2) types.push('outpost');
  if (L >= 4) types.push('forge');
  if (L >= 5) types.push('relay');
  if (L >= 7) types.push('bastion');
  return addVariants({
    L, d, enemies, types, breather, boss,
    garrison: L >= 10,
    nodeCount: clamp(Math.round(5 + L * 0.42 + r() * 3) + (enemies - 1) * 2, 6, 22),
    seed: hash(L * 104729 + 7),
    aiInterval: lerp(3.8, 1.15, d),
    aiDelay: lerp(4.5, 1.6, d),
    aggr: lerp(0.3, 0.92, d),
    margin: lerp(1.55, 1.15, d),
    defend: lerp(0.2, 0.95, d),
    maxMoves: d < 0.3 ? 1 : d < 0.6 ? 2 : 3,
    noise: lerp(0.65, 0.15, d),
    playerStart: 30,
    // 1 contre 1 : l'ennemi n'a personne d'autre à combattre, ses bonus sont plus faibles (sinon mur dès le niveau 9).
    enemyStart: Math.round(lerp(10, enemies === 1 ? 34 : 44, d)),
    enemyProd: 1 + d * (enemies === 1 ? 0.1 : 0.19),
    extraEnemyHome: L >= 9 && enemies === 1 && r() < 0.1 + d * 0.15 && !breather && L >= 12,
    extraPlayerHome: enemies >= 3 || (enemies === 2 && r() < 0.5),
  });
}

function genLevel(P, aspect) {
  const rnd = mulberry32(P.seed);
  const S = 560, a = clamp(aspect, 0.5, 1.9);
  let W, H; if (a < 1) { W = S; H = S / a; } else { H = S; W = S * a; }
  const portrait = H >= W, M = 38, cx = W / 2, cy = H / 2;
  const nodes = [];
  const mk = (type, x, y, owner = 0, ships = 0) => {
    const n = { id: nodes.length, type, x, y, r: T[type].r, owner, ships: [0, 0, 0, 0, 0], dmg: [0, 0, 0, 0, 0], hp: owner ? 1 : 0, capF: 0, capP: 0, acc: rnd(), pulse: 0, flash: 0, cool: 0.5, aim: -Math.PI / 2, rot: rnd() * TAU, fight: 0, moon: rnd() < 0.45 };
    n.ships[owner] += ships; nodes.push(n); return n;
  };
  const fits = (x, y, r, gap = 56) => {
    if (x < M + r || x > W - M - r || y < M + r || y > H - M - r) return false;
    if (P.mods.includes('hole') && Math.hypot(cx - x, cy - y) < r + 30 + gap) return false;
    for (const n of nodes) if (Math.hypot(n.x - x, n.y - y) < n.r + r + gap) return false;
    return true;
  };
  const W8 = { star: 5, outpost: 3.2, forge: 1.6, bastion: 0.9, relay: 1.1 };
  let bastions = 0;
  const pick = () => {
    let tot = 0; for (const k of P.types) tot += W8[k];
    let v = rnd() * tot, res = 'star';
    for (const k of P.types) { v -= W8[k]; if (v <= 0) { res = k; break; } }
    if (res === 'bastion' && bastions >= 2) res = 'star';
    if (res === 'bastion') bastions++;
    return res;
  };
  const garr = type => (!P.garrison || rnd() > 0.6) ? 0 : Math.max(1, Math.round(T[type].cap * lerp(0.12, 0.5, P.d) * (0.5 + rnd() * 0.7)));
  const near = (h, minD, maxD) => {
    const base = Math.atan2(cy - h.y, cx - h.x), ang = base + (rnd() - 0.5) * 2.4, d = lerp(minD, maxD, rnd());
    return [h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d];
  };
  const placePair = (type, home, minD, maxD) => {
    const r = T[type].r;
    for (let k = 0; k < 400; k++) {
      const [x, y] = home ? near(home, minD, maxD) : [M + rnd() * (W - 2 * M), M + rnd() * (H - 2 * M)];
      const mx = W - x, my = H - y;
      if (Math.hypot(mx - x, my - y) < 2 * r + 56) continue;
      if (!fits(x, y, r)) continue;
      const A = mk(type, x, y);
      if (!fits(mx, my, r)) { nodes.pop(); continue; }
      return [A, mk(type, mx, my)];
    }
    return null;
  };
  const placeOne = (type, home, minD, maxD) => {
    for (let k = 0; k < 300; k++) {
      const [x, y] = home ? near(home, minD, maxD) : [M + rnd() * (W - 2 * M), M + rnd() * (H - 2 * M)];
      if (fits(x, y, T[type].r)) return mk(type, x, y);
    }
    return null;
  };
  const small = P.types.includes('outpost') ? 'outpost' : 'star';

  if (P.enemies === 1) {
    const px = portrait ? cx + (rnd() - 0.5) * W * 0.3 : M + 52;
    const py = portrait ? H - M - 52 : cy + (rnd() - 0.5) * H * 0.3;
    const hp = mk('home', px, py, 1, P.playerStart);
    mk('home', W - px, H - py, 2, P.enemyStart);
    placePair('star', hp, 115, 175);
    placePair(small, hp, 105, 190);
    if (P.extraEnemyHome) {
      const pr = placePair('star', hp, 140, 230);
      if (pr) { const b = pr[1]; b.owner = 2; b.hp = 1; b.ships[2] = Math.round(P.enemyStart * 0.5); }
    }
    if (rnd() < 0.6) {
      const ct = P.types.includes('forge') && rnd() < 0.5 ? 'forge' : P.types.includes('bastion') && rnd() < 0.45 ? 'bastion' : 'star';
      if (fits(cx, cy, T[ct].r)) { const n = mk(ct, cx, cy); n.ships[0] = garr(ct); if (ct === 'bastion') bastions++; }
    }
    let guard = 0;
    while (nodes.length < P.nodeCount && guard++ < 80) {
      const t = pick(), pr = placePair(t, null);
      if (pr) { const g = garr(t); pr[0].ships[0] = g; pr[1].ships[0] = g; } else if (t === 'bastion') bastions--;
    }
  } else {
    const E = P.enemies, rx = W / 2 - M - 50, ry = H / 2 - M - 50;
    const base = portrait ? Math.PI / 2 : Math.PI;
    const homes = [];
    for (let k = 0; k <= E; k++) {
      const ang = base + k * TAU / (E + 1);
      homes.push(mk('home', cx + Math.cos(ang) * rx, cy + Math.sin(ang) * ry, k + 1, k === 0 ? P.playerStart : P.enemyStart));
    }
    for (const h of homes) { placeOne('star', h, 110, 165); placeOne(small, h, 100, 180); }
    if (P.extraPlayerHome) { const n = placeOne('star', homes[0], 120, 200); if (n) { n.owner = 1; n.hp = 1; n.ships[1] = 14; } }
    let guard = 0;
    while (nodes.length < P.nodeCount && guard++ < 120) {
      const t = pick(), n = placeOne(t, null);
      if (n) n.ships[0] = garr(t); else if (t === 'bastion') bastions--;
    }
  }
  return { W, H, nodes };
}

function buildWorld(P, demo) {
  G.P = P; G.demo = demo; G.t = 0; G.ships = []; G.parts = []; G.over = false; G.sel = new Set(); G.gest = null;
  G.checkT = 0; G.hudT = 0; G.sent = 0; G.lost = false;
  G.facs = []; for (let f = 1; f <= P.enemies + 1; f++) G.facs.push(f);
  G.ai = {}; for (const f of G.facs) if (f !== 1 || demo) G.ai[f] = { t: P.aiDelay * (0.8 + Math.random() * 0.4), p: aiParams(P, f) };
  const a = playArea();
  const L = genLevel(P, a.w / a.h);
  G.W = L.W; G.H = L.H; G.nodes = L.nodes;
  G.hole = P.mods.includes('hole') ? { x: G.W / 2, y: G.H / 2, r: 30 } : null;
  G.storm = P.mods.includes('storm') ? { x: G.W / 2, y: G.H / 2, r: Math.min(G.W, G.H) * 0.28 } : null;
  if (P.boss) for (const n of G.nodes) if (n.type === 'home' && n.owner === 2) { n.type = 'mother'; n.r = T.mother.r; break; }
  for (const n of G.nodes) if (n.type === 'home' || n.type === 'star') n.tex = makePlanet(P.seed + n.id * 7919);
  layout(); buildBg(P.seed);
}

/* ---------- Simulation ---------- */
function sendShips(src, dst, f, k) {
  k = Math.min(k | 0, src.ships[f]);
  if (k <= 0 || src === dst) return 0;
  src.ships[f] -= k;
  const fast = src.type === 'relay' && src.owner === f ? 2.1 : 1;
  if (fast > 1) ring(src.x, src.y, f, src.r * 0.8, src.r * 2.2, 0.45);
  const base = Math.atan2(dst.y - src.y, dst.x - src.x), spread = Math.min(34, 8 + Math.sqrt(k) * 3);
  for (let i = 0; i < k; i++) {
    const a = base + (Math.random() - 0.5) * 2.2, sx = src.x + Math.cos(a) * (src.r + 8), sy = src.y + Math.sin(a) * (src.r + 8);
    const L = Math.hypot(dst.x - sx, dst.y - sy) || 1;
    G.ships.push({ f, to: dst, sx, sy, ex: dst.x, ey: dst.y, len: L, ux: (dst.x - sx) / L, uy: (dst.y - sy) / L, nx: -(dst.y - sy) / L, ny: (dst.x - sx) / L,
      off: (Math.random() - 0.5) * 2 * spread, prog: 0, end: Math.max(0.01, 1 - (dst.r + 7) / L), spd: SPEED * fast * (0.92 + Math.random() * 0.16), tl: fast > 1 ? 20 : 9,
      delay: Math.min(0.7, i * 0.006) + Math.random() * 0.05, x: sx, y: sy });
  }
  return k;
}

function spark(x, y, f, n, sp = 80) {
  for (let i = 0; i < n * FX && G.parts.length < 900; i++) {
    const a = Math.random() * TAU, v = 15 + Math.random() * sp, l = 0.3 + Math.random() * 0.5;
    G.parts.push({ k: 0, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, f, s: 4 + Math.random() * 5 });
  }
  if (!REDUCED && G.parts.length < 900) G.parts.push({ k: 0, x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, f, s: 12 + n * 1.2 });  // éclair bref
}
function ring(x, y, f, r0, r1, life) { G.parts.push({ k: 1, x, y, f, r0, r1, life, max: life }); }
function beam(n, x, y, f) {
  n.aim = Math.atan2(y - n.y, x - n.x);
  G.parts.push({ k: 2, x: n.x + Math.cos(n.aim) * n.r * 1.05, y: n.y + Math.sin(n.aim) * n.r * 1.05, x2: x, y2: y, f, life: 0.2, max: 0.2 });
}
function onCaptured(n, f) {
  n.pulse = 1; ring(n.x, n.y, f, n.r, n.r * 3.4, 0.9); spark(n.x, n.y, f, 22, 110);
  if (!G.demo && f === 1) { Snd.capture(); vib(12); }
}
function onNeutralized(n, prev) {
  if (prev === 1) G.lost = true;
  ring(n.x, n.y, prev, n.r * 1.1, n.r * 2.4, 0.6);
  if (!G.demo && prev === 1) { Snd.lost(); vib([20, 40, 20]); }
}

function update(dt) {
  G.t += dt;
  const N = G.nodes, P = G.P, SH = G.ships;
  const tot = G.tot, cap = G.cap;
  tot.fill(0); cap.fill(0);
  for (const n of N) { for (let f = 0; f < 5; f++) tot[f] += n.ships[f]; if (n.owner > 0) cap[n.owner] += T[n.type].cap; }
  for (const s of SH) tot[s.f]++;

  // production
  for (const n of N) {
    const o = n.owner;
    // Une planète en plein combat ne produit pas : sinon une forte production (chantier, bonus ennemi)
    // compense l'usure d'un défenseur seul et la planète devient imprenable.
    if (o > 0 && n.hp >= 1 && !n.fight && tot[o] < cap[o]) {
      n.acc += dt * T[n.type].prod * (G.demo || o === 1 ? 1 : P.enemyProd) * (P.rich ? 1.6 : 1);
      while (n.acc >= 1) { n.acc -= 1; n.ships[o]++; tot[o]++; }
    }
  }

  // vaisseaux en vol
  const ho = G.hole, st = G.storm;
  for (let i = SH.length - 1; i >= 0; i--) {
    const s = SH[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.prog += s.spd * dt / s.len * (st && Math.hypot(s.x - st.x, s.y - st.y) < st.r ? 0.4 : 1);
    if (s.prog >= s.end) { s.to.ships[s.f]++; s.to.flash = Math.min(1, s.to.flash + 0.06); SH[i] = SH[SH.length - 1]; SH.pop(); continue; }
    const b = Math.sin(Math.PI * s.prog) * s.off;
    s.x = s.sx + (s.ex - s.sx) * s.prog + s.nx * b;
    s.y = s.sy + (s.ey - s.sy) * s.prog + s.ny * b;
    if (ho && Math.hypot(s.x - ho.x, s.y - ho.y) < ho.r) { spark(s.x, s.y, s.f, 2, 30); SH[i] = SH[SH.length - 1]; SH.pop(); }
  }

  // combats et captures
  for (const n of N) {
    const sh = n.ships; let cnt = 0, sum = 0, only = -1;
    for (let f = 0; f < 5; f++) if (sh[f] > 0) { cnt++; sum += sh[f]; only = f; }
    n.pulse = Math.max(0, n.pulse - dt * 2.2); n.flash = Math.max(0, n.flash - dt * 2);
    if (cnt >= 2) {
      n.fight = Math.min(1, n.fight + dt * 4);
      const pl = sh[1] > 0;
      for (let f = 0; f < 5; f++) if (sh[f] > 0) n.dmg[f] += dt * (1.6 + 0.45 * Math.min(sh[f], sum - sh[f]));
      for (let f = 0; f < 5; f++) {
        if (sh[f] <= 0) { n.dmg[f] = 0; continue; }
        let k = Math.floor(n.dmg[f]);
        if (k > 0) {
          k = Math.min(k, sh[f]); sh[f] -= k; n.dmg[f] -= k;
          for (let j = 0; j < Math.min(k, 3); j++) { const a = Math.random() * TAU, rr = n.r + 8 + Math.random() * 14; spark(n.x + Math.cos(a) * rr, n.y + Math.sin(a) * rr, f, 3, 60); }
        }
        if (sh[f] <= 0) n.dmg[f] = 0;
      }
      if (pl && !G.demo) Snd.clash();
      continue;
    }
    n.fight = Math.max(0, n.fight - dt * 2);
    if (cnt === 0 || only === 0) continue;
    const f = only, tp = T[n.type], rate = (1 / tp.ct) * clamp(0.55 + sh[f] / 10, 0.55, 3);
    if (n.owner === f) { if (n.hp < 1) n.hp = Math.min(1, n.hp + rate * dt); }
    else if (n.owner > 0) {
      n.hp -= rate * dt;
      if (n.hp <= 0) { const prev = n.owner; n.owner = 0; n.hp = 0; n.capF = f; n.capP = 0; onNeutralized(n, prev); }
    } else {
      if (n.capF !== f && n.capP > 0) { n.capP -= rate * dt; if (n.capP <= 0) { n.capP = 0; n.capF = f; } }
      else {
        n.capF = f; n.capP += rate * dt;
        if (n.capP >= 1) { n.owner = f; n.hp = 1; n.capP = 0; n.capF = 0; n.acc = 0; onCaptured(n, f); }
      }
    }
  }

  // bastions et vaisseau-mère
  for (const n of N) {
    const tp = T[n.type], R = tp.range, R2 = R * R;
    if (!R || n.owner <= 0 || n.hp < 1) continue;
    n.cool -= dt; if (n.cool > 0) continue;
    const o = n.owner; let best = -1, bd = R2;
    for (let i = 0; i < SH.length; i++) {
      const s = SH[i]; if (s.f === o || s.delay > 0) continue;
      const dx = s.x - n.x, dy = s.y - n.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    if (best >= 0) {
      const s = SH[best]; beam(n, s.x, s.y, o); spark(s.x, s.y, s.f, 5);
      SH[best] = SH[SH.length - 1]; SH.pop(); n.cool = 1 / tp.rate;
      if (!G.demo && (o === 1 || s.f === 1)) Snd.zap();
      continue;
    }
    let tn = null, tf = -1, td = 1e9;
    for (const m of N) {
      const d = Math.hypot(m.x - n.x, m.y - n.y); if (d - m.r - 12 > R) continue;
      for (let f = 0; f < 5; f++) if (f !== o && m.ships[f] > 0 && d < td) { td = d; tn = m; tf = f; }
    }
    if (tn) {
      const a = Math.random() * TAU, rr = tn.r + 8 + Math.random() * 14, x = tn.x + Math.cos(a) * rr, y = tn.y + Math.sin(a) * rr;
      tn.ships[tf]--; beam(n, x, y, o); spark(x, y, tf, 5); n.cool = 1 / tp.rate;
      if (!G.demo && (o === 1 || tf === 1)) Snd.zap();
    } else n.cool = 0.2;
  }

  // IA
  for (const k in G.ai) { const A = G.ai[k]; A.t -= dt; if (A.t <= 0) { A.t = (A.p || P).aiInterval * (0.75 + Math.random() * 0.5); aiThink(+k); } }

  // particules
  const PT = G.parts;
  for (let i = PT.length - 1; i >= 0; i--) {
    const p = PT[i]; p.life -= dt;
    if (p.life <= 0) { PT[i] = PT[PT.length - 1]; PT.pop(); continue; }
    if (p.k === 0) { p.x += p.vx * dt; p.y += p.vy * dt; const d = 1 - dt * 2.5; p.vx *= d; p.vy *= d; }
  }

  for (const s of G.sel) if (s.ships[1] <= 0) G.sel.delete(s);

  G.checkT -= dt;
  if (G.checkT <= 0) {
    G.checkT = 0.3;
    if (G.demo) {
      let n = 0; for (const f of G.facs) if (alive(f)) n++;
      if (n <= 1 || G.t > 220) startDemo();
    } else if (!G.over) checkEnd();
  }
}

function alive(f) {
  for (const n of G.nodes) if (n.owner === f || n.ships[f] > 0) return true;
  for (const s of G.ships) if (s.f === f) return true;
  return false;
}
function checkEnd() {
  let enemy = false;
  for (const f of G.facs) if (f !== 1 && alive(f)) { enemy = true; break; }
  if (!enemy) finish(true); else if (!alive(1)) finish(false);
}

/* ---------- IA ---------- */
function aiThink(f) {
  const P = (G.ai[f] && G.ai[f].p) || G.P, N = G.nodes;
  const inc = N.map(() => [0, 0, 0, 0, 0]);
  for (const s of G.ships) inc[s.to.id][s.f]++;
  const enemyAt = n => { let e = 0; for (let g = 0; g < 5; g++) if (g !== f) e += n.ships[g]; return e; };
  const enemyInc = n => { let e = 0; for (let g = 1; g < 5; g++) if (g !== f) e += inc[n.id][g]; return e; };
  const avail = new Map(); let any = false;
  for (const n of N) {
    const m = n.ships[f]; if (m < 1) continue;
    if (enemyAt(n) > 0) { avail.set(n, 0); continue; }
    let keep = 0;
    if (n.owner === f) keep = Math.max(0, Math.ceil(enemyInc(n) * 1.15 - inc[n.id][f])) + Math.floor(m * (1 - P.aggr) * 0.35);
    else keep = Math.min(m, 6);
    const a = Math.max(0, m - keep); if (a > 0) any = true; avail.set(n, a);
  }
  if (!any) return;
  let moves = 0;
  const gather = (target, need) => {
    const src = [...avail.entries()].filter(([n, a]) => a > 0 && n !== target && isFinite(route(n, target))).sort((A, B) => route(A[0], target) - route(B[0], target));
    let sum = 0; const picks = [];
    for (const [n, a] of src) { const take = Math.min(a, need - sum); picks.push([n, take]); sum += take; if (sum >= need) break; }
    return sum >= need ? picks : null;
  };
  const commit = (picks, target) => { for (const [n, k] of picks) { sendShips(n, target, f, k); avail.set(n, avail.get(n) - k); } moves++; };

  for (const n of N) {
    if (n.owner !== f) continue;
    const th = enemyInc(n) + enemyAt(n); if (th <= 0) continue;
    const deficit = Math.ceil(th * 1.2 + 2 - n.ships[f] - inc[n.id][f]);
    if (deficit > 0 && Math.random() < P.defend) { const p = gather(n, deficit); if (p) { commit(p, n); if (moves >= P.maxMoves) return; } }
  }

  const cands = [];
  for (const n of N) {
    if (n.owner === f) continue;
    let nd = Infinity; for (const [s, a] of avail) if (a > 0) nd = Math.min(nd, route(s, n));
    if (!isFinite(nd)) continue;
    const tp = T[n.type];
    let def = enemyAt(n) + enemyInc(n);
    if (n.owner > 0) def += tp.prod * (nd / SPEED) * 0.8;
    for (const b of N) if (T[b.type].range && b.owner > 0 && b.owner !== f && b.hp >= 1 && dist(b, n) < T[b.type].range + n.r) def += b.type === 'mother' ? 16 : 7;
    const need = Math.ceil(def * P.margin + (n.owner === 0 ? 2 + tp.ct * 0.4 : 4) - inc[n.id][f] - n.ships[f]);
    if (need <= 0) continue;
    let val = tp.prod * 2 + tp.cap * 0.02 + (n.type === 'bastion' ? 1.2 : 0);
    if (n.owner > 0) val += P.aggr * 0.8 + (n.owner === 1 && !G.demo ? 0.4 * P.aggr : 0);
    if (P.opp && (n.fight > 0 || (n.owner > 0 && (n.hp < 1 || G.tot[n.owner] < G.tot[f] * 0.6)))) val += 1.5;
    const score = val / (1 + need * 0.05) / (1 + nd / 220) * (1 - P.noise * 0.5 + Math.random() * P.noise);
    cands.push({ n, need, score });
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 4)) {
    const p = gather(c.n, c.need);
    if (p) { commit(p, c.n); if (moves >= P.maxMoves) return; }
  }

  if (moves === 0 && Math.random() < 0.3) {
    const foes = N.filter(n => n.owner > 0 && n.owner !== f), owned = N.filter(n => n.owner === f);
    if (!foes.length || owned.length < 2) return;
    const front = n => { let m = Infinity; for (const e of foes) m = Math.min(m, dist(n, e)); return m; };
    let fr = owned[0]; for (const n of owned) if (front(n) < front(fr)) fr = n;
    let rr = null; for (const n of owned) if (n !== fr && (avail.get(n) || 0) >= 8 && (!rr || front(n) > front(rr))) rr = n;
    if (rr && front(rr) > front(fr) + 80 && isFinite(route(rr, fr))) sendShips(rr, fr, f, Math.floor(avail.get(rr) * 0.7));
  }
}

/* ---------- Rendu ---------- */
function poly(c, x, y, r, sides, rot) {
  c.beginPath();
  for (let i = 0; i < sides; i++) { const a = rot + i * TAU / sides, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath();
}

const METAL_L = '#e7eaf5', METAL_M = '#9aa1bf', METAL_D = '#464b68';
// Dégradé métallique orienté vers la lumière, dans un repère local tourné de `rot`.
function metal(c, r, rot, l = METAL_L, m = METAL_M, d = METAL_D) {
  const a = LA - rot, x = Math.cos(a) * r, y = Math.sin(a) * r, g = c.createLinearGradient(x, y, -x, -y);
  g.addColorStop(0, l); g.addColorStop(0.5, m); g.addColorStop(1, d); return g;
}
// Bruit de valeur fractal sur une grille 64×64 ; `per` (cases à l'octave 0) le rend périodique en x.
const NOISE = (() => { const r = mulberry32(1337), a = new Float32Array(4096); for (let i = 0; i < 4096; i++) a[i] = r(); return a; })();
function fbm(x, y, oct, per, ox) {
  let v = 0, amp = 0.5, tot = 0;
  for (let o = 0; o < oct; o++) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const p = per << o, xa = (x0 % p + ox + o * 17) & 63, xb = ((x0 + 1) % p + ox + o * 17) & 63, ya = (y0 & 63) << 6, yb = ((y0 + 1) & 63) << 6;
    const a = NOISE[ya | xa], b = NOISE[ya | xb], d = NOISE[yb | xa], e = NOISE[yb | xb];
    v += amp * (a + (b - a) * sx + (d - a + (a - b - d + e) * sx) * sy); tot += amp; amp *= 0.5; x *= 2; y *= 2;
  }
  return v / tot;
}

const PLANETS = [
  { base: ['#0e2f6b', '#1b5fa8', '#3f9ad0'], land: ['#c7b07a', '#4f9a57', '#2f7a45', '#7a6a4a', '#ffffff'], clouds: true, caps: true },
  { base: ['#7d4325', '#a8643a'], land: ['#c98a52', '#e9c08b', '#b8774a', '#f0d6ac'], craters: true },
  { bands: ['#c9a27a', '#ead3b2', '#a8775a', '#f2e6cf', '#b8885f'] },
  { base: ['#5f8fb4', '#9fc4de'], land: ['#c9dfee', '#eef6fc', '#b4d0e4'], craters: true },
  { land: ['#1c0d10', '#3a1716', '#4a1f1d', '#2a1416', '#5a2018'], lava: true },
  { bands: ['#5d469a', '#8f7bd0', '#3e3172', '#b9a9e8', '#6f58b0'] },
  { base: ['#0f4a52', '#1f7f7a', '#4fb3a6'], land: ['#d9e6c4', '#6fae7e', '#2f8a6e', '#9fd0b8'], clouds: true },
  { bands: ['#9cc3c9', '#d7ecee', '#6f9fa8', '#bfe0e3'] },
];
const LAVA = [[255, 236, 160], [255, 130, 34], [150, 40, 12]];
// Texture de surface en bande 192×96 qui boucle horizontalement (défile pour simuler la rotation).
// L'ombrage est appliqué au rendu (SPR.shade). Les nuages sont une bande séparée : `.cl`.
function makePlanet(seed) {
  const r = mulberry32(seed), H = 96, W = 192, c = mkCanvas(W, H), x = c.getContext('2d');
  const k = PLANETS[(r() * PLANETS.length) | 0], ox = (r() * 64) | 0, oy = (r() * 64) | 0;
  const o = [0, 0, 0], ramp = (cols, t) => { t = clamp(t, 0, 0.999) * (cols.length - 1); const i = t | 0, a = cols[i], b = cols[i + 1]; t -= i; o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };
  const bands = []; if (k.bands) for (let i = 0; i < 10; i++) bands.push(hexToRgb(k.bands[(i * 2 + ((r() * 3) | 0)) % k.bands.length]));
  const base = k.base && k.base.map(hexToRgb), land = k.land && k.land.map(hexToRgb);
  const img = x.createImageData(W, H), d = img.data;
  for (let py = 0, i = 0; py < H; py++) {
    const v = py / H; let prev = 0.5;
    for (let px = 0; px < W; px++, i += 4) {
      const u = px / W * 4; let col, sh = 1;
      if (k.bands) { const q = fbm(u, v * 7 + oy, 4, 4, ox); col = ramp(bands, v + (q - 0.5) * 0.14); sh = 0.72 + fbm(u, v * 22 + oy, 3, 4, ox + 5) * 0.56; }
      else {
        const h = clamp((fbm(u, v * 2 + oy, 4, 4, ox) - 0.24) * 1.95, 0, 1);
        const e = k.lava ? Math.abs(h - 0.5) : 1;
        if (e < 0.04) col = ramp(LAVA, e / 0.04);
        else {
          const rel = px ? clamp((h - prev) * 7, -0.16, 0.16) : 0, tl = base ? clamp((h - 0.49) * 50, 0, 1) : 1;  // relief, côte adoucie
          let b0 = 0, b1 = 0, b2 = 0; if (tl < 1) { ramp(base, h * 2); b0 = o[0]; b1 = o[1]; b2 = o[2]; }
          col = o; if (tl > 0) ramp(land, base ? (h - 0.5) * 3.2 : h);
          o[0] = b0 + (o[0] - b0) * tl; o[1] = b1 + (o[1] - b1) * tl; o[2] = b2 + (o[2] - b2) * tl; sh = 1 + rel * tl;
        }
        if (k.caps && Math.abs(v - 0.5) * 2 + (h - 0.5) * 0.4 > 0.84) col = [236, 244, 255];
        prev = h;
      }
      d[i] = col[0] * sh; d[i + 1] = col[1] * sh; d[i + 2] = col[2] * sh; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const wrap = (cx, fn) => { fn(cx); fn(cx - W); fn(cx + W); };
  if (k.craters) for (let i = 0; i < 18; i++) {
    const cy = r() * H, cr = 1.5 + r() * r() * 7;
    wrap(r() * W, cx => {
      x.fillStyle = 'rgba(0,0,0,.26)'; x.beginPath(); x.arc(cx, cy, cr, 0, TAU); x.fill();
      x.lineWidth = Math.max(1, cr * 0.22);
      x.strokeStyle = 'rgba(0,0,0,.4)'; x.beginPath(); x.arc(cx, cy, cr, LA - 1.1, LA + 1.1); x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.45)'; x.beginPath(); x.arc(cx, cy, cr, LA + Math.PI - 1.1, LA + Math.PI + 1.1); x.stroke();
    });
  }
  if (k.bands) {
    const cy = H * (0.3 + r() * 0.4), rx = 7 + r() * 7, col = k.bands[(r() * k.bands.length) | 0];
    wrap(r() * W, cx => {
      x.fillStyle = rgba(col, 0.85); x.beginPath(); x.ellipse(cx, cy, rx, rx * 0.5, 0, 0, TAU); x.fill();
      x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = 1.2; x.beginPath(); x.ellipse(cx, cy, rx * 0.62, rx * 0.26, 0, 0, TAU); x.stroke();
    });
  }
  if (k.clouds) {
    const cc = mkCanvas(W, H), cx = cc.getContext('2d'), im = cx.createImageData(W, H), e = im.data;
    for (let py = 0, i = 0; py < H; py++) for (let px = 0; px < W; px++, i += 4) {
      e[i] = e[i + 1] = e[i + 2] = 255;
      e[i + 3] = clamp((fbm(px / W * 4, py / H * 3.4 + oy + 9, 3, 4, ox + 23) - 0.5) * 6, 0, 1) * 225;
    }
    cx.putImageData(im, 0, 0); c.cl = cc;
  }
  return c;
}

function drawBody(c, n, t) {
  const f = n.owner, F = FAC[f], r = n.r * (1 + n.pulse * 0.18);
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = (f ? 0.5 : 0.16) + n.flash * 0.25 + n.fight * 0.15;
  const hs = r * (n.type === 'forge' ? 3.2 : 2.9);
  c.drawImage(SPR.glow[f], n.x - hs, n.y - hs, hs * 2, hs * 2);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (n.type === 'home' || n.type === 'star') drawPlanet(c, n, t, r, F, f);
  else if (n.type === 'outpost') drawSatellite(c, n, t, r, F, f);
  else if (n.type === 'forge') drawShipyard(c, n, t, r, F, f);
  else if (n.type === 'bastion') drawBastion(c, n, t, r, F, f);
  else drawRelay(c, n, t, r, F, f);
}

function drawPlanet(c, n, t, r, F, f) {
  const home = n.type === 'home', tex = n.tex, x = n.x, y = n.y, rq = r * 144 / 61.5;
  if (home) c.drawImage(SPR.ringB[f], x - rq, y - rq, rq * 2, rq * 2);
  if (tex) {
    c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
    const strip = (img, u) => {
      u = (u % 1) * r * 4;
      c.drawImage(img, x - r - u, y - r, r * 4, r * 2);
      if (u > r * 2) c.drawImage(img, x + r * 3 - u - 1.5, y - r, r * 4, r * 2);  // léger recouvrement : pas de couture
    };
    strip(tex, t * 0.012 + n.rot);
    if (tex.cl) strip(tex.cl, t * 0.021 + n.rot * 2);
    if (home) {  // ombre de l'anneau sur la planète
      c.translate(x, y); c.rotate(-0.35); c.strokeStyle = rgba(INK, 0.42); c.lineWidth = r * 0.2;
      c.beginPath(); c.ellipse(r * 0.1, r * 0.22, r * 1.8, r * 0.48, 0, 0, Math.PI); c.stroke();
    }
    c.restore();
  } else c.drawImage(SPR.orb[f], x - r, y - r, r * 2, r * 2);
  let q = r * 64 / 62; c.drawImage(SPR.shade, x - q, y - q, q * 2, q * 2);
  if (!f) { c.fillStyle = 'rgba(10,7,30,.36)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.globalCompositeOperation = 'lighter'; if (!f) c.globalAlpha = 0.4;
  q = r * 88 / 61.4; c.drawImage(SPR.atmo[f], x - q, y - q, q * 2, q * 2);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (home) c.drawImage(SPR.ringF[f], x - rq, y - rq, rq * 2, rq * 2);
  else if (n.moon) {
    c.strokeStyle = rgba(F.light, 0.13); c.lineWidth = 1;
    c.beginPath(); c.ellipse(x, y, r * 1.5, r * 1.35, 0, 0, TAU); c.stroke();
    const ma = n.rot * 3 + t * 0.55, mx = x + Math.cos(ma) * r * 1.5, my = y + Math.sin(ma) * r * 1.35, mr = r * 0.18;
    c.drawImage(SPR.orb[0], mx - mr, my - mr, mr * 2, mr * 2);
  }
}

function drawSatellite(c, n, t, r, F, f) {
  const rot = n.rot + t * 0.22, pw = r * 0.98, ph = r * 0.64, gap = r * 0.44, bw = r * 0.36, bh = r * 0.48, o = r * 0.05;
  c.save(); c.translate(n.x, n.y); c.rotate(rot);
  c.strokeStyle = METAL_D; c.lineWidth = r * 0.16; c.beginPath(); c.moveTo(-gap, 0); c.lineTo(gap, 0); c.stroke();
  const pg = metal(c, r * 1.3, rot, mix(F.col, '#ffffff', 0.35), mix(F.col, '#1c2f8c', f ? 0.55 : 0.8), mix(F.dark, '#0f1850', 0.5));  // panneaux teintés faction
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? gap : -gap - pw;
    c.fillStyle = rgba(INK, 0.7); c.fillRect(x0 - o, -ph / 2 - o, pw + o * 2, ph + o * 2);
    c.fillStyle = pg; c.fillRect(x0, -ph / 2, pw, ph);
    c.strokeStyle = rgba(INK, 0.5); c.lineWidth = r * 0.04; c.beginPath();
    for (let i = 1; i < 4; i++) { c.moveTo(x0 + pw * i / 4, -ph / 2); c.lineTo(x0 + pw * i / 4, ph / 2); }
    c.moveTo(x0, 0); c.lineTo(x0 + pw, 0); c.stroke();
    c.strokeStyle = f ? F.light : 'rgba(200,212,240,.6)'; c.lineWidth = r * 0.07; c.strokeRect(x0, -ph / 2, pw, ph);
  }
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.07; c.beginPath(); c.moveTo(0, -bh); c.lineTo(0, -bh - r * 0.26); c.stroke();
  c.fillStyle = METAL_L; c.beginPath(); c.ellipse(0, -bh - r * 0.3, r * 0.32, r * 0.13, 0, 0, TAU); c.fill();
  c.fillStyle = METAL_D; c.beginPath(); c.ellipse(0, -bh - r * 0.33, r * 0.2, r * 0.06, 0, 0, TAU); c.fill();
  c.fillStyle = rgba(INK, 0.8); c.fillRect(-bw - o, -bh - o, (bw + o) * 2, (bh + o) * 2);
  c.fillStyle = metal(c, bh, rot); c.fillRect(-bw, -bh, bw * 2, bh * 2);
  c.fillStyle = rgba(INK, 0.3); c.fillRect(-bw, bh * 0.62, bw * 2, bh * 0.14); c.fillRect(-bw, -bh * 0.76, bw * 2, bh * 0.14);
  c.fillStyle = F.dark; c.beginPath(); c.arc(0, 0, bw * 0.8, 0, TAU); c.fill();
  c.fillStyle = F.col; c.beginPath(); c.arc(0, 0, bw * 0.58, 0, TAU); c.fill();
  c.fillStyle = F.light; c.beginPath(); c.arc(0, 0, bw * 0.28, 0, TAU); c.fill();
  c.restore();
  const b = REDUCED ? 0.5 : Math.sin(t * 3.5 + n.id);
  if (b > 0.2) {
    const d = bh + r * 0.3, s = r * 0.5;
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = b;
    c.drawImage(SPR.dot[f], n.x + Math.sin(rot) * d - s, n.y - Math.cos(rot) * d - s, s * 2, s * 2);
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

function drawShipyard(c, n, t, r, F, f) {
  const spin = n.rot + t * 0.22, R = r * 1.02, sq = 0.42;
  c.save(); c.translate(n.x, n.y); c.rotate(-0.22);
  const mg = metal(c, R, -0.22);
  const arc = (dy, a0, a1) => { c.beginPath(); c.ellipse(0, dy, R, R * sq, 0, a0, a1); c.stroke(); };
  const torus = (a0, a1) => {
    c.lineCap = 'butt';
    c.lineWidth = r * 0.36; c.strokeStyle = rgba(INK, 0.8); arc(0, a0, a1);
    c.lineWidth = r * 0.28; c.strokeStyle = METAL_D; arc(0, a0, a1);
    c.lineWidth = r * 0.14; c.strokeStyle = mg; arc(-r * 0.05, a0, a1);
    c.lineWidth = r * 0.03; c.strokeStyle = 'rgba(255,255,255,.6)'; arc(-r * 0.11, a0, a1);
    c.setLineDash([r * 0.035, r * 0.3]); c.lineDashOffset = -spin * R * 0.72;  // joints de plaques qui tournent
    c.lineWidth = r * 0.26; c.strokeStyle = rgba(INK, 0.55); arc(0, a0, a1);
    c.setLineDash([]); c.lineCap = 'round';
  };
  const spokes = front => {
    for (let k = 0; k < 4; k++) {
      const a = spin + k * Math.PI / 2, s = Math.sin(a); if ((s >= 0) !== front) continue;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R, s * R * sq);
      c.lineWidth = r * 0.1; c.strokeStyle = METAL_D; c.stroke(); c.lineWidth = r * 0.04; c.strokeStyle = METAL_L; c.stroke();
    }
  };
  const lights = front => {
    for (let k = 0; k < 12; k++) {
      const a = spin + k * TAU / 12, s = Math.sin(a); if ((s >= 0) !== front) continue;
      c.globalAlpha = front ? 1 : 0.4; c.fillStyle = k % 3 === 0 ? '#ffffff' : F.col;
      c.beginPath(); c.arc(Math.cos(a) * R, s * R * sq, r * 0.055, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  };
  torus(Math.PI, TAU); lights(false); spokes(false);
  const hw = r * 0.24, hh = r * 0.62, o = r * 0.035;
  c.fillStyle = rgba(INK, 0.8); c.fillRect(-hw - o, -hh - o, (hw + o) * 2, (hh + o) * 2);
  c.fillStyle = metal(c, hw, -0.22); c.fillRect(-hw, -hh, hw * 2, hh * 2);
  c.fillStyle = METAL_D; c.beginPath(); c.ellipse(0, hh, hw, hw * 0.4, 0, 0, TAU); c.fill();
  c.fillStyle = METAL_L; c.beginPath(); c.ellipse(0, -hh, hw, hw * 0.4, 0, 0, TAU); c.fill();
  c.fillStyle = f ? F.light : '#6a7090';
  for (let k = 0; k < 3; k++) c.fillRect(-hw * 0.6, -hh * 0.72 + k * hh * 0.2, hw * 1.2, r * 0.035);
  c.fillStyle = F.col; c.fillRect(-hw, r * 0.02, hw * 2, r * 0.18);
  c.fillStyle = rgba(INK, 0.3); c.fillRect(-hw, hh * 0.6, hw * 2, r * 0.05);
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.05; c.beginPath(); c.moveTo(0, -hh); c.lineTo(0, -hh - r * 0.38); c.stroke();
  c.fillStyle = F.light; c.beginPath(); c.arc(0, -hh - r * 0.38, r * 0.06, 0, TAU); c.fill();
  if (f && n.hp >= 1) {  // vaisseau en construction : apparaît au rythme de la production
    const a = n.acc || 0, sw = r * 0.56;
    c.globalAlpha = 0.2 + a * 0.8; c.drawImage(SPR.ship[f], hw + r * 0.06, r * 0.1 - sw * 0.3, sw, sw * 0.6); c.globalAlpha = 1;
    const q = (t * 11) | 0;
    if (!REDUCED && hrand(q + n.id * 31) > 0.55) {
      const s = r * 0.16;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(SPR.dot[f], hw + r * 0.2 + hrand(q) * sw * 0.6 - s, r * 0.1 + (hrand(q + 9) - 0.5) * r * 0.2 - s, s * 2, s * 2);
      c.globalCompositeOperation = 'source-over';
    }
  }
  spokes(true); torus(0, Math.PI); lights(true);
  c.restore();
}

// Facettes du blindage du bastion, éclairées selon leur orientation.
const BAST = Array.from({ length: 8 }, (_, i) => mix('#2b2f4a', '#e3e7f5', Math.pow(0.5 + 0.5 * Math.cos(Math.PI / 4 + i * Math.PI / 4 - LA), 1.4)));
function drawBastion(c, n, t, r, F, f) {
  c.save(); c.translate(n.x, n.y);
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * TAU / 3, ex = Math.cos(a) * r * 1.25, ey = Math.sin(a) * r * 1.25;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(ex, ey);
    c.strokeStyle = rgba(INK, 0.8); c.lineWidth = r * 0.3; c.stroke();
    c.strokeStyle = METAL_D; c.lineWidth = r * 0.22; c.stroke();
    c.strokeStyle = METAL_M; c.lineWidth = r * 0.07; c.stroke();
    c.fillStyle = rgba(INK, 0.85); c.beginPath(); c.arc(ex, ey, r * 0.2, 0, TAU); c.fill();
    c.fillStyle = f > 0 && (REDUCED || ((t * 1.5 + k / 3) % 1) < 0.5) ? F.light : F.col;
    c.beginPath(); c.arc(ex, ey, r * 0.13, 0, TAU); c.fill();
  }
  const R0 = r * 0.86, R1 = r * 0.56;
  c.fillStyle = rgba(INK, 0.85); poly(c, 0, 0, r * 0.93, 8, Math.PI / 8); c.fill();
  for (let i = 0; i < 8; i++) {
    const a0 = Math.PI / 8 + i * Math.PI / 4, a1 = a0 + Math.PI / 4, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    c.fillStyle = BAST[i]; c.beginPath(); c.moveTo(c0 * R0, s0 * R0); c.lineTo(c1 * R0, s1 * R0); c.lineTo(c1 * R1, s1 * R1); c.lineTo(c0 * R1, s0 * R1); c.closePath(); c.fill();
  }
  c.fillStyle = metal(c, R1, 0, '#4d5373', '#30344c', '#191b2c'); poly(c, 0, 0, R1, 8, Math.PI / 8); c.fill();
  c.strokeStyle = rgba(F.col, f ? 1 : 0.5); c.lineWidth = r * 0.08; c.stroke();
  c.strokeStyle = rgba(F.light, f ? 0.9 : 0.25); c.lineWidth = r * 0.05; poly(c, 0, 0, R0, 8, Math.PI / 8); c.stroke();
  const ca = Math.cos(n.aim), sa = Math.sin(n.aim), px = -sa * r * 0.13, py = ca * r * 0.13;
  const len = r * (0.98 - (f > 0 ? clamp((n.cool - 1 / T.bastion.rate + 0.14) / 0.14, 0, 1) * 0.16 : 0));  // recul au tir
  c.lineCap = 'butt';
  for (const [col, lw] of [[rgba(INK, 0.85), 0.2], ['#d9deee', 0.1]]) {
    c.strokeStyle = col; c.lineWidth = r * lw;
    for (const o of [-1, 1]) { c.beginPath(); c.moveTo(px * o, py * o); c.lineTo(ca * len + px * o, sa * len + py * o); c.stroke(); }
  }
  c.lineCap = 'round';
  c.fillStyle = rgba(INK, 0.85); c.beginPath(); c.arc(0, 0, r * 0.45, 0, TAU); c.fill();
  const g = c.createRadialGradient(LX * r * 0.16, LY * r * 0.16, 0, 0, 0, r * 0.4); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, METAL_M); g.addColorStop(1, '#3d4262');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.4, 0, TAU); c.fill();
  c.fillStyle = F.col; c.beginPath(); c.arc(0, 0, r * 0.17, 0, TAU); c.fill();
  c.fillStyle = F.light; c.beginPath(); c.arc(0, 0, r * 0.08, 0, TAU); c.fill();
  c.restore();
  if (f > 0 && n.cool > 1 / T.bastion.rate - 0.09) {
    const s = r * 0.55;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(SPR.dot[f], n.x + ca * r * 1.05 - s, n.y + sa * r * 1.05 - s, s * 2, s * 2);
    c.globalCompositeOperation = 'source-over';
  }
}

function drawRelay(c, n, t, r, F, f) {
  const w = r * 0.72, h = r * 1.3;
  c.save(); c.translate(n.x, n.y);
  c.beginPath(); c.moveTo(-w * 0.45, h * 0.86); c.lineTo(-w * 0.95, h * 1.18); c.moveTo(w * 0.45, h * 0.86); c.lineTo(w * 0.95, h * 1.18); c.moveTo(0, -h); c.lineTo(0, -h * 1.22);
  c.strokeStyle = rgba(INK, 0.8); c.lineWidth = r * 0.18; c.stroke(); c.strokeStyle = METAL_M; c.lineWidth = r * 0.09; c.stroke();
  c.save(); c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, TAU); c.clip();
  const g = c.createRadialGradient(0, 0, 1, 0, 0, h);
  g.addColorStop(0, f ? '#ffffff' : rgba(F.light, 0.22)); g.addColorStop(0.18, rgba(F.light, f ? 0.85 : 0.18)); g.addColorStop(0.5, rgba(F.col, f ? 0.4 : 0.1)); g.addColorStop(1, rgba(F.col, 0.03));
  c.fillStyle = g; c.fillRect(-w, -h, w * 2, h * 2);
  c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(F.light, f ? 0.55 : 0.15); c.lineWidth = r * 0.05;
  for (let k = 0; k < 3; k++) { const ph = (t * (f ? 0.9 : 0.3) + k / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.ellipse(0, 0, w * ph, h * ph, 0, 0, TAU); c.stroke(); }
  c.globalAlpha = f ? 0.7 : 0.25;
  for (let k = 0; k < 2; k++) { const a = t * (k ? -1.3 : 1.9) + k * 2; c.beginPath(); c.ellipse(0, 0, w * (0.55 + k * 0.22), h * (0.55 + k * 0.22), 0, a, a + 1.5); c.stroke(); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.restore();
  const gate = (lw, col, dw = 0) => { c.strokeStyle = col; c.lineWidth = r * lw; c.beginPath(); c.ellipse(0, 0, w + r * dw, h + r * dw, 0, 0, TAU); c.stroke(); };
  gate(0.32, rgba(INK, 0.85)); gate(0.24, METAL_D); gate(0.12, metal(c, h, 0)); gate(0.04, rgba(F.light, f ? 0.9 : 0.3), -0.12);
  const on = f ? (REDUCED ? -1 : (t * 5 | 0) % 6) : -2;
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6 + Math.PI / 6, x = Math.cos(a) * w, y = Math.sin(a) * h;
    c.fillStyle = rgba(INK, 0.85); c.fillRect(x - r * 0.15, y - r * 0.15, r * 0.3, r * 0.3);
    c.fillStyle = METAL_L; c.fillRect(x - r * 0.11, y - r * 0.11, r * 0.22, r * 0.22);
    c.fillStyle = on === k || on === -1 ? F.light : F.col; c.beginPath(); c.arc(x, y, r * 0.07, 0, TAU); c.fill();
  }
  c.restore();
}

function drawArcs(c, n) {
  const R = n.r + 5, cap = n.owner === 0 && n.capP > 0;
  if (!cap && !(n.owner > 0 && n.hp < 1)) return;
  const F = FAC[cap ? n.capF : n.owner], a = -Math.PI / 2 + TAU * (cap ? n.capP : n.hp);
  c.lineWidth = 4.6; c.strokeStyle = rgba(INK, 0.4); c.beginPath(); c.arc(n.x, n.y, R, 0, TAU); c.stroke();
  c.lineWidth = 2.6; c.strokeStyle = cap ? 'rgba(255,255,255,.12)' : 'rgba(255,80,80,.3)'; c.stroke();
  c.strokeStyle = F.col; c.beginPath(); c.arc(n.x, n.y, R, -Math.PI / 2, a); c.stroke();
  c.lineWidth = 1; c.strokeStyle = F.light; c.stroke();
  c.globalCompositeOperation = 'lighter'; c.drawImage(SPR.dot[cap ? n.capF : n.owner], n.x + Math.cos(a) * R - 5, n.y + Math.sin(a) * R - 5, 10, 10); c.globalCompositeOperation = 'source-over';
}

function drawOrbits(c, n, t, B) {
  const K = B.k, shake = REDUCED ? 0 : n.fight;
  for (let f = 0; f < 5; f++) {
    const cnt = n.ships[f]; if (!cnt) continue;
    const kk = Math.min(cnt, 64), spr = SPR.ship[f], dir = f % 2 ? 1 : -1;
    const w = f === 0 ? 10 : 12.5, h = w * 0.6, ext = f !== n.owner && f !== 0 ? 5 : 0;
    for (let i = 0; i < kk; i++) {
      const base = n.id * 977 + f * 131 + i * 7;
      const rad = n.r + 8 + hrand(base + 1) * 16 + ext;
      const a = hrand(base + 3) * TAU + t * (0.35 + hrand(base + 2) * 0.7) * dir * (30 / rad);
      const ca = Math.cos(a), sa = Math.sin(a);
      let x = n.x + ca * rad, y = n.y + sa * rad * 0.9;
      if (shake > 0) { const q = (t * 30) | 0; x += (hrand(base + q) - 0.5) * 3 * shake; y += (hrand(base + 5 + q) - 0.5) * 3 * shake; }
      let hx = -sa * dir, hy = ca * 0.9 * dir; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m;
      c.setTransform(K * hx, K * hy, -K * hy, K * hx, B.ox + K * x, B.oy + K * y);
      c.drawImage(spr, -w / 2, -h / 2, w, h);
    }
  }
  c.setTransform(K, 0, 0, K, B.ox, B.oy);
  if (shake > 0.3) {  // échanges de tirs pendant un combat
    const q = (t * 14) | 0;
    c.globalCompositeOperation = 'lighter'; c.lineWidth = 1.1; c.globalAlpha = 0.8 * shake;
    for (let j = 0; j < 4; j++) {
      const b = n.id * 53 + q * 7 + j * 3; let f = (hrand(b + 4) * 5) | 0; for (let i = 0; i < 4 && !n.ships[f]; i++) f = (f + 1) % 5;
      const a = hrand(b) * TAU, a2 = a + 0.12 + hrand(b + 1) * 0.22, r1 = n.r + 9 + hrand(b + 2) * 16, r2 = r1 + (hrand(b + 3) - 0.5) * 8;
      c.strokeStyle = FAC[f].light; c.beginPath(); c.moveTo(n.x + Math.cos(a) * r1, n.y + Math.sin(a) * r1 * 0.9); c.lineTo(n.x + Math.cos(a2) * r2, n.y + Math.sin(a2) * r2 * 0.9); c.stroke();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
}

// Traînées des réacteurs : un tronçon vif près de la coque, puis une queue plus fine qui s'estompe.
function drawTrails(c) {
  const SH = G.ships;
  for (const f of G.facs) {
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath(); let any = false;
      for (const s of SH) {
        if (s.f !== f || s.delay > 0) continue; any = true;
        const hx = s.hx === undefined ? s.ux : s.hx, hy = s.hx === undefined ? s.uy : s.hy, a = pass ? s.tl * 0.45 : 3, b = pass ? s.tl : s.tl * 0.45;
        c.moveTo(s.x - hx * a, s.y - hy * a); c.lineTo(s.x - hx * b, s.y - hy * b);
      }
      if (!any) break;
      c.strokeStyle = pass ? rgba(FAC[f].col, 0.3) : rgba(FAC[f].light, 0.7); c.lineWidth = pass ? 1 : 1.8; c.stroke();
    }
  }
}

function drawFleet(c, B) {
  const K = B.k;
  for (const s of G.ships) {
    const cp = Math.cos(Math.PI * s.prog) * Math.PI * s.off / s.len;
    let hx = s.ux + s.nx * cp, hy = s.uy + s.ny * cp; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m;
    s.hx = hx; s.hy = hy;
    c.setTransform(K * hx, K * hy, -K * hy, K * hx, B.ox + K * s.x, B.oy + K * s.y);
    c.drawImage(SPR.ship[s.f], -7.5, -4.5, 15, 9);
  }
  c.setTransform(K, 0, 0, K, B.ox, B.oy);
}

function drawParts(c) {
  for (const p of G.parts) {
    const a = p.life / p.max;
    if (p.k === 0) { c.globalAlpha = a; const s = p.s * (0.5 + a * 0.5); c.drawImage(SPR.dot[p.f], p.x - s / 2, p.y - s / 2, s, s); }
    else if (p.k === 1) {  // onde de choc : éclair bref au centre, front net, sillage doux
      const F = FAC[p.f], rr = p.r0 + (p.r1 - p.r0) * (1 - a * a);
      if (a > 0.55) { const s = p.r1 * 1.5; c.globalAlpha = (a - 0.55) * 1.6 * FX; c.drawImage(SPR.glow[p.f], p.x - s, p.y - s, s * 2, s * 2); }
      c.globalAlpha = a * 0.3; c.strokeStyle = F.col; c.lineWidth = 7 * a + 1; c.beginPath(); c.arc(p.x, p.y, rr, 0, TAU); c.stroke();
      c.globalAlpha = a; c.strokeStyle = F.light; c.lineWidth = 1.4; c.stroke();
      if (p.max > 0.8) { c.globalAlpha = a * 0.45; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, p.r0 + (rr - p.r0) * 0.6, 0, TAU); c.stroke(); }
    } else {  // tir de bastion : faisceau qui s'affine, éclats à la bouche et à l'impact
      c.globalAlpha = a * 0.4; c.strokeStyle = FAC[p.f].col; c.lineWidth = 2 + 5 * a; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke();
      c.globalAlpha = a; c.strokeStyle = '#ffffff'; c.lineWidth = 0.4 + 1.4 * a; c.stroke();
      const s = 5 + 9 * a; c.drawImage(SPR.dot[p.f], p.x2 - s, p.y2 - s, s * 2, s * 2); c.drawImage(SPR.dot[p.f], p.x - s * 0.6, p.y - s * 0.6, s * 1.2, s * 1.2);
    }
  }
  c.globalAlpha = 1;
}

// Symbole par camp, à côté des nombres : le camp se lit sans dépendre de la couleur (daltonisme).
function glyph(c, f, x, y, s) {
  c.beginPath();
  if (f === 1) c.arc(x, y, s * 0.5, 0, TAU);
  else if (f === 2) { c.moveTo(x, y - s * 0.6); c.lineTo(x + s * 0.58, y + s * 0.42); c.lineTo(x - s * 0.58, y + s * 0.42); c.closePath(); }
  else if (f === 3) c.rect(x - s * 0.42, y - s * 0.42, s * 0.84, s * 0.84);
  else { c.moveTo(x, y - s * 0.62); c.lineTo(x + s * 0.5, y); c.lineTo(x, y + s * 0.62); c.lineTo(x - s * 0.5, y); c.closePath(); }
  c.lineWidth = 3; c.strokeStyle = 'rgba(8,5,26,.85)'; c.stroke(); c.fill();
}
const GW = 7, GG = 3;  // taille du symbole, écart avec le nombre

/* Variantes : trou noir, tempête, vaisseau-mère */
function drawHole(c, x, y, r, t) {
  c.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 5; k++) {
    const a = t * (1.6 - k * 0.2) + k * 1.3, rr = r * (0.75 + k * 0.17);
    c.strokeStyle = k % 2 ? 'rgba(255,150,80,.35)' : 'rgba(190,120,255,.3)'; c.lineWidth = r * 0.12;
    c.beginPath(); c.ellipse(x, y, rr * 1.35, rr * 0.9, 0.35, a, a + 2.4); c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#000'; c.beginPath(); c.arc(x, y, r * 0.55, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(255,215,170,.85)'; c.lineWidth = 1.4; c.stroke();
  c.setLineDash([3, 6]); c.lineDashOffset = -t * 6; c.strokeStyle = 'rgba(255,90,90,.35)'; c.lineWidth = 1;
  c.beginPath(); c.arc(x, y, r + 22, 0, TAU); c.stroke(); c.setLineDash([]);
}
function drawStorm(c, x, y, r, t) {
  c.fillStyle = 'rgba(110,140,255,.07)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const a = -t * (0.25 + k * 0.05) + k * 0.9, rr = r * (0.25 + k * 0.1);
    c.strokeStyle = 'rgba(150,180,255,.13)'; c.lineWidth = 3 + k;
    c.beginPath(); c.arc(x, y, rr, a, a + 1.6); c.stroke();
  }
  const q = Math.floor(t * 4);
  if (hrand(q * 7 + 1) > 0.8) {
    let a = hrand(q) * TAU, px = x + Math.cos(a) * r * 0.2, py = y + Math.sin(a) * r * 0.2;
    c.strokeStyle = 'rgba(220,235,255,.6)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(px, py);
    for (let j = 1; j < 6; j++) { a += (hrand(q + j * 13) - 0.5) * 1.2; px += Math.cos(a) * r * 0.13; py += Math.sin(a) * r * 0.13; c.lineTo(px, py); }
    c.stroke();
  }
  c.globalCompositeOperation = 'source-over';
  c.setLineDash([6, 8]); c.lineDashOffset = t * 8; c.strokeStyle = 'rgba(150,180,255,.3)'; c.lineWidth = 1.2;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); c.setLineDash([]);
}
function drawMods(c, t) {
  if (G.storm) drawStorm(c, G.storm.x, G.storm.y, G.storm.r, t);
  if (G.hole) drawHole(c, G.hole.x, G.hole.y, G.hole.r, t);
  for (const n of G.nodes) if (n.type === 'mother' && n.owner > 0) {
    c.setLineDash([4, 6]); c.lineDashOffset = -t * 5; c.strokeStyle = rgba(FAC[n.owner].col, 0.35); c.lineWidth = 1.3;
    c.beginPath(); c.arc(n.x, n.y, T.mother.range, 0, TAU); c.stroke(); c.setLineDash([]);
  }
}
// Coque du vaisseau-mère, pré-rendue par faction : proue en haut, rayon = 120 px, centre (192,192).
// La lumière y est figée (haut gauche) ; tourelle, réacteurs et feux sont dessinés à chaque image.
function makeMother(F, f) {
  const c = mkCanvas(384, 384), x = c.getContext('2d'), P = s => new Path2D(s);
  x.translate(192, 192); x.scale(120, 120); x.lineJoin = 'round'; x.lineCap = 'round';
  const ink = (p, w = 0.1) => { x.strokeStyle = rgba(INK, 0.9); x.lineWidth = w; x.stroke(p); };
  const steel = metal(x, 1.15, 0), paint = metal(x, 1.15, 0, f ? mix(F.col, '#ffffff', 0.35) : '#a9adc2', f ? F.col : '#6d7088', f ? F.dark : '#34364c');
  const line = (p, col, w) => { x.strokeStyle = col; x.lineWidth = w; x.stroke(p); };
  // ailes : relient la coque aux nacelles, pour une silhouette d'un seul bloc
  const wings = P('M.3 -.12 L.66 .04 L.66 .8 L.3 .72 Z M-.3 -.12 L-.66 .04 L-.66 .8 L-.3 .72 Z');
  ink(wings); x.fillStyle = metal(x, 1.15, 0, '#9299b8', '#5d6384', '#2b2e45'); x.fill(wings);
  line(P('M.3 .22 L.66 .3 M.3 .5 L.66 .56 M-.3 .22 L-.66 .3 M-.3 .5 L-.66 .56'), rgba(INK, 0.55), 0.03);
  // nacelles : hangars latéraux, bande à la couleur de la faction
  for (const s of [-1, 1]) {
    x.save(); x.translate(s * 0.78, 0);
    const pod = P('M0 -.46 L.15 -.2 L.15 .82 L.07 .96 L-.07 .96 L-.15 .82 L-.15 -.2 Z');
    ink(pod); x.fillStyle = steel; x.fill(pod);
    x.fillStyle = paint; x.fill(P('M0 -.46 L.15 -.2 L.15 0 L-.15 0 L-.15 -.2 Z')); x.fillRect(-0.15, 0.56, 0.3, 0.14);
    x.fillStyle = rgba(INK, 0.3); x.fill(P('M0 -.46 L.15 -.2 L.15 .82 L.07 .96 L0 .96 Z'));
    line(P('M-.15 0 L.15 0 M-.15 .56 L.15 .56 M-.15 .7 L.15 .7'), rgba(INK, 0.6), 0.025);
    x.fillStyle = rgba(INK, 0.85); x.fillRect(-0.08, 0.1, 0.16, 0.38);  // baie du hangar
    x.fillStyle = f ? F.light : '#8d91a8'; for (let k = 0; k < 3; k++) x.fillRect(-0.045, 0.15 + k * 0.11, 0.09, 0.05);
    line(P('M-.02 -.4 L-.13 -.2 L-.13 .8'), 'rgba(255,255,255,.65)', 0.022);
    x.restore();
  }
  // bloc réacteurs
  x.fillStyle = rgba(INK, 0.9); x.fillRect(-0.4, 0.9, 0.8, 0.2);
  x.fillStyle = METAL_D; x.fillRect(-0.35, 0.92, 0.7, 0.14);
  for (const k of [-1, 0, 1]) {
    x.fillStyle = rgba(INK, 0.9); x.beginPath(); x.ellipse(k * 0.23, 1.06, 0.1, 0.055, 0, 0, TAU); x.fill();
    x.fillStyle = f ? F.light : '#5a5e78'; x.beginPath(); x.ellipse(k * 0.23, 1.06, 0.065, 0.03, 0, 0, TAU); x.fill();
  }
  // coque : arête centrale (flanc droit dans l'ombre), blindage peint sur la proue et les flancs
  const hull = P('M0 -1.24 L.26 -.78 L.34 -.3 L.57 .1 L.57 .62 L.4 .98 L-.4 .98 L-.57 .62 L-.57 .1 L-.34 -.3 L-.26 -.78 Z');
  ink(hull, 0.11); x.fillStyle = steel; x.fill(hull);
  x.fillStyle = paint;
  x.fill(P('M0 -1.24 L.26 -.78 L.3 -.52 L0 -.8 L-.3 -.52 L-.26 -.78 Z'));
  x.fill(P('M.34 -.3 L.57 .1 L.57 .62 L.44 .62 L.44 .16 L.27 -.14 Z')); x.fill(P('M-.34 -.3 L-.57 .1 L-.57 .62 L-.44 .62 L-.44 .16 L-.27 -.14 Z'));
  x.fill(P('M-.22 .8 L.22 .8 L.3 .98 L-.3 .98 Z'));
  x.fillStyle = rgba(INK, 0.32); x.fill(P('M0 -1.24 L.26 -.78 L.34 -.3 L.57 .1 L.57 .62 L.4 .98 L0 .98 Z'));
  x.fillStyle = rgba(INK, 0.22); x.fill(P('M-.57 .62 L.57 .62 L.4 .98 L-.4 .98 Z'));
  line(P('M0 -.8 L.3 -.52 M0 -.8 L-.3 -.52 M.27 -.14 L.44 .16 L.44 .62 M-.27 -.14 L-.44 .16 L-.44 .62 M-.57 .62 L.57 .62 M-.3 -.36 L.3 -.36 M-.22 .8 L.22 .8'), rgba(INK, 0.6), 0.025);
  line(P('M-.02 -1.18 L-.25 -.78 L-.33 -.3 L-.55 .1 L-.55 .6'), 'rgba(255,255,255,.75)', 0.025);
  // passerelle : verrière éclairée sur l'arête
  const br = P('M0 -.74 L0 -.44'); ink(br, 0.13); line(br, f ? F.light : '#8d91a8', 0.06); line(P('M-.012 -.72 L-.012 -.6'), '#ffffff', 0.025);
  // puits de la tourelle
  x.fillStyle = rgba(INK, 0.9); x.beginPath(); x.arc(0, 0, 0.44, 0, TAU); x.fill();
  x.fillStyle = metal(x, 0.4, 0, '#4d5373', '#30344c', '#191b2c'); x.beginPath(); x.arc(0, 0, 0.39, 0, TAU); x.fill();
  x.strokeStyle = rgba(f ? F.col : '#6d7088', 0.9); x.lineWidth = 0.035; x.beginPath(); x.arc(0, 0, 0.39, 0, TAU); x.stroke();
  return c;
}
function drawMother(c, n, t) {
  const f = n.owner, F = FAC[f], r = n.r * (1 + n.pulse * 0.12), x = n.x, y = n.y, q = r * 1.6, spr = SPR.mother[f];
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = (f ? 0.55 : 0.18) + n.flash * 0.25 + n.fight * 0.15;
  c.drawImage(SPR.glow[f], x - r * 3, y - r * 3, r * 6, r * 6);
  if (f) {  // panaches des réacteurs
    c.globalAlpha = 0.9;
    for (const k of [-1, 0, 1]) {
      const h = r * (0.4 + (REDUCED ? 0 : 0.06 * Math.sin(t * 9 + k * 2 + n.id)));
      c.drawImage(SPR.dot[f], x + k * r * 0.23 - r * 0.16, y + r * 1.06 - h * 0.42, r * 0.32, h);
    }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.drawImage(spr, x - q, y - q, q * 2, q * 2);
  c.globalCompositeOperation = 'lighter';
  const hot = Math.min(REDUCED ? 0.2 : 0.6, n.flash * 0.5 + n.fight * 0.15);  // la coque s'embrase à la capture et au combat
  if (hot > 0.01) { c.globalAlpha = hot; c.drawImage(spr, x - q, y - q, q * 2, q * 2); }
  if (f) {  // feux de position : proue et nacelles
    const s = r * 0.2;
    c.globalAlpha = REDUCED ? 0.6 : 0.5 + 0.5 * Math.sin(t * 3.2 + n.id);
    for (const [dx, dy] of [[0, -1.24], [-0.78, -0.46], [0.78, -0.46]]) c.drawImage(SPR.dot[f], x + dx * r - s, y + dy * r - s, s * 2, s * 2);
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

  // tourelle : canon principal à deux rails, orienté selon n.aim
  const rate = T.mother.rate, ca = Math.cos(n.aim), sa = Math.sin(n.aim);
  const len = r * (1 - (f > 0 ? clamp((n.cool - 1 / rate + 0.16) / 0.16, 0, 1) * 0.14 : 0));  // recul au tir
  c.save(); c.translate(x, y); c.rotate(n.aim); c.lineCap = 'butt'; c.lineJoin = 'round';
  if (f) {  // couronne d'énergie du puits
    c.setLineDash([r * 0.13, r * 0.1]); c.lineDashOffset = -t * r * 0.25; c.strokeStyle = F.col; c.lineWidth = r * 0.05;
    c.beginPath(); c.arc(0, 0, r * 0.31, 0, TAU); c.stroke(); c.setLineDash([]);
  }
  const mg = metal(c, r, n.aim);
  const rails = (col, w, a, b) => { c.strokeStyle = col; c.lineWidth = r * w; c.beginPath(); for (const o of [-1, 1]) { c.moveTo(a, o * r * 0.09); c.lineTo(b, o * r * 0.09); } c.stroke(); };
  rails(rgba(INK, 0.9), 0.14, 0, len); rails(mg, 0.075, 0, len);
  rails(rgba(INK, 0.9), 0.17, len - r * 0.2, len - r * 0.04); rails(METAL_L, 0.1, len - r * 0.18, len - r * 0.06);  // frein de bouche
  const charge = f > 0 ? (REDUCED ? 0.7 : clamp(1 - n.cool * rate, 0, 1)) : 0;  // l'âme du canon se recharge entre deux tirs
  c.strokeStyle = rgba(f ? F.light : '#6d7088', 0.3 + charge * 0.7); c.lineWidth = r * 0.05;
  c.beginPath(); c.moveTo(r * 0.2, 0); c.lineTo(len - r * 0.2, 0); c.stroke();
  c.fillStyle = rgba(INK, 0.9); poly(c, 0, 0, r * 0.3, 6, 0); c.fill();
  c.fillStyle = mg; poly(c, 0, 0, r * 0.25, 6, 0); c.fill();
  c.strokeStyle = rgba(INK, 0.5); c.lineWidth = r * 0.025; c.beginPath(); c.moveTo(-r * 0.25, 0); c.lineTo(-r * 0.12, 0); c.stroke();
  const hx = Math.cos(LA - n.aim) * r * 0.06, hy = Math.sin(LA - n.aim) * r * 0.06;
  const g = c.createRadialGradient(hx, hy, 0, 0, 0, r * 0.15); g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, F.light); g.addColorStop(1, f ? F.col : '#4a4d66');
  c.fillStyle = rgba(INK, 0.9); c.beginPath(); c.arc(0, 0, r * 0.18, 0, TAU); c.fill();
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.14, 0, TAU); c.fill();
  c.restore(); c.lineCap = 'round';
  if (f > 0 && n.cool > 1 / rate - 0.1) {
    const s = r * 0.5;
    c.globalCompositeOperation = 'lighter';
    c.drawImage(SPR.dot[f], x + ca * r * 1.05 - s, y + sa * r * 1.05 - s, s * 2, s * 2);
    c.globalCompositeOperation = 'source-over';
  }
}

function sendCount(n) { const m = n.ships[1]; return save.pct >= 1 ? m : Math.max(1, Math.floor(m * save.pct)); }

function render() {
  const c = ctx, t = G.t, V = view;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (BG) c.drawImage(BG, 0, 0); else { c.fillStyle = '#0b0820'; c.fillRect(0, 0, cv.width, cv.height); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalCompositeOperation = 'lighter';
  const now = performance.now() / 1000;
  const drift = REDUCED ? 0 : now * 1.6;  // parallaxe : les étoiles proches dérivent plus vite
  for (const s of TW) { c.globalAlpha = 0.12 + 0.55 * (0.5 + 0.5 * Math.sin(now * s.s + s.p)); const z = s.z * 2, sx = (s.x + drift * s.z) % V.w; c.drawImage(SPR.star, sx - z, s.y - z, z * 2, z * 2); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (!G.nodes.length) return;

  const k = V.sc * dpr; c.setTransform(k, 0, 0, k, V.ox * dpr, V.oy * dpr);
  const N = G.nodes;

  for (const n of N) if (n.type === 'bastion' && n.owner > 0) {
    c.fillStyle = rgba(FAC[n.owner].col, 0.035); c.beginPath(); c.arc(n.x, n.y, T.bastion.range, 0, TAU); c.fill();
    c.setLineDash([3, 7]); c.lineDashOffset = t * 4; c.strokeStyle = rgba(FAC[n.owner].col, 0.2); c.lineWidth = 1.1; c.stroke(); c.setLineDash([]);
  }

  drawMods(c, t);

  // geste en cours
  const g = G.gest;
  if (g && g.moved && g.sel.size) {
    const w = { x: (g.x - V.ox) / V.sc, y: (g.y - V.oy) / V.sc };
    const tx = g.hover ? g.hover.x : w.x, ty = g.hover ? g.hover.y : w.y;
    c.setLineDash([5, 7]); c.lineDashOffset = -t * 40; c.strokeStyle = rgba(FAC[1].col, 0.6); c.lineWidth = 1.6;
    for (const s of g.sel) { if (s === g.hover) continue; c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(tx, ty); c.stroke(); }
    c.setLineDash([]);
    if (g.hover) { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.8; c.beginPath(); c.arc(g.hover.x, g.hover.y, g.hover.r + 16, 0, TAU); c.stroke(); }
  }

  for (const n of N) (n.type === 'mother' ? drawMother : drawBody)(c, n, t);
  c.lineCap = 'round';
  for (const n of N) drawArcs(c, n);

  const sel = g ? g.sel : G.sel;
  if (sel.size) {
    c.strokeStyle = `rgba(255,255,255,${REDUCED ? 0.8 : 0.55 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 1.6;
    for (const s of sel) { c.beginPath(); c.arc(s.x, s.y, s.r + 12, 0, TAU); c.stroke(); }
  }

  const B = { k, ox: V.ox * dpr, oy: V.oy * dpr };
  for (const n of N) drawOrbits(c, n, t, B);
  c.globalCompositeOperation = 'lighter'; drawTrails(c);
  c.globalCompositeOperation = 'source-over'; drawFleet(c, B);
  c.globalCompositeOperation = 'lighter'; drawParts(c);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

  // étiquettes
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  for (const n of N) {
    const fs = []; for (let f = 0; f < 5; f++) if (n.ships[f] > 0) fs.push(f);
    if (!fs.length) continue;
    const sx = V.ox + n.x * V.sc, sy = V.oy + n.y * V.sc + n.r * V.sc + Math.max(14, 15 * V.sc);
    c.font = '700 12.5px Manrope, system-ui, sans-serif';
    const ws = fs.map(f => c.measureText(String(n.ships[f])).width + (f ? GW + GG : 0)), gap = 9;
    let x = sx - (ws.reduce((a, b) => a + b, 0) + gap * (fs.length - 1)) / 2;
    fs.forEach((f, i) => {
      const s = String(n.ships[f]), col = f === 0 ? '#c3c8dd' : FAC[f].light;
      c.fillStyle = col;
      if (f) glyph(c, f, x + GW / 2, sy, GW);
      const cx = x + (f ? GW + GG : 0) + (ws[i] - (f ? GW + GG : 0)) / 2;
      c.strokeStyle = 'rgba(8,5,26,.85)'; c.lineWidth = 3.5; c.strokeText(s, cx, sy);
      c.fillStyle = col; c.fillText(s, cx, sy);
      x += ws[i] + gap;
    });
  }
  if (g && g.moved && g.sel.size && g.hover) {
    let total = 0; for (const s of g.sel) if (s !== g.hover) total += sendCount(s);
    if (total > 0) {
      // Aperçu : vaisseaux envoyés → défenseurs sur place. Vert si ça suffit, rouge sinon.
      const h = g.hover; let def = 0; for (let f = 0; f < 5; f++) if (f !== 1) def += h.ships[f];
      const lbl = def ? `${total} → ${def}` : `${total}`;
      c.font = '700 15px Manrope, system-ui, sans-serif';
      const sx = V.ox + h.x * V.sc, sy = V.oy + (h.y - h.r - 18) * V.sc - 14;
      c.strokeStyle = 'rgba(8,5,26,.92)'; c.lineWidth = 4.5; c.strokeText(lbl, sx, sy);
      c.fillStyle = !def ? '#ffffff' : total > def ? '#8dffb0' : '#ff8a80'; c.fillText(lbl, sx, sy);
    }
  }
}

/* ---------- Commandes ---------- */
function ptr(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function pickAt(px, py, strict) {
  let best = null, bd = 1e9;
  for (const n of G.nodes) {
    const sx = view.ox + n.x * view.sc, sy = view.oy + n.y * view.sc, d = Math.hypot(sx - px, sy - py);
    const R = strict ? Math.max(n.r * view.sc + 6, 20) : Math.max(n.r * view.sc + 16, 30);
    if (d < R && d < bd) { bd = d; best = n; }
  }
  return best;
}
const isSource = n => !!n && n.ships[1] > 0;
const canPlay = () => G.mode === 'play' && !G.paused && !G.over && !G.cardOpen;

function dispatch(srcs, tgt) {
  let total = 0;
  for (const s of srcs) total += sendShips(s, tgt, 1, sendCount(s));
  G.sel.clear();
  if (total) { Snd.send(); G.sent += total; advanceHint(); }
}
function tap(n) {
  if (!n) { G.sel.clear(); return; }
  if (G.sel.size) {
    const srcs = [...G.sel].filter(s => s !== n);
    if (srcs.length) dispatch(srcs, n); else G.sel.clear();
    return;
  }
  if (isSource(n)) { G.sel.add(n); Snd.tap(); }
}

cv.addEventListener('pointerdown', e => {
  Snd.ensure();
  if (!canPlay()) return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  const p = ptr(e), n = pickAt(p.x, p.y);
  const g = { id: e.pointerId, x0: p.x, y0: p.y, x: p.x, y: p.y, moved: false, start: n, sel: new Set(), hover: n };
  if (isSource(n)) { if (G.sel.has(n)) G.sel.forEach(s => g.sel.add(s)); g.sel.add(n); }
  G.gest = g;
});
cv.addEventListener('pointermove', e => {
  const g = G.gest; if (!g || e.pointerId !== g.id) return;
  const p = ptr(e); g.x = p.x; g.y = p.y;
  if (!g.moved && Math.hypot(p.x - g.x0, p.y - g.y0) > 12) g.moved = true;
  if (g.moved) {
    g.hover = pickAt(p.x, p.y);
    const hs = pickAt(p.x, p.y, true);
    if (isSource(hs) && !g.sel.has(hs)) { g.sel.add(hs); Snd.tap(); }
  }
});
function endGesture(e, cancel) {
  const g = G.gest; if (!g || e.pointerId !== g.id) return;
  G.gest = null;
  if (cancel || !canPlay()) return;
  if (!g.moved) { tap(g.start); return; }
  const tgt = g.hover;
  const srcs = [...g.sel].filter(s => s !== tgt);
  if (tgt && srcs.length) dispatch(srcs, tgt);
  else G.sel = new Set(g.sel);
}
cv.addEventListener('pointerup', e => endGesture(e, false));
cv.addEventListener('pointercancel', e => endGesture(e, true));

/* ---------- Interface ---------- */
const SOUND_ON = '<svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><path d="M2.5 6.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor"/><path d="M12.5 6.2a4 4 0 0 1 0 5.6M14.8 4a7 7 0 0 1 0 10" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
const SOUND_OFF = '<svg width="20" height="18" viewBox="0 0 20 18" aria-hidden="true"><path d="M2.5 6.5h3l4-3.5v12l-4-3.5h-3z" fill="currentColor"/><path d="M13 6.5l4.5 5M17.5 6.5l-4.5 5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>';
function refreshSound() {
  document.querySelectorAll('.sound-btn').forEach(b => { b.innerHTML = save.muted ? SOUND_OFF : SOUND_ON; b.setAttribute('aria-label', save.muted ? 'Activer le son' : 'Couper le son'); });
}
document.querySelectorAll('.sound-btn').forEach(b => b.addEventListener('click', () => { Snd.ensure(); Snd.setMuted(!save.muted); refreshSound(); }));

function showScreen(id) { for (const s of ['menu', 'pause', 'end', 'card']) $(s).hidden = s !== id; }

function refreshSeg() { document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.p === save.pct))); }
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => { save.pct = +b.dataset.p; persist(); refreshSeg(); Snd.tap(); }));

function refreshSpeed() { $('btnSpeed').textContent = save.speed === 2 ? '×2' : '×1'; }
$('btnSpeed').addEventListener('click', () => { save.speed = save.speed === 2 ? 1 : 2; persist(); refreshSpeed(); });

let menuL = 1;
function refreshMenu() {
  menuL = clamp(save.level, 1, save.best);
  updMenu();
}
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function updMenu() {
  $('play').textContent = save.best === 1 ? 'Commencer' : `Jouer le niveau ${menuL}`;
  $('stepper').hidden = save.best <= 1;
  const st = save.stars[menuL];
  $('lvSel').innerHTML = `Niveau ${menuL}` + (st ? ` <span class="stars" aria-label="${st} étoile${st > 1 ? 's' : ''} sur 3">${starStr(st)}</span>` : '');
  $('lvPrev').disabled = menuL <= 1; $('lvNext').disabled = menuL >= save.best;
  const done = save.daily && save.daily.d === today();
  $('daily').hidden = save.best < 6;
  $('daily').innerHTML = done ? `Défi du jour <span class="daily-done">✓ ${fmtTime(save.daily.t)}</span>` : 'Défi du jour';
}
$('lvPrev').addEventListener('click', () => { menuL = Math.max(1, menuL - 1); updMenu(); });
$('lvNext').addEventListener('click', () => { menuL = Math.min(save.best, menuL + 1); updMenu(); });
$('play').addEventListener('click', () => startLevel(menuL));
$('daily').addEventListener('click', startDaily);

function pause() { if (G.mode !== 'play' || G.over || G.cardOpen) return; G.paused = true; G.gest = null; $('pauseS').textContent = levelName(G.P); showScreen('pause'); }
function resume() { G.paused = false; showScreen(null); }
$('btnPause').addEventListener('click', pause);
$('pResume').addEventListener('click', resume);
$('pRestart').addEventListener('click', restart);
$('pMenu').addEventListener('click', toMenu);
$('endMenu').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); Snd.sleep(); } else Snd.wake(); });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === ' ') { if (G.mode === 'play' && !G.over) { e.preventDefault(); G.paused ? resume() : pause(); } }
});

function setupPower() {
  const el = $('power'); el.innerHTML = '';
  for (const f of G.facs) { const i = document.createElement('i'); i.style.background = FAC[f].col; i.dataset.f = f; el.appendChild(i); }
}
function updateHud() {
  const full = G.tot[1] >= G.cap[1] && G.cap[1] > 0, pop = $('pop');
  pop.innerHTML = `<b>${G.tot[1]}</b> / ${G.cap[1]}${full ? '<i>max</i>' : ''}`;
  pop.classList.toggle('full', full);
  $('power').querySelectorAll('i').forEach(i => { i.style.flexGrow = String(Math.max(0.0001, G.tot[+i.dataset.f])); });
  // Objectifs en direct : chrono contre le temps de référence, et aucune planète perdue.
  const P = G.P, clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const goal = (el, ok, txt) => { el.className = ok ? '' : 'miss'; el.innerHTML = `<b aria-hidden="true">${ok ? '★' : '☆'}</b>${txt}`; };
  if (P.daily) goal($('gTime'), true, clock(G.t));
  else goal($('gTime'), G.t <= parTime(P), `${clock(G.t)} / ${clock(parTime(P))}`);
  $('gSafe').hidden = !!P.daily;
  goal($('gSafe'), !G.lost, 'Aucune planète perdue');
}

function intro(P) {
  const words = ['', 'Un adversaire.', 'Deux adversaires.', 'Trois adversaires.'];
  let s = words[P.enemies];
  if (P.extraEnemyHome) s += ' Il démarre avec deux bases.';
  if (P.extraPlayerHome) s += ' Tu démarres avec deux bases.';
  if (P.breather) s += ' Un niveau plus calme.';
  if (P.boss) s += ` ${FNAME[2]} a un vaisseau-mère.`;
  for (const m of P.mods) s += ' ' + MODS[m];
  const ps = Object.keys(P.persona).map((f, i) => `${FNAME[f]} ${i ? '' : 'est '}${PERS[P.persona[f]].n[+f === 4 ? 1 : 0]}`);
  if (ps.length) s += ' ' + ps.join(', ') + '.';
  if (P.daily) s = 'Même carte pour tout le monde aujourd’hui. ' + s;
  else s += ` Étoile rapide : moins de ${fmtTime(parTime(P))}.`;
  $('introN').textContent = levelName(P); $('introS').textContent = s;
  const el = $('intro'); el.classList.add('on');
  clearTimeout(intro.tm); intro.tm = setTimeout(() => el.classList.remove('on'), s.length > 50 ? 4000 : 2600);
}

const HINTS = {
  1: ['Glisse de ta planète vers une autre cible pour y envoyer tes vaisseaux.', 'Le sélecteur en bas règle la part de la flotte envoyée. Chaque capture augmente ta flotte maximale.'],
  2: ['Glisse sur plusieurs de tes installations avant de relâcher : elles attaquent ensemble.'],
};
function setHint(txt) { const h = $('hint'); h.textContent = txt || ''; h.classList.toggle('on', !!txt); }
function startHints(L) {
  G.hints = save.seen['hint' + L] ? null : HINTS[L] || null; G.hintStep = 0; G.hintL = L;
  setHint(G.hints ? G.hints[0] : '');
}
function advanceHint() {
  if (!G.hints) return;
  G.hintStep++;
  clearTimeout(advanceHint.tm);
  if (G.hintStep < G.hints.length) { setHint(G.hints[G.hintStep]); advanceHint.tm = setTimeout(endHints, 6000); }
  else endHints();
}
function endHints() {
  clearTimeout(advanceHint.tm);
  if (G.hints) { save.seen['hint' + G.hintL] = 1; persist(); }
  G.hints = null; setHint('');
}

let cardQueue = [], cardNode = null;
function openCards(P, then) {
  cardQueue = [];
  for (const k of ['outpost', 'forge', 'relay', 'bastion']) if (P.types.includes(k) && !save.seen['v2' + k]) cardQueue.push(k);
  if (P.garrison && !save.seen.v2garrison) cardQueue.push('garrison');
  for (const k of [...P.mods, P.boss && 'boss', P.L >= 11 && 'persona']) if (k && !save.seen['v2' + k]) cardQueue.push(k);
  openCards.then = then;
  nextCard();
}
function nextCard() {
  const k = cardQueue.shift();
  if (!k) { G.cardOpen = false; G.paused = false; showScreen(null); if (openCards.then) openCards.then(); return; }
  G.cardOpen = true; G.paused = true;
  const C = CARDS[k], type = C.type || (k === 'garrison' ? 'star' : k);
  cardNode = { id: 97, type, x: 0, y: 0, r: T[type].r, owner: C.owner || (k === 'garrison' ? 0 : 1), ships: [0, 0, 0, 0, 0], hp: 1, capP: 0, pulse: 0, flash: 0, fight: 0, rot: 0.6, aim: -0.8, cool: 0, moon: true, key: k };
  if (type === 'star') cardNode.tex = makePlanet(4242);
  if (k === 'garrison') cardNode.ships[0] = 9; else cardNode.ships[cardNode.owner] = 10;
  $('cardT').textContent = CARDS[k].t; $('cardS').textContent = CARDS[k].s;
  showScreen('card'); $('cardOk').focus();
}
$('cardOk').addEventListener('click', () => { if (cardNode) { save.seen['v2' + cardNode.key] = 1; persist(); } nextCard(); });
function renderCard(t) {
  if (!cardNode) return;
  const c = $('cardCv').getContext('2d'), s = 58 / (cardNode.r + 28);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 264, 264);
  c.setTransform(2 * s, 0, 0, 2 * s, 132, 132);
  if (CARDS[cardNode.key].draw) { CARDS[cardNode.key].draw(c, t); return; }
  (cardNode.type === 'mother' ? drawMother : drawBody)(c, cardNode, t);
  drawOrbits(c, cardNode, t, { k: 2 * s, ox: 132, oy: 132 });
}

function fmtTime(s) { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} min ${r} s` : `${r} s`; }

// Temps de référence pour la 3e étoile : grandit avec la taille de la carte.
const parTime = P => 45 + P.nodeCount * 7;

function finish(win) {
  if (G.over) return;
  G.over = true; G.gest = null; G.sel.clear(); endHints();
  const P = G.P, L = P.L, time = G.t;
  let title = win ? 'Victoire' : 'Défaite', text, go, goTxt, goals = null, skip = false;
  if (win) { Snd.win(); vib(30); } else Snd.lose();
  if (P.daily) {
    if (win && !(save.daily && save.daily.d === P.daily && save.daily.t <= time)) save.daily = { d: P.daily, t: Math.round(time) };
    text = win ? `Défi réussi en ${fmtTime(time)}. Un nouveau défi t’attend demain.` : 'Ta flotte a été anéantie. Le défi reste le même jusqu’à demain : réessaie.';
    goTxt = win ? 'Rejouer le défi' : 'Réessayer'; go = startDaily;
  } else if (win) {
    // Étoiles indépendantes : victoire, rapidité, aucune planète perdue.
    const fast = time <= parTime(P);
    goals = [[true, 'Gagner le niveau'], [fast, `Finir en moins de ${fmtTime(parTime(P))}`], [!G.lost, 'Ne perdre aucune planète']];
    const stars = goals.filter(g => g[0]).length;
    const prevT = save.times[L];
    save.stars[L] = Math.max(save.stars[L] || 0, stars);
    save.times[L] = Math.round(prevT ? Math.min(prevT, time) : time);
    save.best = Math.max(save.best, L + 1); save.level = L + 1; save.fail = null;
    text = `Niveau ${L} terminé en ${fmtTime(time)}.` + (prevT && time < prevT ? ' Nouveau record !' : prevT ? ` Record : ${fmtTime(prevT)}.` : '');
    goTxt = `Jouer le niveau ${L + 1}`; go = () => startLevel(L + 1);
  } else {
    save.level = L;
    save.fail = { L, n: save.fail && save.fail.L === L ? save.fail.n + 1 : 1 };
    skip = save.fail.n >= 3 && save.best <= L;
    text = 'Ta flotte a été anéantie. La carte reste la même : essaie une autre ouverture.';
    goTxt = 'Réessayer'; go = () => startLevel(L);
  }
  persist();
  setTimeout(() => {
    if (G.mode !== 'play' || !G.over || G.P !== P) return;
    $('endT').textContent = title; $('endS').textContent = text;
    $('endStars').innerHTML = goals ? goals.map(([ok, t]) => `<li${ok ? '' : ' class="miss"'}><b aria-hidden="true">${ok ? '★' : '☆'}</b>${t}<em>${ok ? 'Atteint' : 'Manqué'}</em></li>`).join('') : '';
    $('endStars').hidden = !goals;
    $('endGo').textContent = goTxt; $('endGo').onclick = go;
    $('endSkip').hidden = !skip;
    showScreen('end'); $('endGo').focus();
  }, 1300);
}
$('endSkip').addEventListener('click', () => { const L = G.P.L; save.best = Math.max(save.best, L + 1); save.fail = null; startLevel(L + 1); });

const levelName = P => P.daily ? 'Défi du jour' : `Niveau ${P.L}`;
// Date locale AAAAMMJJ : le défi change à minuit, la carte est la même pour tous ce jour-là.
function today() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function startDaily() {
  const day = today(), P = makeParams(12 + hash(day) % 24);
  P.seed = hash(day * 13 + 5); P.daily = day;
  play(P);
}
function restart() { if (G.P.daily) startDaily(); else startLevel(G.P.L); }

function startLevel(L) {
  save.level = L; persist();
  play(makeParams(L));
}
function play(P) {
  Snd.ensure();
  G.mode = 'play'; G.paused = false; G.cardOpen = false;
  $('hud').hidden = false; $('dock').hidden = false; showScreen(null);
  $('lvl').textContent = levelName(P);
  buildWorld(P, false);
  update(0);  // calcule flotte et maximum pour le HUD, même si une carte met le jeu en pause
  setupPower(); updateHud(); endHints(); render();
  openCards(P, () => { intro(P); if (!P.daily) startHints(P.L); });
}

function startDemo() {
  const L = 10 + ((Math.random() * 20) | 0);
  const P = makeParams(L);
  P.enemies = Math.random() < 0.5 ? 2 : 3; P.extraPlayerHome = false;
  P.aiInterval = 1.5; P.aiDelay = 0.6; P.enemyStart = 30; P.playerStart = 30;
  P.nodeCount = clamp(P.nodeCount + 2, 12, 20);
  P.seed = (Math.random() * 1e9) | 0;
  buildWorld(P, true);
}

function toMenu() {
  G.mode = 'menu'; G.paused = false; G.cardOpen = false;
  clearTimeout(advanceHint.tm); G.hints = null;
  $('hud').hidden = true; $('dock').hidden = true; setHint(''); $('intro').classList.remove('on');
  refreshMenu(); showScreen('menu');
  startDemo();
}

/* ---------- Boucle ---------- */
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  // 60 images/s au plus en jeu (écrans 120 Hz), 30 derrière le menu.
  if (now - last < (G.mode === 'menu' ? 30 : 15)) return;
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (G.cardOpen) renderCard(now / 1000);
  // En pause ou sur l'écran de fin, la scène est figée : on ne redessine rien.
  if (G.mode === 'play' && (G.paused || !$('end').hidden)) return;
  if (G.nodes.length) {
    const sp = G.mode === 'play' ? save.speed : 1;
    for (let i = 0; i < sp; i++) update(dt);
  }
  if (G.mode === 'play') { G.hudT -= dt; if (G.hudT <= 0) { G.hudT = 0.25; updateHud(); } }
  render();
}

buildSprites();
refreshSound(); refreshSeg(); refreshSpeed();
resize();
window.addEventListener('resize', resize);
try { new ResizeObserver(resize).observe(document.body); } catch (e) {}
toMenu();
requestAnimationFrame(frame);
window.__orbis = { G, update, startLevel, startDemo, makeParams, aiThink, render };
})();
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
