/* ---------- head-to-head (lobbies run through rinkroll.app, so any two networks work) ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const API = '/api/lobby';
const STALE_MS = 15000;     // opponent counts as "not responding" after this long without a check-in
const net = { role: null, code: null, lobby: null, players: {}, started: false, verdictRound: 0, oppName: 'Opponent',
  connecting: false, poll: 0, beat: 0, lastSent: 0, failures: 0, resetFor: 0, cid: '', serverSkew: 0 };

try { net.cid = localStorage.getItem('rinkroll-cid') || ''; } catch (e) {}
if (!/^[A-Za-z0-9_-]{8,40}$/.test(net.cid)) { net.cid = 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem('rinkroll-cid', net.cid); } catch (e) {} }

function newSeed() { return Math.floor(Math.random() * 2 ** 31); }
function msg(id, text, err) { const el = $(id); el.textContent = text; el.classList.toggle('err', !!err); }
function myName() { return ($('my-name').value || '').trim().slice(0, 16) || 'Player'; }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Opponent'; }
function freshPlayer(role, round) { return { role, round, slots: [], seqIdx: 0, rerolls: 1, done: false, avg: null }; }

// POST to the lobby API, retrying network hiccups and server errors (not "lobby full" style answers)
async function api(body, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cid: net.cid, name: myName(), ...body }) });
      let data = {}; try { data = await r.json(); } catch (e) {}
      if (r.ok) return data;
      const err = new Error(data.error || 'Couldn\'t reach the lobby. Check your connection and try again.'); err.status = r.status;
      if (r.status < 500) throw err;
      last = err;
    } catch (e) { if (e.status && e.status < 500) throw e; last = e; }
    await new Promise(res => setTimeout(res, 600 * (i + 1)));
  }
  const err = new Error('Couldn\'t reach the lobby. Check your connection and try again.'); err.cause = last; throw err;
}
async function getLobby(code, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${API}?code=${encodeURIComponent(code)}&cid=${encodeURIComponent(net.cid)}`, { cache: 'no-store' }); if (r.status < 500) return r; } catch (e) {}
    await new Promise(res => setTimeout(res, 600 * (i + 1)));
  }
  return null;
}

try { const n = localStorage.getItem('rinkroll-name'); if (n) $('my-name').value = n; } catch (e) {}
$('my-name').addEventListener('change', () => { try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {} });
$('join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });

async function createLobby() {
  if (net.connecting) return;
  audio();
  try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {}
  net.connecting = true; $('create').disabled = true; msg('online-msg', 'Creating lobby…');
  try {
    const r = await api({ action: 'create', mode: state.mode, pos: state.pos });
    msg('online-msg', ''); enterLobby(r.code, r.you);
  } catch (e) { msg('online-msg', e.message, true); }
  net.connecting = false; $('create').disabled = false;
}

async function joinLobby(codeIn) {
  if (net.connecting) return;
  audio();
  const code = (codeIn || $('join-code').value).toUpperCase().trim();
  if (!CODE_RE.test(code)) { msg('online-msg', 'Lobby codes are 5 letters and numbers, like K7QMX.', true); return; }
  try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {}
  net.connecting = true; $('join').disabled = true; msg('online-msg', `Joining lobby ${code}…`);
  try {
    const r = await api({ action: 'join', code });
    msg('online-msg', ''); enterLobby(r.code, r.you);
  } catch (e) { msg('online-msg', e.message, true); }
  net.connecting = false; $('join').disabled = false;
}

function enterLobby(code, role) {
  stopPolling();
  state.online = true; net.code = code; net.role = role; net.lobby = null; net.players = {}; net.started = false; net.verdictRound = 0; net.resetFor = 0; net.failures = 0;
  try { history.replaceState(null, '', '#' + code); } catch (e) {}
  $('lobby-code').textContent = code;
  $('h2h-code').textContent = 'Lobby ' + code;
  $('seats').innerHTML = ''; $('lobby-info').textContent = '';
  $('lobby-howto').hidden = role !== 'host';
  msg('lobby-msg', role === 'host' ? 'Waiting for an opponent…' : 'Joined. Getting the lobby settings…');
  show('lobby');
  pollNow();
}

function stopPolling() { clearTimeout(net.poll); net.poll = 0; }
function pollDelay() {
  if (document.visibilityState === 'hidden') return 8000;
  const opp = net.players.opp;
  if (!$('result').hidden && opp && opp.done && net.lobby && opp.round === net.lobby.round) return 4000;
  return 1500;
}
async function pollNow() {
  clearTimeout(net.poll);
  if (!state.online || !net.code) return;
  const code = net.code;
  try {
    const r = await fetch(`${API}?code=${encodeURIComponent(code)}&cid=${encodeURIComponent(net.cid)}`, { cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (code !== net.code) return; // left or switched lobbies meanwhile
    if (!r.ok) {
      if (r.status === 404 || r.status === 403) { msg('lobby-msg', data.error || 'This lobby is no longer available.', true); state.online = false; return; }
      throw new Error('poll');
    }
    net.failures = 0;
    applyServer(data);
  } catch (e) {
    net.failures++;
    if (net.failures >= 3) { msg('lobby-msg', 'Having trouble reaching the lobby. Retrying…', true); renderOppBar(); }
  }
  if (state.online && net.code === code) net.poll = setTimeout(pollNow, pollDelay());
}

function applyServer(d) {
  const L = d.lobby;
  net.lobby = { code: L.code, mode: L.mode, pos: L.pos, peek: false, seed: L.seed >>> 0, round: L.round | 0, hasGuest: !!L.hasGuest };
  net.serverSkew = Date.now() - (d.now || Date.now());
  if (d.opp) {
    net.oppName = cleanName(d.opp.name);
    net.players.opp = { role: net.role === 'host' ? 'guest' : 'host', round: d.opp.round | 0, slots: d.opp.slots || [], done: !!d.opp.done, avg: d.opp.avg, t: d.opp.t };
  } else delete net.players.opp;
  // my own seat: keep what's on this device; fall back to the server copy (e.g. after a reload)
  if (d.me && d.me.name && !$('my-name').value.trim()) $('my-name').value = d.me.name;
  if (!net.players.me && d.me) net.players.me = { role: net.role, round: d.me.round | 0, slots: d.me.slots || [], seqIdx: d.me.seqIdx | 0, rerolls: d.me.rerolls ?? 1, done: !!d.me.done, avg: d.me.avg };
  if (!net.players.me) net.players.me = freshPlayer(net.role, net.lobby.round);
  evaluate();
}

function oppQuiet() { const o = net.players.opp; return !o || !o.t ? false : (Date.now() - net.serverSkew) - o.t > STALE_MS; }

// Send my progress (and check in every few seconds so the other player sees I'm still here)
function pushProgress() {
  if (!state.online || !net.code || !net.players.me) return;
  const sent = Date.now();
  api({ action: 'progress', code: net.code, p: net.players.me }).then(() => { net.lastSent = sent; }).catch(() => {});
}
function startBeat() { clearInterval(net.beat); net.beat = setInterval(() => { if (!state.online) { clearInterval(net.beat); return; } if (Date.now() - net.lastSent > 6000) pushProgress(); }, 3000); }

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.online) { pushProgress(); pollNow(); } });

function leaveLobby() {
  stopPolling(); clearInterval(net.beat);
  state.online = false; net.code = null; net.lobby = null; net.players = {}; net.started = false; net.role = null;
  cancelAnimationFrame(rafId); state.spinning = false;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  $('again').hidden = false; $('rematch').hidden = true; $('leave-result').hidden = true; $('h2h').hidden = true;
  setPlay('online');
  show('setup');
}

function opponentId() { return net.players.opp ? 'opp' : null; }
async function nameOf(id) { return id === 'me' ? 'You' : net.oppName; }

function evaluate() {
  const L = net.lobby; if (!L || !state.online) return;
  let me = net.players.me; const opp = net.players.opp;
  // a new round started (rematch): reset my seat once and head back to the lobby
  if (me.round !== L.round && net.resetFor !== L.round) {
    net.resetFor = L.round; net.started = false;
    me = net.players.me = freshPlayer(net.role, L.round);
    pushProgress();
    if ($('lobby').hidden) { show('lobby'); }
  }
  renderLobby(L, opp);
  const ready = me && opp && me.round === L.round && opp.round === L.round;
  if (!net.started && ready) { net.started = true; startBeat(); pushProgress(); startOnline(L, me); return; }
  if (net.started) { renderOppBar(); if (!$('result').hidden) renderH2H(); }
}

function renderLobby(L, opp) {
  $('lobby-info').textContent = `${L.mode === 'current' ? 'Current NHL' : 'Modern Era Stars'} · ${POSNAME[L.pos]} · grades hidden`;
  const seat = (role, name, filled) => `<div class="seat${filled ? '' : ' empty'}"><span class="r">${role}</span><span class="n">${esc(name)}</span></div>`;
  const meName = myName() + ' (you)';
  const host = net.role === 'host' ? meName : net.oppName;
  const guest = net.role === 'host' ? (opp ? net.oppName : 'Waiting…') : meName;
  $('seats').innerHTML = seat('Host', host, true) + seat('Challenger', guest, net.role === 'guest' || !!opp);
  if (net.role === 'host') $('lobby-howto').hidden = !!opp;
  if (!opp) { if (net.role === 'host') msg('lobby-msg', 'Waiting for an opponent…'); return; }
  const me = net.players.me, synced = me && me.round === L.round && opp.round === L.round;
  if (synced) msg('lobby-msg', 'Both players in. Starting…');
  else if (oppQuiet()) msg('lobby-msg', `Waiting for ${net.oppName}… Their game may be closed or in the background. Ask them to open Rink Roll.`, true);
  else msg('lobby-msg', L.round > 1 ? `Rematch! Waiting for ${net.oppName} to jump in…` : `Waiting for ${net.oppName}…`);
}

function startOnline(L, me) {
  state.daily = null;
  state.mode = L.mode; state.pos = L.pos; state.peek = false; // head-to-head is always grades-hidden
  document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === state.mode));
  document.querySelectorAll('[data-pos]').forEach(x => x.setAttribute('aria-pressed', x.dataset.pos === state.pos));
  $('peek').checked = false;
  state.online = true;
  const seat = net.role === 'host' ? 0 : 104729; // host and challenger get different spins
  state.seq = seededSeq(POOLS[state.mode][state.pos], (L.seed + L.round * 7919 + seat) >>> 0);
  state.seqIdx = me.seqIdx || 0;
  state.rerolls = typeof me.rerolls === 'number' ? me.rerolls : 1;
  const resume = (me.slots && me.slots.some(Boolean)) ? me.slots : null;
  initBuild(resume);
}

function saveProgress(done, avg) {
  if (!state.online || !net.lobby) return;
  net.players.me = {
    role: net.role, round: net.lobby.round,
    slots: state.slots.map(s => s.player ? { name: s.player.name, team: s.player.team, pos: s.player.pos, grade: s.grade } : null),
    seqIdx: state.seqIdx, rerolls: state.rerolls, done: !!done, avg: done ? avg : null
  };
  pushProgress();
}

function renderOppBar() {
  if (!state.online) return;
  const opp = net.players.opp;
  const n = state.slots.length;
  const f = opp && net.lobby && opp.round === net.lobby.round ? (opp.slots || []).filter(Boolean).length : 0;
  const pips = Array.from({ length: n }, (_, i) => `<span class="pip${i < f ? ' on' : ''}"></span>`).join('');
  const status = net.failures >= 3 ? 'reconnecting…' : oppQuiet() ? 'not responding…' : f === n ? 'is done' : `${f} / ${n}`;
  $('opp-bar').innerHTML = `<span><b>${esc(net.oppName)}</b> ${status}</span><span class="pips">${pips}</span>`;
}

function renderH2H() {
  const L = net.lobby; if (!L) return;
  const opp = net.players.opp;
  const v = $('verdict');
  const oname = net.oppName;
  if (!opp || opp.round !== L.round || !opp.done) {
    const f = opp && opp.round === L.round ? (opp.slots || []).filter(Boolean).length : 0;
    v.className = 'verdict wait';
    v.textContent = oppQuiet() ? `Waiting for ${oname} (${f} / ${state.slots.length})… their game may be in the background.` : `Waiting for ${oname} to finish (${f} / ${state.slots.length})…`;
    $('h2h-table').innerHTML = ''; $('rematch').disabled = true;
    return;
  }
  $('rematch').disabled = false;
  const mine = state.slots.map(s => ({ name: s.player.name, team: s.player.team, grade: s.grade }));
  const theirs = opp.slots || [];
  const safe = g => SCALE.includes(g) ? g : 'F';
  let myWins = 0, oppWins = 0;
  const rows = state.slots.map((s, i) => {
    const a = mine[i], b = theirs[i] || { name: '—', grade: 'F' };
    const bg = safe(b.grade);
    const da = gv(a.grade), db = gv(bg);
    if (da > db) myWins++; else if (db > da) oppWins++;
    return `<div class="h2h-row"><span class="who">${esc(a.name)}</span><span class="gr${da < db ? ' lose' : ''}" data-t="${tier(a.grade)}">${a.grade}</span><span class="k">${s.k}</span><span class="gr${db < da ? ' lose' : ''}" data-t="${tier(bg)}">${bg}</span><span class="who r">${esc(String(b.name || '—'))}</span></div>`;
  });
  const myAvg = mine.reduce((s, x) => s + gv(x.grade), 0) / mine.length;
  const oppAvg = state.slots.reduce((s, _, i) => s + gv(safe(theirs[i] && theirs[i].grade)), 0) / state.slots.length;
  const myO = SCALE[Math.round(myAvg)], oppO = SCALE[Math.round(oppAvg)];
  const head = `<div class="h2h-row head"><span class="hide-sm">You</span><span></span><span></span><span></span><span class="hide-sm" style="text-align:right">${esc(oname)}</span></div>`;
  const total = `<div class="h2h-row total"><span class="who">${myWins} categories won</span><span class="gr${myAvg < oppAvg ? ' lose' : ''}" data-t="${tier(myO)}">${myO}</span><span class="k">Overall</span><span class="gr${oppAvg < myAvg ? ' lose' : ''}" data-t="${tier(oppO)}">${oppO}</span><span class="who r">${oppWins} categories won</span></div>`;
  $('h2h-table').innerHTML = head + rows.join('') + total;
  let res;
  if (Math.abs(myAvg - oppAvg) > 1e-9) res = myAvg > oppAvg ? 'win' : 'loss';
  else res = myWins > oppWins ? 'win' : oppWins > myWins ? 'loss' : 'tie';
  v.className = 'verdict ' + (res === 'tie' ? '' : res);
  const how = (w, l) => w >= l ? `${w}–${l} in categories` : `on overall grade (${w}–${l} in categories)`;
  v.textContent = res === 'win' ? `You win ${how(myWins, oppWins)}` : res === 'loss' ? `${oname} wins ${how(oppWins, myWins)}` : 'Dead even';
  if (net.verdictRound !== L.round) { net.verdictRound = L.round; fanfare(res !== 'loss'); }
}

async function rematch() {
  if (!net.lobby) return;
  $('rematch').disabled = true;
  msg('lobby-msg', 'Starting a rematch…');
  try { await api({ action: 'rematch', code: net.code, fromRound: net.lobby.round }); } catch (e) { msg('lobby-msg', e.message, true); }
  pollNow();
}

$('create').addEventListener('click', createLobby);
$('join').addEventListener('click', () => joinLobby());
$('leave-lobby').addEventListener('click', leaveLobby);
$('leave-result').addEventListener('click', leaveLobby);
$('rematch').addEventListener('click', rematch);
function copyOut(text, toastId, label) {
  const ok = () => { $(toastId).textContent = label; };
  const fb = () => {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); let done = false; try { done = document.execCommand('copy'); } catch (e) {} ta.remove();
    $(toastId).textContent = done ? label : text;
  };
  try { navigator.clipboard.writeText(text).then(ok, fb); } catch (e) { fb(); }
}
$('copy-code').addEventListener('click', () => copyOut(net.code || '', 'code-toast', 'Code copied'));
$('copy-link').addEventListener('click', () => copyOut(location.origin + location.pathname + '#' + (net.code || ''), 'code-toast', 'Invite link copied'));

(function initFromLink() {
  const h = (location.hash || '').slice(1).toUpperCase();
  if (!CODE_RE.test(h)) return;
  setPlay('online'); $('join-code').value = h;
  // rejoin automatically if this device is already in that lobby (e.g. after a reload); otherwise wait for a name
  getLobby(h).then(r => r && r.ok ? r.json() : null).then(d => {
    if (d && d.you) enterLobby(h, d.you);
    else msg('online-msg', `You've been invited to lobby ${h}. Enter your name and press Join.`);
  }).catch(() => msg('online-msg', `You've been invited to lobby ${h}. Enter your name and press Join.`));
})();
