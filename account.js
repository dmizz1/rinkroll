/* ---------- accounts (public site only) ---------- */
const ACCT = { user: null, catalog: null, loaded: false, view: null, picking: false, rankData: null };
const BADGE_ORDER = ['first-star', 'perfect-pick', 'honor-roll', 's-tier', 'optimal', 'dumpster-fire', 'rookie-season', 'hat-trick', 'iron-man', 'every-game', 'top-board', 'first-win', 'win-streak', 'rivalry', 'comeback', 'presidents', 'champion', 'cap-wizard', 'money-puck'];
const BADGE_GROUPS = ['Grades', 'Daily', 'Head-to-head', 'Line Builder'];
const R = '#e63946', I = '#eaf2f7', G = '#f4c95d';
const BADGE_SVG = {
  'first-star': `<path stroke="${G}" d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>`,
  'perfect-pick': `<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/><circle cx="12" cy="12" r="1.6" fill="${R}" stroke="${R}"/>`,
  'honor-roll': `<circle cx="12" cy="9" r="5.5"/><circle cx="12" cy="9" r="2.4" stroke="${R}"/><path d="M8.6 13.3L7 21.5l5-2.6 5 2.6-1.6-8.2"/>`,
  's-tier': `<path stroke="${G}" d="M3.5 18.5h17M4.5 18.5L3 8l5 4 4-7.5 4 7.5 5-4-1.5 10.5"/><circle cx="12" cy="14.5" r="1.2" fill="${R}" stroke="${R}"/>`,
  'optimal': `<path d="M4 9h4.2a2.3 2.3 0 1 1 4.6 0H17v4.2a2.3 2.3 0 1 1 0 4.6V21H4z"/><path stroke="${R}" d="M14.5 3.5l2 2 4-4"/>`,
  'dumpster-fire': `<path d="M4 11h16M5.5 11l1.4 10h10.2l1.4-10M9.5 14v4M14.5 14v4"/><path stroke="#ff9f5a" d="M12 9.5c-2.2-1.6-1.4-3.9 0-6 .3 1.6 1.4 2.2 2.2 3.3.6.9.3 2-.4 2.7M9.2 9.5c-.9-.9-.8-2 .1-3"/>`,
  'rookie-season': `<path d="M6 3.5h5v6.5l6.3 1.8a2.4 2.4 0 0 1 1.7 2.3V16H6zM6 7h3M3 20h18"/><path stroke="${R}" d="M8 16v4M16 16v4"/>`,
  'hat-trick': `<path d="M2 18a3.5 3.5 0 0 1 7 0zM9 18h1.8"/><path stroke="${R}" d="M8.5 10a3.5 3.5 0 0 1 7 0zM15.5 10h1.8"/><path d="M13 18a3.5 3.5 0 0 1 7 0zM20 18h1.8"/>`,
  'iron-man': `<path d="M7 12h10M3 10v4M21 10v4"/><path stroke="${R}" d="M5 7.5v9M7 6v12M17 6v12M19 7.5v9"/>`,
  'every-game': `<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><text x="12" y="18.2" text-anchor="middle" font-family="Saira Extra Condensed, sans-serif" font-weight="900" font-size="8.2" fill="${R}" stroke="none">82</text>`,
  'top-board': `<path stroke="${G}" d="M7 3.5h10V9a5 5 0 0 1-10 0zM7 5.5H4.3a3 3 0 0 0 3 4.2M17 5.5h2.7a3 3 0 0 1-3 4.2M12 14v4M8 21h8M9 18h6"/><text x="12" y="10.6" text-anchor="middle" font-family="Saira Extra Condensed, sans-serif" font-weight="900" font-size="7" fill="${R}" stroke="none">1</text>`,
  'first-win': `<path d="M3.5 20V9a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v11M2 20h20"/><path stroke="#4a5f80" stroke-width="1.1" d="M7.5 7l1.5 13M12 7v13M16.5 7L15 20M4 12h16M4 16h16"/><ellipse cx="12" cy="17.6" rx="3" ry="1.2" fill="${R}" stroke="${R}"/>`,
  'win-streak': `<path fill="${R}" stroke="${R}" d="M7 15a5 5 0 0 1 10 0z"/><path d="M5.5 15h13v3.5h-13zM9 21h6M12 18.5V21"/><path stroke="${R}" d="M12 4v3M4.6 7.3l2.1 2.1M19.4 7.3l-2.1 2.1"/>`,
  'rivalry': `<path d="M4 3l12.5 15.5h4"/><path stroke="${R}" d="M20 3L7.5 18.5h-4"/>`,
  'comeback': `<path d="M3 9l4 4 3-3 3 4M3 20.5h18"/><path stroke="${R}" d="M13 14l7.5-7.5M15.5 6.5h5v5"/>`,
  'presidents': `<path d="M3.5 7.5h17l-1.2 2.3H4.7zM12 15.8v3M7.5 21h9M8.5 18.8h7"/><path stroke="#3b7bea" d="M5 9.8a7 6 0 0 0 14 0"/>`,
  'champion': `<path stroke="${G}" d="M8 2.5h8v2.5a4 4 0 0 1-8 0zM10.5 9h3v1.5h-3zM9 10.5h6v2.8H9zM8 13.3h8v2.8H8zM7 16.1h10v2.8H7zM6 18.9h12v2.6H6z"/>`,
  'cap-wizard': `<path d="M7 17.5L12 3l5 14.5"/><ellipse cx="12" cy="18.2" rx="8.5" ry="2.3"/><path stroke="${R}" stroke-width="2.2" d="M8.7 13h6.6"/><path stroke="${G}" d="M12 6.8v2.6M10.7 8.1h2.6"/>`,
  'money-puck': `<ellipse cx="12" cy="14.5" rx="8" ry="3"/><path d="M4 14.5v3c0 1.7 3.6 3 8 3s8-1.3 8-3v-3"/><path stroke="#5ee0a8" d="M14.2 3.6c-.5-.6-1.3-.9-2.2-.9-1.3 0-2.2.7-2.2 1.6 0 2.1 4.5 1.2 4.5 3.3 0 .9-1 1.6-2.3 1.6-1 0-1.9-.4-2.3-1M12 1.5v1.2M12 9.2v1.3"/>`
};
const TIER_TEXT = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', earned: 'Earned' };
function puck(id, tierName, size = '') {
  const label = ACCT.catalog && ACCT.catalog[id] ? ACCT.catalog[id].name : id;
  if (!tierName) return `<span class="puck locked ${size}" role="img" aria-label="${esc(label)}, not earned yet">???</span>`;
  return `<span class="puck ${size}" data-tier="${tierName}" role="img" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" fill="none" stroke="${I}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BADGE_SVG[id] || ''}</svg></span>`;
}
function miniBadges(ids) { return ids && ids.length ? `<span class="acct-sc">${ids.map(id => puck(id, 'earned', 'sm')).join('')}</span>` : ''; }

async function acctApi(path, body) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' } : { cache: 'no-store', credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok) throw new Error(j.error || 'Something went wrong. Try again.');
  return j;
}
function acctToast(text) {
  const el = $('acct-toast'); if (!el) return;
  el.textContent = text; el.hidden = false;
  clearTimeout(acctToast.t); acctToast.t = setTimeout(() => el.hidden = true, 4200);
}
function announceEarned(ids) {
  if (!ids || !ids.length || !ACCT.catalog) return;
  const names = [...new Set(ids)].map(k => ACCT.catalog[k] && ACCT.catalog[k].name).filter(Boolean);
  if (names.length) acctToast(`🏅 Badge earned: ${names.join(', ')}`);
}
async function acctLoad() {
  try { const j = await acctApi('/api/me'); ACCT.user = j.user; ACCT.catalog = j.catalog || ACCT.catalog; } catch (e) { ACCT.user = null; }
  ACCT.loaded = true; acctNav();
  if (ACCT.user && !ACCT.user.imported) acctImport();
  return ACCT.user;
}
function acctNav() {
  const a = $('acct-link'); if (!a) return;
  a.textContent = ACCT.user ? ACCT.user.name : 'Sign in';
  const n = $('lb-name');
  if (n) { if (ACCT.user) { n.value = ACCT.user.name; n.readOnly = true; n.title = 'Your account name'; } else { n.readOnly = false; n.title = ''; } }
}
// past Dailies saved on this device become part of a new account (once)
async function acctImport() {
  const dailies = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = /^rinkroll-daily-(\d{4}-\d{2}-\d{2})$/.exec(k || ''); if (!m) continue;
      const s = JSON.parse(localStorage.getItem(k) || 'null');
      if (s && s.done && Array.isArray(s.slots) && s.slots.every(Boolean)) dailies.push({ day: m[1], pos: dailyPosFor(m[1]), slots: s.slots });
    }
  } catch (e) {}
  try {
    const j = await acctApi('/api/me', { action: 'import', dailies }); ACCT.user.imported = true;
    if (j.imported) {
      await acctLoad();
      if (!$('account').hidden && !$('acct-in').hidden && !ACCT.view) renderProfile(ACCT.user, true);
      acctToast(`Added ${j.imported} past ${j.imported === 1 ? 'Daily' : 'Dailies'} from this device`);
    }
  } catch (e) {}
}
function dailyPosFor(key) { const [y, m, d] = key.split('-').map(Number); const n = Math.round((Date.UTC(y, m - 1, d) - DAILY_EPOCH) / 864e5) + 1; return ['F', 'D', 'G'][((n - 1) % 3 + 3) % 3]; }

/* ---- hooks from the game ---- */
function acctOnBuild() {
  if (!ACCT.user || state.online) return;
  const build = { mode: state.mode, pos: state.pos, play: state.daily ? 'daily' : 'solo', day: state.daily ? state.daily.key : null,
    slots: state.slots.map(s => ({ name: s.player.name, grade: s.grade, grades: s.player.grades })) };
  acctApi('/api/me', { action: 'build', build }).then(j => { announceEarned(j.earned); ACCT.stale = true; }).catch(() => {});
}
function acctOnLine(S) {
  if (!ACCT.user || !S) return;
  const hasLine = typeof line !== 'undefined';
  const data = { variant: hasLine ? line.variant : 'skill', W: S.W, L: S.L, OTL: S.OTL, cup: S.cup, presidents: S.presidents, playoffs: S.confRank <= 8, finish: S.finish,
    capUsed: typeof capUsed === 'function' ? capUsed() : 0, players: (hasLine ? line.picks : []).map(p => p.name) };
  acctApi('/api/me', { action: 'line', line: data }).then(j => { announceEarned(j.earned); ACCT.stale = true; }).catch(() => {});
}
function acctOnH2H(code, round) {
  if (!ACCT.user || !code) return;
  const slots = state.slots.map(s => s.player ? { name: s.player.name, grades: s.player.grades } : null);
  acctApi('/api/me', { action: 'h2h', code, round, slots }).then(j => {
    if (j.counted) announceEarned(j.earned);
    else if (j.why === 'both' && !acctOnH2H.told) { acctOnH2H.told = true; acctToast('Head-to-head records count when both players are signed in'); }
    ACCT.stale = true;
  }).catch(() => {});
}

/* ---- screens ---- */
async function openAccount(opts = {}) {
  show('account');
  ACCT.view = null; ACCT.picking = false;
  $('acct-loading').hidden = false; ['acct-out', 'acct-in', 'acct-setpw'].forEach(id => $(id).hidden = true);
  if (!ACCT.loaded || ACCT.stale || opts.reload) { ACCT.stale = false; await acctLoad(); }
  $('acct-loading').hidden = true;
  if (opts.setPassword) return showSetPw(opts.setPassword);
  if (!ACCT.user) return showSignedOut(opts.err);
  renderProfile(ACCT.user, true);
}
async function openProfile(handle) {
  show('account'); ACCT.picking = false;
  $('acct-loading').hidden = false; ['acct-out', 'acct-in', 'acct-setpw'].forEach(id => $(id).hidden = true);
  if (!ACCT.loaded) await acctLoad();
  try {
    const j = await acctApi('/api/rank?profile=' + encodeURIComponent(handle));
    $('acct-loading').hidden = true;
    if (ACCT.user && ACCT.user.handle === j.profile.handle) return renderProfile(ACCT.user, true);
    ACCT.view = j.profile; renderProfile(j.profile, false);
  } catch (e) { $('acct-loading').textContent = 'No player found with that name.'; }
}
function showSignedOut(err) {
  $('acct-out').hidden = false;
  const msgs = { google: 'Google sign-in didn\'t go through. Try again, or use your email.', age: 'To make an account, check the box confirming you\'re 13 or older, then try again.' };
  msg('acct-err', err ? (msgs[err] || err) : '', true);
}
function showSetPw(kind) {
  $('acct-setpw').hidden = false;
  $('acct-setpw-h').textContent = kind === 'reset' ? 'Choose a new password' : 'Add a password';
  $('acct-setpw-note').textContent = kind === 'reset' ? 'At least 8 characters.' : 'You\'re signed in. Add a password so you can sign in with it next time (at least 8 characters).';
  $('acct-setpw-skip').hidden = kind === 'reset';
  $('acct-setpw-form').dataset.kind = kind;
  $('acct-newpw').value = ''; msg('acct-setpw-msg', '');
}

function renderProfile(u, self) {
  $('acct-in').hidden = false;
  $('acct-avatar').textContent = (u.name || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '?';
  $('acct-name').textContent = u.name;
  $('acct-handle').textContent = `rinkroll.app/u/${u.handle}`;
  $('acct-out-btn').hidden = !self; $('acct-tab-settings').hidden = !self;
  msg('acct-msg', '');
  const st = u.stats;
  const tile = (big, label, small = '') => `<div class="acct-tile"><b>${big}</b><span>${label}</span>${small ? `<small>${small}</small>` : ''}</div>`;
  $('acct-tiles').innerHTML =
    tile(st.avg ? chip(st.avg) : '—', 'Avg build', `${st.builds} ${st.builds === 1 ? 'build' : 'builds'}`) +
    tile(st.daily.streak, 'Day streak', `best ${st.daily.best}`) +
    tile(`${st.h2h.w}–${st.h2h.l}`, 'Head-to-head', st.h2h.t ? `${st.h2h.t} tied` : '') +
    tile(u.rank ? '#' + u.rank : '—', 'Global rank', u.rank ? '' : `${Math.max(0, 10 - st.daily.n)} more ${10 - st.daily.n === 1 ? 'Daily' : 'Dailies'} to rank`);
  if (self && ACCT.rankData && ACCT.rankData.me) $('acct-tiles').lastElementChild.querySelector('b').textContent = '#' + ACCT.rankData.me.rank;
  renderShowcase(u, self); renderBadges(u, self); renderHist(u);
  setTab('hist');
  if (self) {
    $('acct-rename').value = u.name;
    $('acct-pw2-label').textContent = u.hasPassword ? 'Change password' : 'Add a password';
    $('acct-signin-ways').textContent = `Signed in as ${u.email}. You can sign in with: ${['email link', u.hasPassword ? 'password' : null, u.google ? 'Google' : null].filter(Boolean).join(', ')}.`;
    if (!ACCT.rankData) loadRank(true);
  }
}
function renderShowcase(u, self) {
  const sc = u.showcase || [];
  $('acct-sc-note').textContent = self ? (ACCT.picking ? 'Tap badges below to pick up to 3, then tap Done.' : 'Shown next to your name on the leaderboard.') : '';
  $('acct-showcase').innerHTML = (sc.length ? sc.map(id => `<div class="badge">${puck(id, u.badges[id] && u.badges[id].tier, 'big')}<span class="bn">${esc(ACCT.catalog[id].name)}</span></div>`).join('') : `<p class="note">${self ? 'No badges picked yet.' : 'No badges picked yet.'}</p>`)
    + (self ? `<button class="btn" id="acct-pick" type="button">${ACCT.picking ? 'Done' : 'Pick badges'}</button>` : '');
  if (self) $('acct-pick').onclick = async () => {
    if (ACCT.picking) {
      ACCT.picking = false;
      try { await acctApi('/api/me', { action: 'showcase', ids: ACCT.user.showcase }); } catch (e) { msg('acct-msg', e.message, true); }
    } else ACCT.picking = true;
    renderShowcase(ACCT.user, true); renderBadges(ACCT.user, true);
  };
}
function renderBadges(u, self) {
  const cat = ACCT.catalog || {}, got = u.badges || {};
  const n = BADGE_ORDER.filter(id => got[id]).length;
  $('acct-bcount').textContent = `${n} / ${BADGE_ORDER.length}`;
  $('acct-badges').innerHTML = BADGE_GROUPS.map(g => `<div class="acct-group"><h4>${g}</h4><div class="acct-bgrid">${BADGE_ORDER.filter(id => cat[id] && cat[id].group === g).map(id => {
    const b = got[id], t = b && b.tier, tag = self && ACCT.picking && t ? 'button' : 'div', sel = (u.showcase || []).includes(id) ? ' sel' : '';
    const count = b && cat[id].rep ? ` · ${b.n}×` : '';
    return `<${tag} class="badge${sel}" data-id="${id}"${tag === 'button' ? ' type="button"' : ''}>${puck(id, t)}<span class="bn">${esc(cat[id].name)}</span>${t ? `<span class="bt" style="color:${t === 'gold' ? G : t === 'silver' ? '#c9d4e0' : t === 'bronze' ? '#c98a5a' : I}">${TIER_TEXT[t]}${count}</span>` : ''}<span class="bh">${esc(cat[id].how)}</span></${tag}>`;
  }).join('')}</div></div>`).join('');
  if (self && ACCT.picking) $('acct-badges').querySelectorAll('button.badge').forEach(el => el.onclick = () => {
    const id = el.dataset.id, sc = ACCT.user.showcase || [];
    ACCT.user.showcase = sc.includes(id) ? sc.filter(x => x !== id) : [...sc, id].slice(-3);
    renderShowcase(ACCT.user, true); renderBadges(ACCT.user, true);
  });
  // next streak badge
  const st = u.stats.daily, goals = [[3, 'hat-trick'], [30, 'iron-man'], [82, 'every-game']].find(([nn, id]) => !got[id]);
  $('acct-next').hidden = !self || !goals;
  if (self && goals) {
    const [goal, id] = goals, have = Math.min(goal, st.streak);
    $('acct-next').innerHTML = `<div class="row"><b>Next up: ${esc(cat[id].name)}</b><span>${have} / ${goal} days</span></div><div class="acct-bar"><i style="width:${Math.round(have / goal * 100)}%"></i></div>`;
  }
}
function renderHist(u) {
  const list = u.hist || [];
  if (!list.length) { $('acct-pane-hist').innerHTML = '<p class="note">No builds yet. Finish a build, Daily, Line or head-to-head and it shows up here.</p>'; return; }
  const when = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const posName = p => ({ F: 'Forward', D: 'Defenseman', G: 'Goalie' }[p] || '');
  $('acct-pane-hist').innerHTML = '<ul class="acct-hist">' + list.map(h => {
    let what, right = '', chips = '';
    if (h.k === 'build') { what = `${h.play === 'daily' ? 'Daily' : h.play === 'h2h' ? 'Head-to-head' : 'Solo'} · ${posName(h.pos)} · ${h.mode === 'current' ? 'Current NHL' : 'Modern Era Stars'}`; right = `<span class="ovr-chip">${chip(h.ovr)}</span>`; chips = (h.grades || []).map(chip).join(''); }
    else if (h.k === 'line') { what = `${h.variant === 'cap' ? 'Cap Line' : 'Skill Line'} · ${h.rec} · ${h.pts} pts`; right = h.cup ? '<span class="ovr-chip">🏆</span>' : ''; chips = `<span class="when">${esc(h.finish || '')}</span>`; }
    else { what = `Head-to-head ${h.res === 'win' ? 'win' : h.res === 'loss' ? 'loss' : 'tie'}${h.opp ? ' vs ' + esc(h.opp) : ''}`; right = h.ovr ? `<span class="ovr-chip">${chip(h.ovr)}</span>` : ''; }
    return `<li><div><div class="what">${what}</div><div class="when">${when(h.t)}</div></div>${right}${chips ? `<div class="chips">${chips}</div>` : ''}</li>`;
  }).join('') + '</ul>';
}
async function loadRank(quiet) {
  try {
    const j = ACCT.rankData = await acctApi('/api/rank');
    if (ACCT.user && j.me && !ACCT.view) { const b = $('acct-tiles').lastElementChild; if (b) { b.querySelector('b').textContent = '#' + j.me.rank; const s = b.querySelector('small'); if (s) s.remove(); } }
    renderRank();
  } catch (e) { if (!quiet) $('acct-pane-rank').innerHTML = '<p class="note">Couldn\'t load the ranking. Try again in a moment.</p>'; }
}
function renderRank() {
  const j = ACCT.rankData; if (!j) { $('acct-pane-rank').innerHTML = '<p class="note">Loading…</p>'; return; }
  const row = r => `<li class="${j.me && j.me.handle === r.handle ? 'me' : ''}"><span class="r">${r.rank}</span><span class="n"><a href="#u=${esc(r.handle)}">${esc(r.name)}</a>${miniBadges(r.sc)}</span><span class="d">${r.n} Dailies</span>${chip(r.grade)}</li>`;
  $('acct-pane-rank').innerHTML = `<p class="note">Ranked by average Daily grade. Play ${j.min} Dailies with an account to get on the board.</p>`
    + (j.rows.length ? `<ol class="acct-rank">${j.rows.map(row).join('')}</ol>` : '<p class="note">Nobody has played enough Dailies yet. You could be first.</p>')
    + (j.me && j.me.rank > 50 ? `<ol class="acct-rank">${row(j.me)}</ol>` : '');
}
function setTab(tab) {
  document.querySelectorAll('.acct-tab').forEach(b => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  ['hist', 'rank', 'settings'].forEach(t => $('acct-pane-' + t).hidden = t !== tab);
  if (tab === 'rank') { renderRank(); loadRank(); }
}

/* ---- wiring ---- */
function acctWire() {
  if (!$('account')) return;
  const age = $('acct-age'), g = $('acct-google');
  age.onchange = () => g.href = '/api/auth/google?age=' + (age.checked ? 1 : 0);
  let pwMode = false;
  $('acct-pw-toggle').onclick = () => {
    pwMode = !pwMode;
    $('acct-pw-wrap').hidden = !pwMode; $('acct-pw-links').hidden = !pwMode;
    $('acct-email-go').textContent = pwMode ? 'Sign in' : 'Email me a sign-in link';
    $('acct-pw-toggle').textContent = pwMode ? 'Use an email link' : 'Use a password';
    msg('acct-err', '');
  };
  const email = () => $('acct-email').value.trim();
  const busy = (on) => $('acct-email-go').disabled = on;
  $('acct-email-form').onsubmit = async e => {
    e.preventDefault(); msg('acct-err', ''); busy(true);
    try {
      if (pwMode) { await acctApi('/api/auth/password', { action: 'login', email: email(), password: $('acct-pw').value }); await openAccount({ reload: true }); }
      else { await acctApi('/api/auth/email', { email: email(), age13: age.checked }); msg('acct-err', `Check ${email()} for your sign-in link. It expires in 15 minutes.`); $('acct-err').classList.remove('err'); }
    } catch (err) { msg('acct-err', err.message, true); }
    busy(false);
  };
  $('acct-forgot').onclick = async () => {
    msg('acct-err', '');
    try { await acctApi('/api/auth/password', { action: 'reset-request', email: email() }); msg('acct-err', `If there's an account for ${email()}, a reset link is on its way.`); $('acct-err').classList.remove('err'); }
    catch (err) { msg('acct-err', err.message, true); }
  };
  $('acct-make-pw').onclick = async () => {
    msg('acct-err', '');
    try { await acctApi('/api/auth/password', { action: 'signup', email: email(), age13: age.checked }); msg('acct-err', `Check ${email()} for a link. Open it to finish making your account and pick your password.`); $('acct-err').classList.remove('err'); }
    catch (err) { msg('acct-err', err.message, true); }
  };
  $('acct-setpw-form').onsubmit = async e => {
    e.preventDefault();
    const kind = e.target.dataset.kind, pw = $('acct-newpw').value;
    try {
      if (kind === 'reset') await acctApi('/api/auth/password', { action: 'reset', t: ACCT.resetToken, password: pw });
      else await acctApi('/api/me', { action: 'set-password', password: pw });
      ACCT.resetToken = null; await openAccount({ reload: true }); msg('acct-msg', 'Password saved.');
    } catch (err) { msg('acct-setpw-msg', err.message, true); }
  };
  $('acct-setpw-skip').onclick = () => openAccount({ reload: true });
  $('acct-out-btn').onclick = async () => { try { await acctApi('/api/auth/logout', {}); } catch (e) {} ACCT.user = null; ACCT.rankData = null; acctNav(); openAccount(); };
  $('acct-back').onclick = () => { history.replaceState(null, '', location.pathname); show('setup'); };
  $('acct-handle').onclick = () => {
    const u = ACCT.view || ACCT.user; if (!u) return;
    const link = `https://rinkroll.app/u/${u.handle}`;
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => msg('acct-msg', 'Profile link copied.'), () => msg('acct-msg', link));
  };
  document.querySelectorAll('.acct-tab').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('acct-rename-form').onsubmit = async e => { e.preventDefault(); try { await acctApi('/api/me', { action: 'rename', name: $('acct-rename').value }); await openAccount({ reload: true }); setTab('settings'); msg('acct-set-msg', 'Name saved.'); } catch (err) { msg('acct-set-msg', err.message, true); } };
  $('acct-pw-form').onsubmit = async e => { e.preventDefault(); try { await acctApi('/api/me', { action: 'set-password', password: $('acct-pw2').value }); $('acct-pw2').value = ''; await openAccount({ reload: true }); setTab('settings'); msg('acct-set-msg', 'Password saved.'); } catch (err) { msg('acct-set-msg', err.message, true); } };
  $('acct-del-form').onsubmit = async e => {
    e.preventDefault();
    try { await acctApi('/api/me', { action: 'delete', confirm: $('acct-del').value.trim() }); ACCT.user = null; acctNav(); history.replaceState(null, '', location.pathname); show('setup'); acctToast('Your account was deleted.'); }
    catch (err) { msg('acct-set-msg', err.message, true); }
  };
  $('acct-link').addEventListener('click', e => { e.preventDefault(); history.replaceState(null, '', '#account'); openAccount(); });
}

// links: /u/<handle> and #u=<handle> (profiles), #account, #login=<token>, #reset=<token>
async function acctRoute() {
  const pm = /^\/u\/([A-Za-z0-9]{1,24})\/?$/.exec(location.pathname);
  if (pm) { history.replaceState(null, '', '/#u=' + pm[1].toLowerCase()); }
  const h = location.hash;
  let m;
  if ((m = /^#login=([A-Za-z0-9_-]{20,100})$/.exec(h))) {
    history.replaceState(null, '', location.pathname);
    show('account'); $('acct-loading').hidden = false; $('acct-loading').textContent = 'Signing you in…';
    try {
      const j = await acctApi('/api/auth/verify', { t: m[1] });
      $('acct-loading').textContent = 'Loading…';
      await openAccount({ reload: true, setPassword: j.setPassword ? 'new' : null });
      if (j.created) acctToast('Welcome to Rink Roll! Your account is ready.');
    } catch (err) { $('acct-loading').hidden = true; ACCT.loaded = false; await openAccount(); msg('acct-err', err.message, true); }
    return true;
  }
  if ((m = /^#reset=([A-Za-z0-9_-]{20,100})$/.exec(h))) {
    ACCT.resetToken = m[1]; history.replaceState(null, '', location.pathname);
    show('account'); $('acct-loading').hidden = true; ['acct-out', 'acct-in'].forEach(id => $(id).hidden = true); showSetPw('reset');
    return true;
  }
  if ((m = /^#u=([A-Za-z0-9]{1,24})$/.exec(h))) { openProfile(m[1].toLowerCase()); return true; }
  if ((m = /^#account(?:\?(err|new)=(\w+))?$/.exec(h))) {
    history.replaceState(null, '', location.pathname + '#account');
    await openAccount({ reload: true, err: m[1] === 'err' ? m[2] : null });
    if (m[1] === 'new') acctToast('Welcome to Rink Roll! Your account is ready.');
    return true;
  }
  return false;
}
if (LB_ON) {
  acctWire();
  window.addEventListener('hashchange', () => { if (/^#(u=|account|login=|reset=)/.test(location.hash)) acctRoute(); });
  acctRoute().then(routed => { if (!routed) acctLoad(); });
}
