/* ---------- arena visuals (toggle: "Arena on/off" in the header) ---------- */
const TEAM_COLORS = {
  ANA: ['#F47A38', '#B9975B'], BOS: ['#FFB81C', '#000000'], BUF: ['#003087', '#FFB81C'], CGY: ['#C8102E', '#F1BE48'],
  CAR: ['#CE1126', '#A2AAAD'], CHI: ['#CF0A2C', '#FF671B'], COL: ['#6F263D', '#236192'], CBJ: ['#002654', '#CE1126'],
  DAL: ['#006847', '#8F8F8C'], DET: ['#CE1126', '#FFFFFF'], EDM: ['#041E42', '#FF4C00'], FLA: ['#C8102E', '#B9975B'],
  LAK: ['#111111', '#A2AAAD'], MIN: ['#154734', '#A6192E'], MTL: ['#AF1E2D', '#192168'], NSH: ['#FFB81C', '#041E42'],
  NJD: ['#CE1126', '#000000'], NYI: ['#00539B', '#F47D30'], NYR: ['#0038A8', '#CE1126'], OTT: ['#C52032', '#C2912C'],
  PHI: ['#F74902', '#000000'], PIT: ['#FCB514', '#000000'], SJS: ['#006D75', '#EA7200'], SEA: ['#001628', '#99D9D9'],
  STL: ['#002F87', '#FCB514'], TBL: ['#002868', '#FFFFFF'], TOR: ['#00205B', '#FFFFFF'], UTA: ['#6CACE4', '#090909'],
  VAN: ['#00205B', '#00843D'], VGK: ['#B4975A', '#333F42'], WSH: ['#C8102E', '#041E42'], WPG: ['#041E42', '#AC162C'],
  HFD: ['#046A38', '#00205B'], QUE: ['#1A4B8C', '#CE1126'], PHX: ['#8C2633', '#E2D6B5'], ATL: ['#041E42', '#5C88DA']
};
const fx = { on: true, reduce: false, built: false };
try { fx.on = localStorage.getItem('rinkroll-fx') !== '0'; } catch (e) {}
try { fx.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

// pick the brighter team color so it reads on a dark arena
function teamGlow(team) {
  const c = TEAM_COLORS[team]; if (!c) return '#3b7bea';
  const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255); };
  return lum(c[0]) >= 60 ? c[0] : c[1];
}

function buildArena() {
  if (fx.built) return; fx.built = true;
  // ice: faint skate scratches
  try {
    const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
    for (let i = 0; i < 140; i++) {
      x.strokeStyle = `rgba(205,228,255,${(0.025 + Math.random() * 0.05).toFixed(3)})`;
      x.lineWidth = 0.5 + Math.random() * 1.1;
      const cx = Math.random() * 512, cy = Math.random() * 512, r = 60 + Math.random() * 380, a = Math.random() * Math.PI * 2;
      x.beginPath(); x.arc(cx, cy, r, a, a + 0.15 + Math.random() * 0.6); x.stroke();
    }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(220,235,255,${(Math.random() * 0.05).toFixed(3)})`; x.fillRect(Math.random() * 512, Math.random() * 512, 1, 1); }
    document.documentElement.style.setProperty('--ice-tex', `url(${c.toDataURL('image/png')})`);
  } catch (e) {}
  // crowd silhouette
  try {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 150; const x = c.getContext('2d');
    const row = (y0, col, step) => {
      x.fillStyle = col;
      for (let px = -10; px < 1220; px += step + Math.random() * 6) {
        const r = 7 + Math.random() * 4, y = y0 + Math.random() * 10;
        x.beginPath(); x.arc(px, y, r, 0, Math.PI * 2); x.fill();
        x.beginPath(); x.ellipse(px, y + r + 14, r * 1.9, 16, 0, Math.PI, 0); x.fill();
        x.fillRect(px - r * 1.9, y + r + 13, r * 3.8, 40);
        if (Math.random() < 0.06) { x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(px + 4, y + 4, 2, 3); x.fillStyle = col; } // phone screens
      }
    };
    row(34, '#0d1626', 17); row(62, '#080e19', 16); row(92, '#05090f', 15);
    document.documentElement.style.setProperty('--crowd', `url(${c.toDataURL('image/png')})`);
  } catch (e) {}
  const mk = (cls, html) => { const d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); if (html) d.innerHTML = html; document.body.prepend(d); return d; };
  mk('fx-lights', '<span class="beam b1"></span><span class="beam b2"></span><span class="beam b3"></span>');
  mk('fx-crowd');
  mk('fx-team'); mk('fx-flash');
  const cv = document.createElement('canvas'); cv.className = 'fx-confetti'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
}

function setFx(on) {
  fx.on = on;
  document.body.classList.toggle('fx', on);
  if (on) buildArena();
  const b = $('fx-toggle'); if (b) { b.setAttribute('aria-pressed', on); b.textContent = on ? 'Arena on' : 'Arena off'; }
  try { localStorage.setItem('rinkroll-fx', on ? '1' : '0'); } catch (e) {}
}

// a player lands on the reel (or gets picked): goal light + team colors
function fxLand(p) {
  if (!fx.on || !p) return;
  const tint = document.querySelector('.fx-team'), flash = document.querySelector('.fx-flash');
  const c = TEAM_COLORS[p.team] || ['#3b7bea', '#e63946'];
  document.documentElement.style.setProperty('--tc1', c[0]);
  document.documentElement.style.setProperty('--tc2', teamGlow(p.team));
  if (fx.reduce) return;
  [tint, flash].forEach(el => { if (!el) return; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); });
  const reel = $('reel'); if (reel) { reel.classList.remove('team'); void reel.offsetWidth; reel.classList.add('team'); }
}

// confetti: 'small' for an S-grade pick, 'big' for an elite build or a Cup
let confettiRaf = 0;
function fxBurst(size) {
  if (!fx.on || fx.reduce) return;
  const cv = document.querySelector('.fx-confetti'); if (!cv) return;
  const W = cv.width = innerWidth, H = cv.height = innerHeight, ctx = cv.getContext('2d'); if (!ctx) return;
  const team = getComputedStyle(document.documentElement).getPropertyValue('--tc2').trim() || '#3b7bea';
  const cols = ['#f4c95d', '#eaf2f7', '#e63946', '#6fd3ff', team];
  const n = size === 'big' ? 190 : 60, parts = [];
  for (let i = 0; i < n; i++) parts.push({
    x: size === 'big' ? Math.random() * W : W / 2 + (Math.random() - .5) * 160, y: size === 'big' ? -20 - Math.random() * H * .4 : H * .45,
    vx: (Math.random() - .5) * (size === 'big' ? 3 : 9), vy: size === 'big' ? 2 + Math.random() * 3 : -6 - Math.random() * 6,
    w: 6 + Math.random() * 6, h: 3 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % cols.length]
  });
  cv.classList.add('on'); cancelAnimationFrame(confettiRaf);
  const t0 = performance.now();
  const step = now => {
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of parts) {
      p.vy += 0.14; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y < H + 30) alive++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (alive && now - t0 < 4500) confettiRaf = requestAnimationFrame(step);
    else { ctx.clearRect(0, 0, W, H); cv.classList.remove('on'); }
  };
  confettiRaf = requestAnimationFrame(step);
}

$('fx-toggle').addEventListener('click', () => setFx(!fx.on));
setFx(fx.on);
