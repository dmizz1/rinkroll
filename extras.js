/* ---------- result extras: trophies, player comparison, trading card ---------- */
const TROPHY_INFO = {
  'Hart Trophy': 'League MVP',
  'Art Ross Trophy': 'Most points',
  'Rocket Richard Trophy': 'Most goals',
  'Ted Lindsay Award': 'Players\' choice for best player',
  'Selke Trophy': 'Best defensive forward',
  'Lady Byng Trophy': 'Skill and sportsmanship',
  'Norris Trophy': 'Best defenseman',
  'Vezina Trophy': 'Best goaltender',
  'William M. Jennings Trophy': 'Fewest goals allowed',
  'Conn Smythe Trophy': 'Playoff MVP',
  'Stanley Cup': 'League champions',
  'Presidents\' Trophy': 'Best regular season'
};

// v: category -> numeric grade (0 F … 13 S); avg: average; proj: { goals, assists, points }
function trophiesFor(pos, v, avg, proj) {
  const t = [];
  if (pos === 'F') {
    if (avg >= 11.5) t.push('Hart Trophy');
    if (proj.points >= 110) t.push('Art Ross Trophy');
    if (proj.goals >= 50) t.push('Rocket Richard Trophy');
    if (avg >= 11 && v.Sense >= 11) t.push('Ted Lindsay Award');
    if (v.Sense >= 11 && v.Build >= 9 && v.Speed >= 8) t.push('Selke Trophy');
    if (v.Build <= 4 && avg >= 9 && v.Hands >= 10) t.push('Lady Byng Trophy');
  } else if (pos === 'D') {
    if (avg >= 10.5) t.push('Norris Trophy');
    if (avg >= 12.3) t.push('Hart Trophy');
    if (avg >= 12) t.push('Ted Lindsay Award');
  } else {
    if (avg >= 10.5) t.push('Vezina Trophy');
    if (v.Rebounding >= 11 && v.Reflexes >= 10) t.push('William M. Jennings Trophy');
    if (avg >= 12.3) t.push('Hart Trophy');
  }
  return t;
}

// Closest real player in the same pool and position by grade profile
function playsLike(pos, mode, grades) {
  const pool = POOLS[mode][pos];
  const n = grades.length, dmax = Math.sqrt(n * 13 * 13);
  let best = null, bestD = Infinity;
  for (const p of pool) {
    let d = 0;
    for (let i = 0; i < n; i++) { const x = gv(p.grades[i]) - grades[i]; d += x * x; }
    d = Math.sqrt(d);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best ? { player: best, match: Math.max(1, Math.round(100 * (1 - bestD / dmax))) } : null;
}

function trophyChips(list) {
  if (!list.length) return '<span class="no-hw">No hardware this season. The awards voters were not impressed.</span>';
  return list.map(n => `<span class="trophy" title="${esc(TROPHY_INFO[n] || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v3h3v2a5 5 0 0 1-4.6 5A5 5 0 0 1 13 15.9V18h3v3H8v-3h3v-2.1A5 5 0 0 1 8.6 13 5 5 0 0 1 4 8V6h3zm0 5V8H6a3 3 0 0 0 1.2 2.4zm10 0v2.4A3 3 0 0 0 18 8z"/></svg>${esc(n)}</span>`).join('');
}

/* ----- trading card (canvas) ----- */
const CARD_W = 1080, CARD_H = 1350;
const TIER_COL = { S: '#f4c95d', A: '#6fd3ff', B: '#5ee0a8', C: '#c9d4e0', D: '#ff9f5a', F: '#ff5d6c' };
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx, text, maxW, font, size, min) {
  let s = size; ctx.font = `${font.replace('{s}', s)}`;
  while (ctx.measureText(text).width > maxW && s > min) { s -= 2; ctx.font = font.replace('{s}', s); }
  return s;
}
function chipOn(ctx, g, x, y, w, h, fontPx) {
  const c = TIER_COL[tier(g)] || '#c9d4e0';
  if (tier(g) === 'S') { ctx.save(); ctx.shadowColor = 'rgba(244,201,93,.7)'; ctx.shadowBlur = 24; }
  ctx.fillStyle = c; rr(ctx, x, y, w, h, 10); ctx.fill();
  if (tier(g) === 'S') ctx.restore();
  ctx.fillStyle = '#0a1220'; ctx.font = `900 ${fontPx}px "Saira Extra Condensed", Impact, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(g, x + w / 2, y + h / 2 + 2);
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
}

// card: { kicker, title, sub, overall, rows:[{k, who, grade}], stats:[[value,label]], trophies:[], footer }
async function drawCard(card) {
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) {}
  const cv = document.createElement('canvas'); cv.width = CARD_W; cv.height = CARD_H;
  const ctx = cv.getContext('2d');
  const D = '"Saira Extra Condensed", Impact, sans-serif', B = '"Barlow", "Segoe UI", sans-serif', N = '"Saira Semi Condensed", "Arial Narrow", sans-serif';
  // ground + rink markings
  const g = ctx.createLinearGradient(0, 0, CARD_W, CARD_H); g.addColorStop(0, '#1a2943'); g.addColorStop(.55, '#0f1a2d'); g.addColorStop(1, '#0a1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CARD_W, CARD_H);
  ctx.fillStyle = 'rgba(230,57,70,.16)'; ctx.fillRect(CARD_W / 2 - 4, 0, 8, CARD_H);
  ctx.fillStyle = 'rgba(59,123,234,.13)'; ctx.fillRect(CARD_W * 0.24, 0, 14, CARD_H); ctx.fillRect(CARD_W * 0.76 - 14, 0, 14, CARD_H);
  ctx.strokeStyle = 'rgba(230,57,70,.18)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(CARD_W / 2, CARD_H * 0.47, 170, 0, Math.PI * 2); ctx.stroke();
  // frame
  ctx.strokeStyle = '#26385a'; ctx.lineWidth = 6; rr(ctx, 24, 24, CARD_W - 48, CARD_H - 48, 28); ctx.stroke();
  ctx.strokeStyle = '#e63946'; ctx.lineWidth = 3; rr(ctx, 40, 40, CARD_W - 80, CARD_H - 80, 20); ctx.stroke();
  // header
  ctx.fillStyle = '#eaf2f7'; ctx.font = `900 64px ${D}`; ctx.fillText('RINK', 80, 128);
  const w1 = ctx.measureText('RINK').width; ctx.fillStyle = '#e63946'; ctx.fillText('·', 80 + w1 + 4, 128);
  const w2 = ctx.measureText('·').width; ctx.fillStyle = '#eaf2f7'; ctx.fillText('ROLL', 80 + w1 + w2 + 8, 128);
  ctx.fillStyle = '#9fb3c8'; ctx.font = `600 26px ${N}`; ctx.textAlign = 'right'; ctx.fillText(card.kicker.toUpperCase(), CARD_W - 80, 124); ctx.textAlign = 'left';
  // overall box + title
  const ov = card.overall;
  chipOn(ctx, ov, 80, 170, 230, 230, 150);
  ctx.fillStyle = '#9fb3c8'; ctx.font = `600 24px ${N}`; ctx.textAlign = 'center'; ctx.fillText('OVERALL', 195, 432); ctx.textAlign = 'left';
  const ts = fit(ctx, card.title.toUpperCase(), 640, `900 {s}px ${D}`, 104, 56);
  ctx.fillStyle = '#eaf2f7'; ctx.font = `900 ${ts}px ${D}`; ctx.fillText(card.title.toUpperCase(), 350, 170 + ts * 0.9);
  ctx.fillStyle = '#9fb3c8'; ctx.font = `500 30px ${B}`;
  wrapText(ctx, card.sub, 350, 170 + ts * 0.9 + 52, 650, 38, 3);
  // rows
  let y = 490; const rowH = Math.min(96, Math.floor(560 / Math.max(5, card.rows.length)));
  card.rows.forEach(r => {
    ctx.fillStyle = 'rgba(18,30,51,.92)'; rr(ctx, 80, y, CARD_W - 160, rowH - 12, 14); ctx.fill();
    ctx.fillStyle = '#eaf2f7'; ctx.font = `800 ${Math.round(rowH * 0.42)}px ${D}`; ctx.fillText(r.k.toUpperCase(), 108, y + rowH * 0.58);
    ctx.fillStyle = '#9fb3c8'; const ws = fit(ctx, r.who, 470, `600 {s}px ${N}`, Math.round(rowH * 0.32), 18);
    ctx.font = `600 ${ws}px ${N}`; ctx.fillText(r.who, 420, y + rowH * 0.56);
    chipOn(ctx, r.grade, CARD_W - 80 - 28 - 120, y + 10, 120, rowH - 32, Math.round(rowH * 0.46));
    y += rowH;
  });
  // stats
  y += 14;
  const sw = (CARD_W - 160) / card.stats.length;
  card.stats.forEach(([val, label], i) => {
    const x = 80 + sw * i;
    ctx.fillStyle = '#eaf2f7'; ctx.font = `900 64px ${D}`; ctx.fillText(String(val), x, y + 60);
    ctx.fillStyle = '#9fb3c8'; ctx.font = `600 22px ${N}`; ctx.fillText(label.toUpperCase(), x, y + 92);
  });
  y += 130;
  // trophies
  if (card.trophies.length) {
    ctx.fillStyle = '#f4c95d'; ctx.font = `800 30px ${D}`;
    wrapText(ctx, '🏆 ' + card.trophies.join(' · ').toUpperCase(), 80, y, CARD_W - 160, 38, 2);
  }
  // footer
  ctx.fillStyle = '#9fb3c8'; ctx.font = `600 24px ${N}`;
  ctx.fillText(card.footer.toUpperCase(), 80, CARD_H - 76);
  ctx.textAlign = 'right'; ctx.fillStyle = '#eaf2f7'; ctx.font = `800 30px ${D}`; ctx.fillText('RINKROLL.APP', CARD_W - 80, CARD_H - 74); ctx.textAlign = 'left';
  return cv;
}
function wrapText(ctx, text, x, y, maxW, lh, maxLines) {
  const words = String(text).split(' '); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lh; n++; line = words[i];
      if (n >= maxLines - 1) { const rest = words.slice(i).join(' '); let s = rest; while (ctx.measureText(s + '…').width > maxW && s.length > 1) s = s.slice(0, -1); ctx.fillText(s === rest ? s : s + '…', x, y); return; }
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
}

let cardBlob = null, cardUrl = '';
async function renderCard(card, imgId = 'tcard-img', wrapId = 'tcard-wrap') {
  const img = $(imgId); if (!img) return;
  try {
    const cv = await drawCard(card);
    cardUrl = cv.toDataURL('image/png');
    img.src = cardUrl; img.hidden = false;
    cardBlob = await new Promise(res => cv.toBlob(res, 'image/png'));
    $(wrapId).hidden = false;
  } catch (e) { $(wrapId).hidden = true; }
}
function saveCard(toastId = 'toast') {
  if (!cardUrl) return;
  if (siteUrl()) {
    const a = document.createElement('a'); a.href = cardUrl; a.download = 'rinkroll-card.png';
    document.body.appendChild(a); a.click(); a.remove();
    $(toastId).textContent = 'Card saved.';
  } else {
    $(toastId).textContent = 'Press and hold (or right-click) the card to save it.';
  }
}
$('save-card').addEventListener('click', () => saveCard('toast'));

// Share text + card image anywhere the device supports
async function shareAnywhere(text, toastId = 'toast') {
  const done = () => { $(toastId).textContent = 'Result copied. Paste it anywhere.'; };
  if (siteUrl() && navigator.share) {
    try {
      const file = cardBlob ? new File([cardBlob], 'rinkroll-card.png', { type: 'image/png' }) : null;
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ text, files: [file] }); return; }
      await navigator.share({ text }); return;
    } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyToClipboard(text, done, 'Copy is blocked here.', toastId);
}

// Called at the end of a single-player build
function renderBuildExtras(r) {
  const v = Object.fromEntries(state.slots.map((s, i) => [s.k, r.vals[i]]));
  const trophies = trophiesFor(state.pos, v, r.avg, r.projObj);
  state.result.trophies = trophies;
  $('awards').innerHTML = trophyChips(trophies);
  const pl = playsLike(state.pos, state.mode, r.vals);
  state.result.playsLike = pl;
  $('plays-like').innerHTML = pl ? `Plays like <b>${esc(pl.player.name)}</b> <span>${esc(pl.player.team)} · ${pl.match}% match</span>` : '';
  $('plays-like').hidden = !pl;
  renderCard({
    kicker: state.daily ? `Daily #${state.daily.n}` : (state.online ? 'Head-to-head' : (state.mode === 'current' ? 'Current NHL' : 'Modern Era Stars')),
    title: r.arch, sub: `${cap(POSNAME[state.pos])}${pl ? ' · Plays like ' + pl.player.name : ''}`,
    overall: r.ovr,
    rows: state.slots.map(s => ({ k: s.k, who: s.player.name, grade: s.grade })),
    stats: r.proj.map(([n, l]) => [n, l]),
    trophies,
    footer: 'Created by D.M · Projected 82 games'
  });
}

/* ----- best possible build from the same players ----- */
// Each drawn player fills exactly one category; find the assignment with the highest total grade.
function optimalBuild() {
  const ps = state.slots.map(s => s.player), n = ps.length;
  let best = -1, bestPerm = null;
  const perm = [], used = new Array(n).fill(false);
  (function rec(i, score) {
    if (i === n) { if (score > best) { best = score; bestPerm = perm.slice(); } return; }
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      used[j] = true; perm[i] = j;
      rec(i + 1, score + gv(ps[j].grades[i]));
      used[j] = false;
    }
  })(0, 0);
  return { total: best, rows: bestPerm.map((j, i) => ({ k: state.slots[i].k, player: ps[j], grade: ps[j].grades[i] })) };
}
function renderOptimal() {
  const box = $('optimal'); if (!box) return;
  const opt = optimalBuild();
  const mine = state.slots.reduce((a, s) => a + gv(s.grade), 0);
  const n = state.slots.length;
  const optOvr = SCALE[Math.round(opt.total / n)], myOvr = SCALE[Math.round(mine / n)];
  const perfect = mine >= opt.total;
  const rows = opt.rows.map((r, i) => {
    const same = state.slots[i].player === r.player;
    return `<div class="recap-row${same ? '' : ' diff'}"><span class="k">${r.k}</span><span class="who">${esc(r.player.name)}${same ? '' : ` <em>instead of ${esc(state.slots[i].player.name)}</em>`}</span>${chip(r.grade)}</div>`;
  }).join('');
  $('optimal-verdict').innerHTML = perfect
    ? 'You found the best possible build from your players. Perfect draft.'
    : `With the same players, the best possible build was <b>${optOvr}</b> overall. Yours was <b>${myOvr}</b>. You got ${Math.round(100 * mine / opt.total)}% of the way there.`;
  $('optimal-rows').innerHTML = rows;
  box.hidden = false;
  if (state.result) state.result.optimal = { ovr: optOvr, perfect };
}
