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
  { col: '#8c93b8' },  // neutre
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
};

const CARDS = {
  outpost: { t: 'Satellite', s: 'Petit et vite capturé. Il produit peu, mais chaque capture augmente ta flotte maximale.' },
  forge:   { t: 'Chantier orbital', s: 'Produit deux fois plus qu’une planète. Sa capture est longue : garde assez de vaisseaux sur place.' },
  relay:   { t: 'Relais', s: 'Les vaisseaux qui partent d’un relais que tu contrôles voyagent deux fois plus vite. Idéal pour frapper loin.' },
  bastion: { t: 'Bastion', s: 'Une fois capturé, il abat les vaisseaux ennemis à portée, en vol comme en orbite. Neutre, il reste inactif.' },
  garrison:{ t: 'Garnisons', s: 'Certaines planètes et installations neutres sont gardées. Envoie plus de vaisseaux que la garnison pour les capturer.' },
};

/* ---------- Sauvegarde ---------- */
const SAVE_KEY = 'orbis.v1';
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
const save = Object.assign({ level: 1, best: 1, pct: 0.5, muted: false, speed: 1, seen: {} }, load());
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

/* ---------- Son (synthétisé) ---------- */
const Snd = {
  ac: null, out: null, nb: null, last: {},
  ensure() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC();
      this.out = this.ac.createGain(); this.out.gain.value = save.muted ? 0 : 0.55;
      const comp = this.ac.createDynamicsCompressor();
      this.out.connect(comp); comp.connect(this.ac.destination);
      this.ambient();
    } catch (e) { this.ac = null; }
  },
  setMuted(m) { save.muted = m; persist(); if (this.out) this.out.gain.setTargetAtTime(m ? 0 : 0.55, this.ac.currentTime, 0.05); },
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
const SPR = { glow: [], dot: [], ship: [], orb: [], star: null };
const HULLS = [
  'M28 12 L22 6.5 L13 6.5 L10 12 L13 17.5 L22 17.5 Z',
  'M35 12 L13 3.5 L17 12 L13 20.5 Z',
  'M34 12 L20 6 L11 2.5 L15 9.5 L12 12 L15 14.5 L11 21.5 L20 18 Z',
  'M33 12 L12 1.5 L15.5 8 L11 12 L15.5 16 L12 22.5 Z',
  'M36 12 C30 9 22 9.5 14 10 L11 6 L8.5 6 L11 12 L8.5 18 L11 18 L14 14 C22 14.5 30 15 36 12 Z',
];
function makeHull(i, F) {
  const c = mkCanvas(80, 48), x = c.getContext('2d'); x.scale(2, 2);
  let g = x.createRadialGradient(10, 12, 0, 10, 12, 10);
  g.addColorStop(0, rgba(F.light, 0.95)); g.addColorStop(0.35, rgba(F.col, 0.45)); g.addColorStop(1, rgba(F.col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 22, 24);
  const hull = new Path2D(HULLS[i]);
  g = x.createLinearGradient(0, 3, 0, 21); g.addColorStop(0, F.light); g.addColorStop(0.5, F.col); g.addColorStop(1, F.dark);
  x.fillStyle = g; x.fill(hull);
  x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 0.8; x.stroke(hull);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.beginPath(); x.ellipse(i === 0 ? 20 : 26, 12, 2.8, 1.2, 0, 0, TAU); x.fill();
  return c;
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
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
    g = x.createRadialGradient(48, 42, 4, 64, 64, 64);
    g.addColorStop(0, mix(F.col, '#ffffff', 0.8)); g.addColorStop(0.3, mix(F.col, '#ffffff', 0.18));
    g.addColorStop(0.72, mix(F.col, '#100830', 0.45)); g.addColorStop(1, mix(F.col, '#06041a', 0.8));
    x.fillStyle = g; x.beginPath(); x.arc(64, 64, 63, 0, TAU); x.fill();
    x.globalCompositeOperation = 'source-atop';
    for (let k = 0; k < 5; k++) { x.fillStyle = `rgba(255,255,255,${0.03 + k * 0.006})`; x.beginPath(); x.ellipse(64, 30 + k * 17, 70, 4 + k, -0.18, 0, TAU); x.fill(); }
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = rgba(F.light, 0.35); x.lineWidth = 2; x.beginPath(); x.arc(64, 64, 61, -2.6, -0.6); x.stroke();
    SPR.orb[i] = c;
  });
  const c = mkCanvas(16, 16), x = c.getContext('2d'), g = x.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(220,225,255,.45)'); g.addColorStop(1, 'rgba(200,210,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 16, 16); SPR.star = c;
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
  const n = Math.round(w * h / 1700);
  for (let i = 0; i < n; i++) {
    const sx = r() * w, sy = r() * h, big = r() > 0.93, s = big ? 0.9 + r() * 0.9 : 0.25 + r() * 0.6, a = 0.25 + r() * 0.6;
    x.fillStyle = r() < 0.16 ? `hsla(${r() < 0.5 ? 205 : 40},90%,86%,${a})` : `rgba(255,255,255,${a})`;
    x.beginPath(); x.arc(sx, sy, s, 0, TAU); x.fill();
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
  const breather = L > 4 && L % 5 === 0;
  const d = breather ? t * 0.55 : t;
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
  return {
    L, d, enemies, types, breather,
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
    enemyStart: Math.round(lerp(10, 44, d)),
    enemyProd: 1 + 0.35 * d * (enemies === 1 ? 1 : 0.55),
    extraEnemyHome: L >= 9 && enemies === 1 && r() < 0.3 + d * 0.3,
    extraPlayerHome: enemies >= 3 || (enemies === 2 && r() < 0.5),
  };
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
  G.checkT = 0; G.hudT = 0; G.sent = 0;
  G.facs = []; for (let f = 1; f <= P.enemies + 1; f++) G.facs.push(f);
  G.ai = {}; for (const f of G.facs) if (f !== 1 || demo) G.ai[f] = { t: P.aiDelay * (0.8 + Math.random() * 0.4) };
  const a = playArea();
  const L = genLevel(P, a.w / a.h);
  G.W = L.W; G.H = L.H; G.nodes = L.nodes;
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
    if (o > 0 && n.hp >= 1 && tot[o] < cap[o]) {
      n.acc += dt * T[n.type].prod * (G.demo || o === 1 ? 1 : P.enemyProd);
      while (n.acc >= 1) { n.acc -= 1; n.ships[o]++; tot[o]++; }
    }
  }

  // vaisseaux en vol
  for (let i = SH.length - 1; i >= 0; i--) {
    const s = SH[i];
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.prog += s.spd * dt / s.len;
    if (s.prog >= s.end) { s.to.ships[s.f]++; s.to.flash = Math.min(1, s.to.flash + 0.06); SH[i] = SH[SH.length - 1]; SH.pop(); continue; }
    const b = Math.sin(Math.PI * s.prog) * s.off;
    s.x = s.sx + (s.ex - s.sx) * s.prog + s.nx * b;
    s.y = s.sy + (s.ey - s.sy) * s.prog + s.ny * b;
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

  // bastions
  const R = T.bastion.range, R2 = R * R;
  for (const n of N) {
    if (n.type !== 'bastion' || n.owner <= 0 || n.hp < 1) continue;
    n.cool -= dt; if (n.cool > 0) continue;
    const o = n.owner; let best = -1, bd = R2;
    for (let i = 0; i < SH.length; i++) {
      const s = SH[i]; if (s.f === o || s.delay > 0) continue;
      const dx = s.x - n.x, dy = s.y - n.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    if (best >= 0) {
      const s = SH[best]; beam(n, s.x, s.y, o); spark(s.x, s.y, s.f, 5);
      SH[best] = SH[SH.length - 1]; SH.pop(); n.cool = 1 / T.bastion.rate;
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
      tn.ships[tf]--; beam(n, x, y, o); spark(x, y, tf, 5); n.cool = 1 / T.bastion.rate;
      if (!G.demo && (o === 1 || tf === 1)) Snd.zap();
    } else n.cool = 0.2;
  }

  // IA
  for (const k in G.ai) { const A = G.ai[k]; A.t -= dt; if (A.t <= 0) { A.t = P.aiInterval * (0.75 + Math.random() * 0.5); aiThink(+k); } }

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
  const P = G.P, N = G.nodes;
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
    const src = [...avail.entries()].filter(([n, a]) => a > 0 && n !== target).sort((A, B) => dist(A[0], target) - dist(B[0], target));
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
    let nd = Infinity; for (const [s, a] of avail) if (a > 0) nd = Math.min(nd, dist(s, n));
    if (!isFinite(nd)) continue;
    const tp = T[n.type];
    let def = enemyAt(n) + enemyInc(n);
    if (n.owner > 0) def += tp.prod * (nd / SPEED) * 0.8;
    for (const b of N) if (b.type === 'bastion' && b.owner > 0 && b.owner !== f && b.hp >= 1 && dist(b, n) < T.bastion.range + n.r) def += 7;
    const need = Math.ceil(def * P.margin + (n.owner === 0 ? 2 + tp.ct * 0.4 : 4) - inc[n.id][f] - n.ships[f]);
    if (need <= 0) continue;
    let val = tp.prod * 2 + tp.cap * 0.02 + (n.type === 'bastion' ? 1.2 : 0);
    if (n.owner > 0) val += P.aggr * 0.8 + (n.owner === 1 && !G.demo ? 0.4 * P.aggr : 0);
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
    if (rr && front(rr) > front(fr) + 80) sendShips(rr, fr, f, Math.floor(avail.get(rr) * 0.7));
  }
}

/* ---------- Rendu ---------- */
function poly(c, x, y, r, sides, rot) {
  c.beginPath();
  for (let i = 0; i < sides; i++) { const a = rot + i * TAU / sides, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath();
}

const METAL_L = '#e7eaf5', METAL_M = '#9aa1bf', METAL_D = '#464b68';
const PLANETS = [
  { base: ['#1b4f8f', '#2f86c4'], land: ['#3d8a57', '#7aa35a', '#c7b07a'], clouds: true },
  { base: ['#a8643a', '#d89a5e'], land: ['#7d4325', '#e9c08b', '#b8774a'], craters: true },
  { bands: ['#c9a27a', '#ead3b2', '#a8775a', '#f2e6cf', '#b8885f'] },
  { base: ['#8fb7d3', '#dcedf8'], land: ['#ffffff', '#a9cbe2'], craters: true },
  { base: ['#2a1416', '#4a1f1d'], land: ['#7a2a1a', '#5a2018'], lava: true },
  { bands: ['#5d469a', '#8f7bd0', '#3e3172', '#b9a9e8', '#6f58b0'] },
  { base: ['#1f6b68', '#3fa39b'], land: ['#d9e6c4', '#2f8a6e', '#9fd0b8'], clouds: true },
  { bands: ['#9cc3c9', '#d7ecee', '#6f9fa8', '#bfe0e3'] },
];
function makePlanet(seed) {
  const r = mulberry32(seed), S = 160, h = S / 2, c = mkCanvas(S, S), x = c.getContext('2d');
  const k = PLANETS[(r() * PLANETS.length) | 0];
  x.save(); x.beginPath(); x.arc(h, h, h - 1, 0, TAU); x.clip();
  if (k.bands) {
    x.fillStyle = k.bands[0]; x.fillRect(0, 0, S, S);
    let y = -10;
    while (y < S + 10) {
      const bh = 5 + r() * 16, wob = r() * 4, ph = r() * TAU;
      x.fillStyle = k.bands[(r() * k.bands.length) | 0]; x.globalAlpha = 0.55 + r() * 0.45;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 0; px <= S; px += 10) x.lineTo(px, y + Math.sin(px / 18 + ph) * wob);
      for (let px = S; px >= 0; px -= 10) x.lineTo(px, y + bh + Math.sin(px / 15 + ph) * wob);
      x.closePath(); x.fill(); y += bh * 0.8;
    }
    x.globalAlpha = 0.85; x.fillStyle = k.bands[(r() * k.bands.length) | 0];
    x.beginPath(); x.ellipse(h + (r() - 0.5) * 60, h + (r() - 0.5) * 50, 10 + r() * 8, 5 + r() * 4, 0, 0, TAU); x.fill();
  } else {
    const g = x.createRadialGradient(h, h, 0, h, h, h); g.addColorStop(0, k.base[1]); g.addColorStop(1, k.base[0]);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
    const cs = []; for (let i = 0; i < 4; i++) cs.push([r() * S, r() * S]);
    for (let i = 0; i < 70; i++) {
      const [cx, cy] = cs[i % 4];
      x.globalAlpha = 0.35 + r() * 0.5; x.fillStyle = k.land[(r() * k.land.length) | 0];
      x.beginPath(); x.ellipse(cx + (r() - 0.5) * 70, cy + (r() - 0.5) * 60, 4 + r() * 16, 3 + r() * 10, r() * Math.PI, 0, TAU); x.fill();
    }
    if (k.craters) for (let i = 0; i < 14; i++) {
      const cx = r() * S, cy = r() * S, cr = 2 + r() * 7;
      x.globalAlpha = 0.3; x.fillStyle = '#000'; x.beginPath(); x.arc(cx, cy, cr, 0, TAU); x.fill();
      x.globalAlpha = 0.35; x.strokeStyle = '#fff'; x.lineWidth = 1; x.beginPath(); x.arc(cx - 0.6, cy - 0.6, cr, Math.PI, Math.PI * 1.6); x.stroke();
    }
    if (k.clouds) for (let i = 0; i < 26; i++) {
      x.globalAlpha = 0.18 + r() * 0.25; x.fillStyle = '#fff';
      x.beginPath(); x.ellipse(r() * S, r() * S, 8 + r() * 22, 2 + r() * 5, (r() - 0.5) * 0.4, 0, TAU); x.fill();
    }
    if (k.lava) {
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 12; i++) {
        x.globalAlpha = 0.5 + r() * 0.4; x.strokeStyle = r() < 0.5 ? '#ff6a1f' : '#ffb347'; x.lineWidth = 1 + r() * 2;
        x.beginPath(); let px = r() * S, py = r() * S; x.moveTo(px, py);
        for (let j = 0; j < 5; j++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); }
        x.stroke();
      }
      x.globalCompositeOperation = 'source-over';
    }
  }
  x.globalAlpha = 1;
  const g = x.createRadialGradient(S * 0.34, S * 0.3, S * 0.05, S * 0.5, S * 0.5, S * 0.62);
  g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(0.45, 'rgba(0,0,0,0)');
  g.addColorStop(0.8, 'rgba(4,2,16,.55)'); g.addColorStop(1, 'rgba(4,2,16,.92)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.restore();
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
  const home = n.type === 'home';
  const ringHalf = (a0, a1, alpha) => {
    c.save(); c.translate(n.x, n.y); c.rotate(-0.35);
    c.lineWidth = r * 0.24; c.strokeStyle = rgba(F.col, alpha * 0.55); c.beginPath(); c.ellipse(0, 0, r * 1.85, r * 0.5, 0, a0, a1); c.stroke();
    c.lineWidth = 1; c.strokeStyle = rgba(F.light, alpha); c.beginPath(); c.ellipse(0, 0, r * 1.62, r * 0.43, 0, a0, a1); c.stroke();
    c.beginPath(); c.ellipse(0, 0, r * 2.05, r * 0.56, 0, a0, a1); c.stroke();
    c.restore();
  };
  if (home) ringHalf(Math.PI, TAU, 0.45);
  c.lineWidth = r * 0.2; c.strokeStyle = rgba(F.col, f ? 0.32 : 0.12);
  c.beginPath(); c.arc(n.x, n.y, r * 1.07, 0, TAU); c.stroke();
  c.drawImage(n.tex || SPR.orb[f], n.x - r, n.y - r, r * 2, r * 2);
  if (!f) { c.fillStyle = 'rgba(10,7,30,.38)'; c.beginPath(); c.arc(n.x, n.y, r, 0, TAU); c.fill(); }
  c.lineWidth = 1.7; c.strokeStyle = rgba(F.light, f ? 0.95 : 0.35);
  c.beginPath(); c.arc(n.x, n.y, r + 0.7, -2.8, -0.2); c.stroke();
  if (home) ringHalf(0, Math.PI, 0.85);
  else {
    const a0 = n.rot + t * 0.5;
    c.strokeStyle = rgba(F.light, 0.3); c.lineWidth = 1;
    c.beginPath(); c.arc(n.x, n.y, r * 1.45, a0, a0 + TAU * 0.6); c.stroke();
    if (n.moon) {
      const ma = n.rot * 3 + t * 0.55, mx = n.x + Math.cos(ma) * r * 1.5, my = n.y + Math.sin(ma) * r * 1.35, mr = r * 0.17;
      c.drawImage(SPR.orb[0], mx - mr, my - mr, mr * 2, mr * 2);
    }
  }
}

function drawSatellite(c, n, t, r, F, f) {
  c.save(); c.translate(n.x, n.y); c.rotate(n.rot + t * 0.22);
  const pw = r * 0.95, ph = r * 0.6, gap = r * 0.42;
  for (const side of [-1, 1]) {
    c.strokeStyle = METAL_M; c.lineWidth = r * 0.08;
    c.beginPath(); c.moveTo(side * r * 0.25, 0); c.lineTo(side * gap, 0); c.stroke();
    const x0 = side > 0 ? gap : -gap - pw;
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2); g.addColorStop(0, '#4a72d0'); g.addColorStop(1, '#162563');
    c.fillStyle = g; c.fillRect(x0, -ph / 2, pw, ph);
    c.strokeStyle = 'rgba(170,200,255,.4)'; c.lineWidth = 0.6; c.beginPath();
    for (let i = 1; i < 4; i++) { c.moveTo(x0 + pw * i / 4, -ph / 2); c.lineTo(x0 + pw * i / 4, ph / 2); }
    c.moveTo(x0, 0); c.lineTo(x0 + pw, 0); c.stroke();
    c.strokeStyle = 'rgba(210,225,255,.75)'; c.lineWidth = 0.9; c.strokeRect(x0, -ph / 2, pw, ph);
  }
  const bw = r * 0.34, bh = r * 0.46;
  const g = c.createLinearGradient(-bw, 0, bw, 0); g.addColorStop(0, METAL_D); g.addColorStop(0.45, METAL_L); g.addColorStop(1, '#6a7090');
  c.fillStyle = g; c.fillRect(-bw, -bh, bw * 2, bh * 2);
  c.fillStyle = F.col; c.fillRect(-bw, -r * 0.09, bw * 2, r * 0.18);
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.06; c.beginPath(); c.moveTo(0, -bh); c.lineTo(0, -bh - r * 0.22); c.stroke();
  c.fillStyle = METAL_L; c.beginPath(); c.ellipse(0, -bh - r * 0.3, r * 0.3, r * 0.12, 0, 0, TAU); c.fill();
  c.restore();
  if (Math.sin(t * 3.5 + n.id) > 0.55) {
    c.globalCompositeOperation = 'lighter'; c.drawImage(SPR.dot[f], n.x - 6, n.y - 6, 12, 12); c.globalCompositeOperation = 'source-over';
  }
}

function drawShipyard(c, n, t, r, F, f) {
  const spin = n.rot + t * 0.22, R = r * 1.02, sq = 0.42;
  c.save(); c.translate(n.x, n.y); c.rotate(-0.22);
  const torus = (a0, a1) => {
    c.lineWidth = r * 0.3; c.strokeStyle = METAL_D; c.beginPath(); c.ellipse(0, 0, R, R * sq, 0, a0, a1); c.stroke();
    c.lineWidth = r * 0.12; c.strokeStyle = METAL_M; c.beginPath(); c.ellipse(0, -r * 0.05, R, R * sq, 0, a0, a1); c.stroke();
  };
  const spokes = front => {
    c.lineWidth = r * 0.07; c.strokeStyle = METAL_M;
    for (let k = 0; k < 4; k++) { const a = spin + k * Math.PI / 2, s = Math.sin(a); if ((s >= 0) !== front) continue; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * R, s * R * sq); c.stroke(); }
  };
  const lights = front => {
    for (let k = 0; k < 12; k++) {
      const a = spin + k * TAU / 12, s = Math.sin(a); if ((s >= 0) !== front) continue;
      c.globalAlpha = front ? 1 : 0.4; c.fillStyle = k % 3 === 0 ? F.light : F.col;
      c.beginPath(); c.arc(Math.cos(a) * R, s * R * sq, r * 0.055, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  };
  torus(Math.PI, TAU); lights(false); spokes(false);
  const hw = r * 0.24, hh = r * 0.62;
  const g = c.createLinearGradient(-hw, 0, hw, 0); g.addColorStop(0, METAL_D); g.addColorStop(0.45, METAL_L); g.addColorStop(1, METAL_D);
  c.fillStyle = g; c.fillRect(-hw, -hh, hw * 2, hh * 2);
  c.fillStyle = METAL_L; c.beginPath(); c.ellipse(0, -hh, hw, hw * 0.4, 0, 0, TAU); c.fill();
  c.fillStyle = F.col; c.fillRect(-hw, -r * 0.09, hw * 2, r * 0.18);
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.05; c.beginPath(); c.moveTo(0, -hh); c.lineTo(0, -hh - r * 0.38); c.stroke();
  c.fillStyle = F.light; c.beginPath(); c.arc(0, -hh - r * 0.38, r * 0.06, 0, TAU); c.fill();
  spokes(true); torus(0, Math.PI); lights(true);
  c.restore();
}

function drawBastion(c, n, t, r, F, f) {
  c.save(); c.translate(n.x, n.y);
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + k * TAU / 3, ex = Math.cos(a) * r * 1.25, ey = Math.sin(a) * r * 1.25;
    c.strokeStyle = METAL_D; c.lineWidth = r * 0.22; c.beginPath(); c.moveTo(0, 0); c.lineTo(ex, ey); c.stroke();
    c.strokeStyle = METAL_M; c.lineWidth = r * 0.08; c.stroke();
    c.fillStyle = f > 0 && ((t * 1.5 + k / 3) % 1) < 0.5 ? F.light : F.col;
    c.beginPath(); c.arc(ex, ey, r * 0.14, 0, TAU); c.fill();
  }
  let g = c.createLinearGradient(0, -r, 0, r); g.addColorStop(0, '#7b82a0'); g.addColorStop(1, '#2b2f46');
  c.fillStyle = g; poly(c, 0, 0, r * 0.82, 8, Math.PI / 8); c.fill();
  c.strokeStyle = rgba(F.col, f ? 0.95 : 0.5); c.lineWidth = 1.6; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; poly(c, 0, 0, r * 0.6, 8, Math.PI / 8); c.stroke();
  const ca = Math.cos(n.aim), sa = Math.sin(n.aim), px = -sa, py = ca;
  c.strokeStyle = '#d9deee'; c.lineWidth = r * 0.11;
  for (const o of [-1, 1]) { c.beginPath(); c.moveTo(px * o * r * 0.13, py * o * r * 0.13); c.lineTo(ca * r * 0.98 + px * o * r * 0.13, sa * r * 0.98 + py * o * r * 0.13); c.stroke(); }
  g = c.createRadialGradient(-r * 0.12, -r * 0.15, 1, 0, 0, r * 0.42); g.addColorStop(0, METAL_L); g.addColorStop(1, '#565c7c');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 0.4, 0, TAU); c.fill();
  c.fillStyle = F.col; c.beginPath(); c.arc(0, 0, r * 0.15, 0, TAU); c.fill();
  c.restore();
  if (f > 0 && n.cool > 1 / T.bastion.rate - 0.09) {
    c.globalCompositeOperation = 'lighter';
    c.drawImage(SPR.dot[f], n.x + ca * r * 1.05 - 8, n.y + sa * r * 1.05 - 8, 16, 16);
    c.globalCompositeOperation = 'source-over';
  }
}

function drawRelay(c, n, t, r, F, f) {
  const w = r * 0.72, h = r * 1.3;
  c.save(); c.translate(n.x, n.y);
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.09;
  c.beginPath(); c.moveTo(-w * 0.45, h * 0.86); c.lineTo(-w * 0.95, h * 1.18); c.moveTo(w * 0.45, h * 0.86); c.lineTo(w * 0.95, h * 1.18); c.stroke();
  c.save(); c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, TAU); c.clip();
  const g = c.createRadialGradient(0, 0, 1, 0, 0, h);
  g.addColorStop(0, rgba(F.light, f ? 0.9 : 0.22)); g.addColorStop(0.5, rgba(F.col, f ? 0.4 : 0.1)); g.addColorStop(1, rgba(F.col, 0.02));
  c.fillStyle = g; c.fillRect(-w, -h, w * 2, h * 2);
  c.globalCompositeOperation = 'lighter'; c.strokeStyle = rgba(F.light, f ? 0.5 : 0.15); c.lineWidth = 1;
  for (let k = 0; k < 3; k++) { const ph = (t * (f ? 0.9 : 0.3) + k / 3) % 1; c.globalAlpha = 1 - ph; c.beginPath(); c.ellipse(0, 0, w * ph, h * ph, 0, 0, TAU); c.stroke(); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.restore();
  c.strokeStyle = METAL_D; c.lineWidth = r * 0.24; c.beginPath(); c.ellipse(0, 0, w, h, 0, 0, TAU); c.stroke();
  c.strokeStyle = METAL_M; c.lineWidth = r * 0.1; c.stroke();
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6 + Math.PI / 6, x = Math.cos(a) * w, y = Math.sin(a) * h;
    c.fillStyle = METAL_L; c.fillRect(x - r * 0.11, y - r * 0.11, r * 0.22, r * 0.22);
    c.fillStyle = F.col; c.beginPath(); c.arc(x, y, r * 0.065, 0, TAU); c.fill();
  }
  c.restore();
}

function drawArcs(c, n) {
  const R = n.r + 5;
  if (n.owner === 0 && n.capP > 0) {
    c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,255,255,.09)'; c.beginPath(); c.arc(n.x, n.y, R, 0, TAU); c.stroke();
    c.strokeStyle = FAC[n.capF].col; c.beginPath(); c.arc(n.x, n.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * n.capP); c.stroke();
  } else if (n.owner > 0 && n.hp < 1) {
    c.lineWidth = 2.6; c.strokeStyle = 'rgba(255,80,80,.18)'; c.beginPath(); c.arc(n.x, n.y, R, 0, TAU); c.stroke();
    c.strokeStyle = FAC[n.owner].col; c.beginPath(); c.arc(n.x, n.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * n.hp); c.stroke();
  }
}

function drawOrbits(c, n, t, B) {
  const K = B.k;
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
      if (n.fight > 0) { const q = (t * 30) | 0; x += (hrand(base + q) - 0.5) * 3 * n.fight; y += (hrand(base + 5 + q) - 0.5) * 3 * n.fight; }
      let hx = -sa * dir, hy = ca * 0.9 * dir; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m;
      c.setTransform(K * hx, K * hy, -K * hy, K * hx, B.ox + K * x, B.oy + K * y);
      c.drawImage(spr, -w / 2, -h / 2, w, h);
    }
  }
  c.setTransform(K, 0, 0, K, B.ox, B.oy);
}

function drawTrails(c) {
  const SH = G.ships;
  for (const f of G.facs) {
    c.beginPath(); let any = false;
    for (const s of SH) { if (s.f !== f || s.delay > 0) continue; any = true; c.moveTo(s.x - s.ux * 3, s.y - s.uy * 3); c.lineTo(s.x - s.ux * s.tl, s.y - s.uy * s.tl); }
    if (!any) continue;
    c.strokeStyle = rgba(FAC[f].col, 0.42); c.lineWidth = 1.3; c.stroke();
  }
}

function drawFleet(c, B) {
  const K = B.k;
  for (const s of G.ships) {
    const cp = Math.cos(Math.PI * s.prog) * Math.PI * s.off / s.len;
    let hx = s.ux + s.nx * cp, hy = s.uy + s.ny * cp; const m = Math.hypot(hx, hy) || 1; hx /= m; hy /= m;
    c.setTransform(K * hx, K * hy, -K * hy, K * hx, B.ox + K * s.x, B.oy + K * s.y);
    c.drawImage(SPR.ship[s.f], -7.5, -4.5, 15, 9);
  }
  c.setTransform(K, 0, 0, K, B.ox, B.oy);
}

function drawParts(c) {
  for (const p of G.parts) {
    const a = p.life / p.max;
    if (p.k === 0) { c.globalAlpha = a; const s = p.s * (0.5 + a * 0.5); c.drawImage(SPR.dot[p.f], p.x - s / 2, p.y - s / 2, s, s); }
    else if (p.k === 1) { c.globalAlpha = a * 0.8; c.strokeStyle = FAC[p.f].col; c.lineWidth = 2.5 * a + 0.4; c.beginPath(); c.arc(p.x, p.y, p.r0 + (p.r1 - p.r0) * (1 - a), 0, TAU); c.stroke(); }
    else { c.globalAlpha = a * 0.35; c.strokeStyle = FAC[p.f].col; c.lineWidth = 5; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x2, p.y2); c.stroke(); c.globalAlpha = a; c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.stroke(); }
  }
  c.globalAlpha = 1;
}

function sendCount(n) { const m = n.ships[1]; return save.pct >= 1 ? m : Math.max(1, Math.floor(m * save.pct)); }

function render() {
  const c = ctx, t = G.t, V = view;
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (BG) c.drawImage(BG, 0, 0); else { c.fillStyle = '#0b0820'; c.fillRect(0, 0, cv.width, cv.height); }
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.globalCompositeOperation = 'lighter';
  const now = performance.now() / 1000;
  for (const s of TW) { c.globalAlpha = 0.12 + 0.55 * (0.5 + 0.5 * Math.sin(now * s.s + s.p)); const z = s.z * 2; c.drawImage(SPR.star, s.x - z, s.y - z, z * 2, z * 2); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  if (!G.nodes.length) return;

  const k = V.sc * dpr; c.setTransform(k, 0, 0, k, V.ox * dpr, V.oy * dpr);
  const N = G.nodes;

  for (const n of N) if (n.type === 'bastion' && n.owner > 0) {
    c.fillStyle = rgba(FAC[n.owner].col, 0.035); c.beginPath(); c.arc(n.x, n.y, T.bastion.range, 0, TAU); c.fill();
    c.setLineDash([3, 7]); c.lineDashOffset = t * 4; c.strokeStyle = rgba(FAC[n.owner].col, 0.2); c.lineWidth = 1.1; c.stroke(); c.setLineDash([]);
  }

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

  for (const n of N) drawBody(c, n, t);
  c.lineCap = 'round';
  for (const n of N) drawArcs(c, n);

  const sel = g ? g.sel : G.sel;
  if (sel.size) {
    c.strokeStyle = `rgba(255,255,255,${0.55 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 1.6;
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
    const ws = fs.map(f => c.measureText(String(n.ships[f])).width), gap = 9;
    let x = sx - (ws.reduce((a, b) => a + b, 0) + gap * (fs.length - 1)) / 2;
    fs.forEach((f, i) => {
      const s = String(n.ships[f]), cx = x + ws[i] / 2;
      c.strokeStyle = 'rgba(8,5,26,.85)'; c.lineWidth = 3.5; c.strokeText(s, cx, sy);
      c.fillStyle = f === 0 ? '#c3c8dd' : FAC[f].light; c.fillText(s, cx, sy);
      x += ws[i] + gap;
    });
  }
  if (g && g.moved && g.sel.size && g.hover) {
    let total = 0; for (const s of g.sel) if (s !== g.hover) total += sendCount(s);
    if (total > 0) {
      c.font = '700 14px Manrope, system-ui, sans-serif';
      const lbl = `${total}`, sx = V.ox + g.hover.x * V.sc, sy = V.oy + (g.hover.y - g.hover.r - 18) * V.sc - 14;
      c.strokeStyle = 'rgba(8,5,26,.9)'; c.lineWidth = 4; c.strokeText(lbl, sx, sy);
      c.fillStyle = '#ffffff'; c.fillText(lbl, sx, sy);
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
function updMenu() {
  $('play').textContent = save.best === 1 ? 'Commencer' : `Jouer le niveau ${menuL}`;
  $('stepper').hidden = save.best <= 1;
  $('lvSel').textContent = `Niveau ${menuL}`;
  $('lvPrev').disabled = menuL <= 1; $('lvNext').disabled = menuL >= save.best;
}
$('lvPrev').addEventListener('click', () => { menuL = Math.max(1, menuL - 1); updMenu(); });
$('lvNext').addEventListener('click', () => { menuL = Math.min(save.best, menuL + 1); updMenu(); });
$('play').addEventListener('click', () => startLevel(menuL));

function pause() { if (G.mode !== 'play' || G.over || G.cardOpen) return; G.paused = true; G.gest = null; $('pauseS').textContent = `Niveau ${G.P.L}`; showScreen('pause'); }
function resume() { G.paused = false; showScreen(null); }
$('btnPause').addEventListener('click', pause);
$('pResume').addEventListener('click', resume);
$('pRestart').addEventListener('click', () => startLevel(G.P.L));
$('pMenu').addEventListener('click', toMenu);
$('endMenu').addEventListener('click', toMenu);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('keydown', e => {
  if (e.key === 'Escape' || e.key === ' ') { if (G.mode === 'play' && !G.over) { e.preventDefault(); G.paused ? resume() : pause(); } }
});

function setupPower() {
  const el = $('power'); el.innerHTML = '';
  for (const f of G.facs) { const i = document.createElement('i'); i.style.background = FAC[f].col; i.dataset.f = f; el.appendChild(i); }
}
function updateHud() {
  $('pop').innerHTML = `<b>${G.tot[1]}</b> / ${G.cap[1]}`;
  $('power').querySelectorAll('i').forEach(i => { i.style.flexGrow = String(Math.max(0.0001, G.tot[+i.dataset.f])); });
}

function intro(P) {
  const words = ['', 'Un adversaire.', 'Deux adversaires.', 'Trois adversaires.'];
  let s = words[P.enemies];
  if (P.extraEnemyHome) s += ' Il démarre avec deux bases.';
  if (P.extraPlayerHome) s += ' Tu démarres avec deux bases.';
  if (P.breather) s += ' Un niveau plus calme.';
  $('introN').textContent = `Niveau ${P.L}`; $('introS').textContent = s;
  const el = $('intro'); el.classList.add('on');
  clearTimeout(intro.tm); intro.tm = setTimeout(() => el.classList.remove('on'), 2600);
}

const HINTS = {
  1: ['Glisse de ta planète vers une autre cible pour y envoyer tes vaisseaux.', 'Le sélecteur en bas règle la part de la flotte envoyée. Chaque capture augmente ta flotte maximale.'],
  2: ['Glisse sur plusieurs de tes installations avant de relâcher : elles attaquent ensemble.'],
};
function setHint(txt) { const h = $('hint'); h.textContent = txt || ''; h.classList.toggle('on', !!txt); }
function startHints(L) {
  G.hints = save.seen['hint' + L] ? null : HINTS[L] || null; G.hintStep = 0;
  setHint(G.hints ? G.hints[0] : '');
}
function advanceHint() {
  if (!G.hints) return;
  G.hintStep++;
  if (G.hintStep < G.hints.length) { setHint(G.hints[G.hintStep]); clearTimeout(advanceHint.tm); advanceHint.tm = setTimeout(() => { if (G.hints) { save.seen['hint' + G.P.L] = 1; persist(); G.hints = null; setHint(''); } }, 6000); }
  else { save.seen['hint' + G.P.L] = 1; persist(); G.hints = null; setHint(''); }
}

let cardQueue = [], cardNode = null;
function openCards(P, then) {
  cardQueue = [];
  for (const k of ['outpost', 'forge', 'relay', 'bastion']) if (P.types.includes(k) && !save.seen['v2' + k]) cardQueue.push(k);
  if (P.garrison && !save.seen.v2garrison) cardQueue.push('garrison');
  openCards.then = then;
  nextCard();
}
function nextCard() {
  const k = cardQueue.shift();
  if (!k) { G.cardOpen = false; G.paused = false; showScreen(null); if (openCards.then) openCards.then(); return; }
  G.cardOpen = true; G.paused = true;
  const type = k === 'garrison' ? 'star' : k;
  cardNode = { id: 97, type, x: 0, y: 0, r: T[type].r, owner: k === 'garrison' ? 0 : 1, ships: [0, 0, 0, 0, 0], hp: 1, capP: 0, pulse: 0, flash: 0, fight: 0, rot: 0.6, aim: -0.8, cool: 0, moon: true, key: k };
  if (type === 'star') cardNode.tex = makePlanet(4242);
  if (k === 'garrison') cardNode.ships[0] = 9; else cardNode.ships[1] = 10;
  $('cardT').textContent = CARDS[k].t; $('cardS').textContent = CARDS[k].s;
  showScreen('card'); $('cardOk').focus();
}
$('cardOk').addEventListener('click', () => { if (cardNode) { save.seen['v2' + cardNode.key] = 1; persist(); } nextCard(); });
function renderCard(t) {
  if (!cardNode) return;
  const c = $('cardCv').getContext('2d'), s = 58 / (cardNode.r + 28);
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, 264, 264);
  c.setTransform(2 * s, 0, 0, 2 * s, 132, 132);
  drawBody(c, cardNode, t);
  drawOrbits(c, cardNode, t, { k: 2 * s, ox: 132, oy: 132 });
}

function fmtTime(s) { const m = Math.floor(s / 60), r = Math.round(s % 60); return m ? `${m} min ${r} s` : `${r} s`; }

function finish(win) {
  if (G.over) return;
  G.over = true; G.gest = null; G.sel.clear(); setHint('');
  const L = G.P.L, time = G.t;
  if (win) { save.best = Math.max(save.best, L + 1); save.level = L + 1; Snd.win(); vib(30); }
  else { save.level = L; Snd.lose(); }
  persist();
  setTimeout(() => {
    if (G.mode !== 'play' || !G.over || G.P.L !== L) return;
    $('endT').textContent = win ? 'Victoire' : 'Défaite';
    $('endS').textContent = win ? `Niveau ${L} terminé en ${fmtTime(time)}.` : 'Ta flotte a été anéantie. La carte reste la même : essaie une autre ouverture.';
    $('endGo').textContent = win ? `Jouer le niveau ${L + 1}` : 'Réessayer';
    $('endGo').onclick = () => startLevel(win ? L + 1 : L);
    showScreen('end'); $('endGo').focus();
  }, 1300);
}

function startLevel(L) {
  Snd.ensure();
  G.mode = 'play'; G.paused = false; G.cardOpen = false;
  $('hud').hidden = false; $('dock').hidden = false; showScreen(null);
  $('lvl').textContent = `Niveau ${L}`;
  save.level = L; persist();
  const P = makeParams(L);
  buildWorld(P, false);
  setupPower(); updateHud(); setHint('');
  openCards(P, () => { intro(P); startHints(L); });
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
  $('hud').hidden = true; $('dock').hidden = true; setHint(''); $('intro').classList.remove('on');
  refreshMenu(); showScreen('menu');
  startDemo();
}

/* ---------- Boucle ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
  if (G.nodes.length && !(G.mode === 'play' && G.paused)) {
    const sp = G.mode === 'play' ? save.speed : 1;
    for (let i = 0; i < sp; i++) update(dt);
  }
  if (G.mode === 'play') { G.hudT -= dt; if (G.hudT <= 0) { G.hudT = 0.25; updateHud(); } }
  render();
  if (G.cardOpen) renderCard(now / 1000);
  requestAnimationFrame(frame);
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
