/* ---------- line builder (3F 2D 1G) + season sim ---------- */
const CAP_LIMIT = 26000000;
const LINE_SLOTS = [['F', 'Forward 1'], ['F', 'Forward 2'], ['F', 'Forward 3'], ['D', 'Defense 1'], ['D', 'Defense 2'], ['G', 'Goalie']];
const LINE_WEIGHT = [0.15, 0.15, 0.15, 0.125, 0.125, 0.30];
const normName = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// cap hits: name|team|dollars  →  attach to current pool players
const CAPS = (() => {
  const byNameTeam = new Map(), byName = new Map();
  (CAP_RAW || '').trim().split('\n').filter(Boolean).forEach(l => {
    const [name, team, cap] = l.split('|'); const n = normName(name), c = +cap;
    if (!c) return;
    byNameTeam.set(n + '|' + team, c);
    byName.set(n, byName.has(n) ? -1 : c); // -1 marks an ambiguous name
  });
  let matched = 0;
  ['F', 'D', 'G'].forEach(g => POOLS.current[g].forEach(p => {
    const n = normName(p.name);
    let c = byNameTeam.get(n + '|' + p.team);
    if (!c) { const b = byName.get(n); if (b && b > 0) c = b; }
    if (c) { p.cap = c; matched++; }
  }));
  return { matched };
})();
const capPool = g => POOLS.current[g].filter(p => p.cap);
const ovrVal = p => p.grades.reduce((a, g) => a + gv(g), 0) / p.grades.length;
const money = c => '$' + (c / 1e6).toFixed(c % 100000 ? 2 : 1).replace(/\.?0+$/, m => m.startsWith('.') ? '' : m) + 'M';
const moneyFixed = c => '$' + (c / 1e6).toFixed(2) + 'M';

const line = { variant: 'cap', mode: 'current', picks: [], options: [], used: new Set(), redraws: 1, step: 0, busy: false, season: null };

function lineAvailable(variant) { return variant !== 'cap' || (capPool('F').length >= 10 && capPool('D').length >= 10 && capPool('G').length >= 5); }

function startLine(variant) {
  line.variant = variant; line.mode = variant === 'cap' ? 'current' : state.mode;
  line.picks = []; line.used = new Set(); line.redraws = 1; line.step = 0; line.busy = false; line.season = null;
  state.online = false; state.daily = null;
  $('line-kicker').textContent = variant === 'cap' ? 'Cap Line · $26M cap · Current NHL' : `Skill Line · ${line.mode === 'current' ? 'Current NHL' : 'All-Time Greats'}`;
  $('line-build').hidden = false; $('season').hidden = true;
  audio();
  show('line');
  renderLineBoard(); drawOptions();
}

function capUsed() { return line.picks.reduce((a, p) => a + (p.cap || 0), 0); }
function minCapFor(g) { const c = capPool(g).filter(p => !line.used.has(p.name)).map(p => p.cap); return c.length ? Math.min(...c) : 0; }
function affordable(p) {
  if (line.variant !== 'cap') return true;
  const remaining = LINE_SLOTS.slice(line.step + 1).reduce((a, [g]) => a + minCapFor(g), 0);
  return capUsed() + p.cap + remaining <= CAP_LIMIT;
}

function drawOptions() {
  const [g, label] = LINE_SLOTS[line.step];
  const pool = (line.variant === 'cap' ? capPool(g) : POOLS[line.mode][g]).filter(p => !line.used.has(p.name));
  const pick = [];
  const bag = pool.slice();
  while (pick.length < 3 && bag.length) pick.push(bag.splice(Math.floor(Math.random() * bag.length), 1)[0]);
  if (line.variant === 'cap' && !pick.some(affordable)) {
    const cheap = pool.filter(p => affordable(p) && !pick.includes(p));
    if (cheap.length) pick[2] = cheap[Math.floor(Math.random() * cheap.length)];
  }
  line.options = pick;
  $('pick-title').textContent = label;
  $('pick-sub').textContent = `Pick ${line.step + 1} of 6`;
  $('line-redraw').textContent = `Re-draw (${line.redraws})`;
  $('line-redraw').disabled = line.redraws < 1;
  $('line-prompt').textContent = line.variant === 'cap'
    ? 'Pick one. Grades stay hidden until the season. Stay under the cap.'
    : 'Pick one. Build the strongest line you can.';
  const box = $('options'); box.innerHTML = '';
  pick.forEach((p, i) => {
    const ok = affordable(p);
    const b = document.createElement('button');
    b.className = 'opt'; b.id = 'opt-' + i; b.disabled = !ok;
    const detail = line.variant === 'cap'
      ? `<span class="opt-cap">${moneyFixed(p.cap)}</span>${ok ? '' : '<span class="opt-warn">Over the cap</span>'}`
      : `<span class="opt-grades">${p.grades.map((gr, k) => `<span title="${CATS[g][k][0]}">${chip(gr)}</span>`).join('')}</span>`;
    b.innerHTML = `<span class="opt-name">${esc(p.name)}</span><span class="opt-meta">${esc(p.team)} · ${esc(p.pos)}${p.num ? ' · #' + esc(String(p.num)) : ''}</span><span class="opt-stat">${esc(p.stat)}</span>${detail}`;
    b.style.animationDelay = (i * 90) + 'ms';
    b.addEventListener('click', () => choose(i));
    box.appendChild(b);
  });
  pick.forEach((_, i) => setTimeout(() => tick(0.6), i * 90));
}

function choose(i) {
  if (line.busy) return;
  const p = line.options[i]; if (!p || !affordable(p)) return;
  line.picks.push(p); line.used.add(p.name); line.step++;
  pop(); renderLineBoard();
  if (line.step >= LINE_SLOTS.length) { line.busy = true; setTimeout(runSeason, 500); }
  else drawOptions();
}
function redraw() { if (line.redraws < 1 || line.busy) return; line.redraws--; drawOptions(); }

function renderLineBoard() {
  const used = capUsed();
  $('line-filled').textContent = `${line.picks.length} / 6`;
  $('line-board').innerHTML = LINE_SLOTS.map(([g, label], i) => {
    const p = line.picks[i];
    const right = p ? (line.variant === 'cap' ? `<span class="lb-cap">${moneyFixed(p.cap)}</span>` : chip(SCALE[Math.round(ovrVal(p))])) : '';
    return `<div class="lb-row${p ? ' on' : ''}${i === line.step ? ' next' : ''}"><span class="lb-k">${label}</span><span class="lb-who">${p ? esc(p.name) + ' <small>' + esc(p.team) + '</small>' : '—'}</span>${right}</div>`;
  }).join('');
  const cb = $('capbar');
  if (line.variant === 'cap') {
    const pct = Math.min(100, used / CAP_LIMIT * 100);
    cb.hidden = false;
    cb.innerHTML = `<div class="cap-nums"><b>${moneyFixed(used)}</b> used · <b>${moneyFixed(CAP_LIMIT - used)}</b> left of $26.00M</div><div class="cap-track"><div class="cap-fill" style="width:${pct.toFixed(1)}%"></div></div>`;
  } else cb.hidden = true;
}

/* ----- season simulation ----- */
function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function winP(s, o) { return 1 / (1 + Math.exp(-2.4 * (s - o))); }
function teamRating() { return line.picks.reduce((a, p, i) => a + ovrVal(p) * LINE_WEIGHT[i], 0); }

function simSeason() {
  const R = teamRating(), s = (R - 7.6) / 8; // ~8.4 (a solid line) ≈ 100 pts; ~10+ ≈ 115–125 pts
  let W = 0, L = 0, OTL = 0;
  const games = [];
  for (let i = 0; i < 82; i++) {
    const o = randn() * 0.42;
    if (Math.random() < winP(s, o)) { W++; games.push('W'); }
    else if (Math.random() < 0.22) { OTL++; games.push('O'); }
    else { L++; games.push('L'); }
  }
  const pts = W * 2 + OTL;
  // the rest of the league
  const others = Array.from({ length: 31 }, () => Math.round(Math.max(52, Math.min(128, 92 + randn() * 13))));
  const conf = others.slice(0, 15);
  const confRank = 1 + conf.filter(x => x > pts || (x === pts && Math.random() < 0.5)).length;
  const presidents = others.every(x => x < pts);
  const path = [];
  let cup = false;
  if (confRank <= 8) {
    const rounds = ['First Round', 'Second Round', 'Conference Final', 'Stanley Cup Final'];
    const rivals = conf.slice().sort((a, b) => b - a).slice(0, 7); // the other playoff teams
    for (let r = 0; r < 4; r++) {
      let oppPts;
      if (r < 3) { const cand = rivals.slice(0, Math.max(1, 7 - r * 2)); const k = Math.floor(Math.random() * cand.length); oppPts = cand[k] ?? 95; rivals.splice(k, 1); }
      else oppPts = Math.round(98 + Math.abs(randn()) * 10);
      const o = (oppPts - 92) / 68; // same scale as our own strength (≈ points above average / 68)
      let w = 0, l = 0;
      while (w < 4 && l < 4) { if (Math.random() < winP(s, o)) w++; else l++; }
      path.push({ round: rounds[r], won: w === 4, score: `${Math.max(w, l)}–${Math.min(w, l)}`, oppPts });
      if (w < 4) break;
      if (r === 3) cup = true;
    }
  }
  let finish;
  if (confRank > 8) finish = `Missed the playoffs (${ordinal(confRank)} in the conference)`;
  else if (cup) finish = 'Won the Stanley Cup';
  else { const last = path[path.length - 1]; finish = `Lost in the ${last.round} (${last.score})`; }
  const trophies = [];
  if (presidents) trophies.push('Presidents\' Trophy');
  if (cup) { trophies.push('Stanley Cup'); trophies.push('Conn Smythe Trophy'); }
  const best = line.picks.slice().sort((a, b) => ovrVal(b) - ovrVal(a))[0];
  return { R, W, L, OTL, pts, games, confRank, path, cup, finish, trophies, smythe: cup ? best : null, presidents };
}
function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

function runSeason() {
  const S = simSeason(); line.season = S;
  $('line-build').hidden = true; $('season').hidden = false;
  const R = S.R, grade = SCALE[Math.max(0, Math.min(13, Math.round(R)))];
  $('line-ovr').textContent = grade; $('line-ovr').dataset.t = tier(grade);
  $('season-path').innerHTML = ''; $('season-awards').innerHTML = ''; $('season-finish').textContent = 'Simulating the season…';
  $('line-recap').innerHTML = line.picks.map((p, i) => `<div class="recap-row"><span class="k">${LINE_SLOTS[i][1]}</span><span class="who">${esc(p.name)} · ${esc(p.team)}${line.variant === 'cap' ? ' · ' + moneyFixed(p.cap) : ''}</span>${chip(SCALE[Math.round(ovrVal(p))])}</div>`).join('')
    + (line.variant === 'cap' ? `<div class="recap-row total-row"><span class="k">Cap total</span><span class="who">${moneyFixed(capUsed())} of $26.00M</span><span></span></div>` : '');
  $('line-toast').textContent = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  // tick the record up game by game
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0, w = 0, l = 0, o = 0;
  const step = () => {
    const n = reduce ? 82 : Math.min(82, i + 2);
    for (; i < n; i++) { const g = S.games[i]; if (g === 'W') w++; else if (g === 'L') l++; else o++; }
    $('season-record').textContent = `${w}–${l}–${o}`;
    $('season-pts').textContent = `${w * 2 + o} PTS · GP ${i}`;
    if (!reduce && i % 6 === 0) tick(0.3);
    if (i < 82) setTimeout(step, 45); else revealPlayoffs(S);
  };
  step();
}

function revealPlayoffs(S) {
  $('season-pts').textContent = `${S.pts} PTS · ${ordinal(S.confRank)} in conference`;
  const items = S.path.map(r => `<li class="${r.won ? 'won' : 'lost'}"><span>${r.round}</span><b>${r.won ? 'Won' : 'Lost'} ${r.score}</b></li>`);
  if (!S.path.length) items.push('<li class="lost"><span>Playoffs</span><b>Missed</b></li>');
  let k = 0;
  const next = () => {
    if (k < items.length) { $('season-path').insertAdjacentHTML('beforeend', items[k++]); tick(0.8); setTimeout(next, 650); return; }
    $('season-finish').textContent = S.finish;
    $('season-finish').className = 'verdict ' + (S.cup ? 'win' : S.confRank > 8 ? 'loss' : '');
    $('season-awards').innerHTML = S.trophies.length ? trophyChips(S.trophies) + (S.smythe ? `<span class="no-hw">Conn Smythe: ${esc(S.smythe.name)}</span>` : '') : trophyChips([]);
    if (S.cup) horn(); fanfare(S.cup || S.path.length >= 2);
    line.busy = false;
    renderCard({
      kicker: line.variant === 'cap' ? 'Cap Line' : 'Skill Line',
      title: S.cup ? 'Stanley Cup Champs' : S.confRank > 8 ? 'Lottery Bound' : S.path.length >= 3 ? 'Deep Playoff Run' : 'Playoff Team',
      sub: `${S.W}–${S.L}–${S.OTL} · ${S.pts} points · ${S.finish}`,
      overall: $('line-ovr').textContent,
      rows: line.picks.map((p, i) => ({ k: LINE_SLOTS[i][1], who: p.name + (line.variant === 'cap' ? ' · ' + moneyFixed(p.cap) : ''), grade: SCALE[Math.round(ovrVal(p))] })),
      stats: [[`${S.W}–${S.L}–${S.OTL}`, 'Record'], [S.pts, 'Points'], line.variant === 'cap' ? [moneyFixed(capUsed()), 'Cap used'] : [ordinal(S.confRank), 'In conference']],
      trophies: S.trophies,
      footer: 'Created by D.M · Simulated 82-game season'
    }, 'line-card-img', 'line-card-wrap');
  };
  setTimeout(next, 400);
}

function lineShareText() {
  const S = line.season; if (!S) return '';
  const lines = [`Rink Roll · ${line.variant === 'cap' ? 'Cap Line ($26M)' : 'Skill Line'}`, `${S.W}-${S.L}-${S.OTL} · ${S.pts} pts · ${S.finish}`];
  if (S.trophies.length) lines.push('🏆 ' + S.trophies.join(', '));
  lines.push(line.picks.map(p => p.name).join(', '));
  const url = siteUrl(); if (url) lines.push(url);
  return lines.join('\n');
}

$('line-redraw').addEventListener('click', redraw);
$('line-quit').addEventListener('click', () => { show('setup'); setPlay('line'); });
$('line-again').addEventListener('click', () => startLine(line.variant));
$('line-menu').addEventListener('click', () => { show('setup'); setPlay('line'); });
$('line-resim').addEventListener('click', () => { if (!line.busy && line.picks.length === 6) { line.busy = true; runSeason(); } });
$('line-share').addEventListener('click', () => shareAnywhere(lineShareText(), 'line-toast'));
$('line-save').addEventListener('click', () => saveCard('line-toast'));
