/* ---------- head-to-head (peer-to-peer, no accounts) ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const PEER_PREFIX = 'rinkroll-v1-';
const net = { peer: null, conn: null, role: null, code: null, lobby: null, players: {}, started: false, verdictRound: 0, oppName: 'Opponent', timer: 0, connecting: false,
  cid: '', oppCid: '', lastHeard: 0, beat: 0, retry: 0, retries: 0 };
try { net.cid = sessionStorage.getItem('rinkroll-cid') || ''; } catch (e) {}
if (!net.cid) { net.cid = 'c' + Math.random().toString(36).slice(2, 12); try { sessionStorage.setItem('rinkroll-cid', net.cid); } catch (e) {} }
const STALE_MS = 9000;  // no word from the other phone for this long = probably paused or dropped

function newCode() { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]; return s; }
function newSeed() { return Math.floor(Math.random() * 2 ** 31); }
function msg(id, text, err) { const el = $(id); el.textContent = text; el.classList.toggle('err', !!err); }
function myName() { return ($('my-name').value || '').trim().slice(0, 16) || 'Player'; }
function cleanName(n) { return String(n || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || 'Opponent'; }
function peerError(e) {
  const t = e && e.type;
  if (t === 'peer-unavailable') return 'No lobby found with that code. Check it with your friend, and make sure their lobby screen is still open.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return 'Couldn\'t reach the matchmaking server. Check your connection and try again.';
  if (t === 'browser-incompatible') return 'This browser can\'t do head-to-head. Try a current Chrome, Edge, Firefox or Safari.';
  return 'Connection problem. Try again.';
}

try { const n = localStorage.getItem('rinkroll-name'); if (n) $('my-name').value = n; } catch (e) {}
$('my-name').addEventListener('change', () => { try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {} });

$('join-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });

function peerAvailable() {
  if (typeof Peer === 'undefined') { msg('online-msg', 'Head-to-head couldn\'t load. Check your connection and refresh the page.', true); return false; }
  return true;
}
function freshPlayer(role, round) { return { role, round, slots: [], seqIdx: 0, rerolls: 1, done: false, avg: null }; }
function send(obj) { try { if (net.conn && net.conn.open) net.conn.send(obj); } catch (e) {} }
function sendLobby() { if (net.role === 'host' && net.lobby) send({ type: 'lobby', L: net.lobby }); }
function sendProgress() { if (net.players.me) send({ type: 'progress', p: net.players.me }); }

function createLobby() {
  if (!peerAvailable() || net.connecting) return;
  audio();
  try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {}
  net.connecting = true; $('create').disabled = true; msg('online-msg', 'Creating lobby…');
  tryHost(0);
}
function tryHost(attempt) {
  const code = newCode();
  const peer = new Peer(PEER_PREFIX + code);
  peer.on('open', () => {
    teardown();
    net.peer = peer; net.role = 'host'; net.code = code;
    net.lobby = { code, mode: state.mode, pos: state.pos, peek: false, seed: newSeed(), round: 1 };
    net.players = { me: freshPlayer('host', 1) };
    net.connecting = false; $('create').disabled = false; msg('online-msg', '');
    enterLobby();
  });
  peer.on('connection', c => {
    if (!(net.conn && net.conn.open)) { attachConn(c); return; }
    // someone new while a challenger is connected: let them in only if it's the same
    // challenger reconnecting, or the current connection has gone silent
    let decided = false;
    c.on('data', d => {
      if (decided) return; decided = true;
      const same = d && d.type === 'hello' && d.cid && d.cid === net.oppCid;
      const dead = Date.now() - net.lastHeard > STALE_MS;
      if (same || dead) {
        const old = net.conn; net.conn = null; try { old.close(); } catch (e) {}
        attachConn(c); onData(d);
      } else { try { c.send({ type: 'full' }); } catch (e) {} setTimeout(() => { try { c.close(); } catch (e) {} }, 400); }
    });
  });
  peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
  peer.on('error', e => {
    if (e.type === 'unavailable-id' && attempt < 4) { peer.destroy(); tryHost(attempt + 1); return; }
    if (net.peer === peer && e.type !== 'peer-unavailable') { msg('lobby-msg', peerError(e), true); return; }
    net.connecting = false; $('create').disabled = false; msg('online-msg', peerError(e), true);
  });
}

function joinLobby(codeIn) {
  if (!peerAvailable() || net.connecting) return;
  audio();
  const code = (codeIn || $('join-code').value).toUpperCase().trim();
  if (!CODE_RE.test(code)) { msg('online-msg', 'Lobby codes are 5 letters and numbers, like K7QMX.', true); return; }
  try { localStorage.setItem('rinkroll-name', myName()); } catch (e) {}
  net.connecting = true; $('join').disabled = true; msg('online-msg', `Connecting to lobby ${code}…`);
  const peer = new Peer();
  const fail = text => { net.connecting = false; $('join').disabled = false; msg('online-msg', text, true); try { peer.destroy(); } catch (e) {} };
  peer.on('open', () => {
    const c = peer.connect(PEER_PREFIX + code, { reliable: true });
    const t = setTimeout(() => { if (!c.open) fail('Couldn\'t connect to that lobby. Make sure your friend\'s lobby screen is open, then try again.'); }, 12000);
    c.on('open', () => {
      clearTimeout(t);
      teardown();
      net.peer = peer; net.role = 'guest'; net.code = code; net.lobby = null; net.players = {};
      net.connecting = false; $('join').disabled = false; msg('online-msg', '');
      attachConn(c);
      enterLobby();
    });
  });
  peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
  peer.on('error', e => { if (net.peer === peer) msg('lobby-msg', peerError(e), true); else fail(peerError(e)); });
}

function attachConn(c) {
  const onOpen = () => {
    net.conn = c; net.lastHeard = Date.now(); net.retries = 0; clearTimeout(net.retry);
    send({ type: 'hello', name: myName(), cid: net.cid });
    sendLobby(); sendProgress();
    startHeartbeat();
    evaluate();
  };
  if (c.open) onOpen(); else c.on('open', onOpen);
  c.on('data', d => onData(d));
  c.on('close', () => {
    if (net.conn !== c) return;
    net.conn = null;
    if (state.online) {
      renderOppBar();
      if (net.role === 'guest') { msg('lobby-msg', 'Lost the connection. Reconnecting…', true); scheduleReconnect(); }
      else msg('lobby-msg', `Lost the connection to ${net.oppName}. Waiting for them to reconnect…`, true);
      if (!$('result').hidden && !$('h2h-table').innerHTML) { $('verdict').className = 'verdict wait'; $('verdict').textContent = `${net.oppName} lost connection. Waiting for them to reconnect…`; }
    }
  });
}

function onData(d) {
  if (!d || typeof d !== 'object') return;
  net.lastHeard = Date.now();
  if (d.type === 'ping') return;
  if (d.type === 'hello') { net.oppName = cleanName(d.name); if (d.cid) net.oppCid = String(d.cid).slice(0, 20); evaluate(); return; }
  if (d.type === 'full') { msg('online-msg', 'That lobby already has two players.', true); leaveLobby(); return; }
  if (d.type === 'lobby' && net.role === 'guest') {
    const L = d.L; if (!L || !CATS[L.pos] || !POOLS[L.mode]) return;
    const prev = net.lobby;
    net.lobby = { code: net.code, mode: L.mode, pos: L.pos, peek: !!L.peek, seed: L.seed >>> 0, round: L.round | 0 };
    if (!net.players.me || net.players.me.round !== net.lobby.round) {
      net.players.me = freshPlayer('guest', net.lobby.round);
      if (prev && prev.round !== net.lobby.round) { net.started = false; show('lobby'); msg('lobby-msg', 'Rematch! Starting…'); }
      sendProgress();
    }
    evaluate(); return;
  }
  if (d.type === 'progress' && d.p) {
    const p = d.p;
    net.players.opp = { role: p.role === 'host' ? 'host' : 'guest', round: p.round | 0, slots: Array.isArray(p.slots) ? p.slots.slice(0, 6) : [], done: !!p.done, avg: p.avg };
    evaluate(); return;
  }
  if (d.type === 'rematch' && net.role === 'host') { rematch(); return; }
}

// Every 2.5s: ping, and re-send our state until both phones are on the same round.
// Messages are idempotent, so repeats are harmless; this recovers anything a phone dropped.
function startHeartbeat() {
  clearInterval(net.beat);
  net.beat = setInterval(() => {
    if (!state.online) { clearInterval(net.beat); return; }
    if (net.conn && net.conn.open) {
      send({ type: 'ping' });
      const L = net.lobby, opp = net.players.opp, me = net.players.me;
      const synced = L && me && opp && me.round === L.round && opp.round === L.round;
      if (!net.started || !synced) { sendLobby(); sendProgress(); }
      else if (Date.now() - net.lastHeard > 4000) sendProgress();
      if (net.role === 'guest' && Date.now() - net.lastHeard > STALE_MS * 2) { try { net.conn.close(); } catch (e) {} }
    }
    if (!$('lobby').hidden) evaluate();
    renderOppBar();
  }, 2500);
}
function scheduleReconnect() {
  clearTimeout(net.retry);
  if (!state.online || net.role !== 'guest' || !net.code) return;
  if (net.retries >= 20) { msg('lobby-msg', `Couldn't reconnect to the host. Make sure ${net.oppName}'s game is open, then leave and rejoin with code ${net.code}.`, true); return; }
  net.retries++;
  net.retry = setTimeout(() => {
    if (!state.online || (net.conn && net.conn.open)) return;
    const go = () => {
      try {
        const c = net.peer.connect(PEER_PREFIX + net.code, { reliable: true });
        c.on('open', () => attachConn(c));
        setTimeout(() => { if (!c.open) scheduleReconnect(); }, 6000);
      } catch (e) { scheduleReconnect(); }
    };
    if (!net.peer || net.peer.destroyed) { net.peer = new Peer(); net.peer.on('open', go); net.peer.on('error', () => {}); }
    else if (net.peer.disconnected) { try { net.peer.reconnect(); } catch (e) {} setTimeout(go, 1500); }
    else go();
  }, net.retries === 1 ? 500 : 3000);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.online) return;
  if (net.conn && net.conn.open) { send({ type: 'hello', name: myName(), cid: net.cid }); sendLobby(); sendProgress(); }
  else if (net.role === 'guest') { net.retries = 0; scheduleReconnect(); }
});

function enterLobby() {
  state.online = true; net.started = false; net.verdictRound = 0;
  try { history.replaceState(null, '', '#' + net.code); } catch (e) {}
  $('lobby-code').textContent = net.code;
  $('h2h-code').textContent = 'Lobby ' + net.code;
  $('seats').innerHTML = ''; $('lobby-info').textContent = '';
  $('lobby-howto').hidden = net.role !== 'host';
  msg('lobby-msg', net.role === 'host' ? 'Waiting for an opponent…' : 'Connected. Getting the lobby settings…');
  show('lobby');
  evaluate();
}

function teardown() {
  clearInterval(net.beat); clearTimeout(net.retry);
  const c = net.conn; net.conn = null;
  try { if (c) c.close(); } catch (e) {}
  try { if (net.peer) net.peer.destroy(); } catch (e) {}
  net.conn = null; net.peer = null;
}

function leaveLobby() {
  teardown();
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
  const me = net.players.me, opp = net.players.opp;
  renderLobby(L, opp);
  const ready = me && opp && net.conn && me.round === L.round && opp.round === L.round;
  if (!net.started && ready) { net.started = true; startOnline(L, me); return; }
  if (net.started) { renderOppBar(); if (!$('result').hidden) renderH2H(); }
}

function renderLobby(L, opp) {
  $('lobby-info').textContent = `${L.mode === 'current' ? 'Current NHL' : 'Modern Era Stars'} · ${POSNAME[L.pos]} · grades hidden`;
  const seat = (role, name, filled) => `<div class="seat${filled ? '' : ' empty'}"><span class="r">${role}</span><span class="n">${esc(name)}</span></div>`;
  const meName = myName() + ' (you)';
  const hasOpp = !!(net.conn && (opp || net.oppName));
  const host = net.role === 'host' ? meName : net.oppName;
  const guest = net.role === 'host' ? (net.conn ? net.oppName : 'Waiting…') : meName;
  $('seats').innerHTML = seat('Host', host, true) + seat('Challenger', guest, net.role === 'guest' || !!net.conn);
  if (net.role === 'host') $('lobby-howto').hidden = !!net.conn;
  if (hasOpp && net.conn) {
    const me = net.players.me, synced = me && opp && me.round === L.round && opp.round === L.round;
    const quiet = Date.now() - net.lastHeard > STALE_MS;
    if (synced) msg('lobby-msg', 'Both players in. Starting…');
    else if (quiet) msg('lobby-msg', `Waiting for ${net.oppName}… Their game may be closed or in the background. Ask them to open Rink Roll.`, true);
    else msg('lobby-msg', L.round > 1 ? `Rematch! Waiting for ${net.oppName} to jump in…` : `Waiting for ${net.oppName}…`);
  }
}

function startOnline(L, me) {
  state.daily = null;
  state.mode = L.mode; state.pos = L.pos; state.peek = false; // head-to-head is always grades-hidden
  document.querySelectorAll('[data-mode]').forEach(x => x.setAttribute('aria-pressed', x.dataset.mode === state.mode));
  document.querySelectorAll('[data-pos]').forEach(x => x.setAttribute('aria-pressed', x.dataset.pos === state.pos));
  $('peek').checked = state.peek;
  state.online = true;
  const seat = (me && me.role === 'host') ? 0 : 104729; // host and challenger get different spins
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
  sendProgress();
}

function renderOppBar() {
  if (!state.online) return;
  const opp = net.players.opp;
  const n = state.slots.length;
  const f = opp && net.lobby && opp.round === net.lobby.round ? (opp.slots || []).filter(Boolean).length : 0;
  const pips = Array.from({ length: n }, (_, i) => `<span class="pip${i < f ? ' on' : ''}"></span>`).join('');
  const status = !net.conn ? 'reconnecting…' : Date.now() - net.lastHeard > STALE_MS ? 'not responding…' : f === n ? 'is done' : `${f} / ${n}`;
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
    v.textContent = net.conn ? `Waiting for ${oname} to finish (${f} / ${state.slots.length})…` : `${oname} disconnected.`;
    $('h2h-table').innerHTML = ''; $('rematch').disabled = true;
    return;
  }
  $('rematch').disabled = !net.conn;
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
  v.textContent = res === 'win' ? `You win · ${myWins}–${oppWins} in categories` : res === 'loss' ? `${oname} wins · ${oppWins}–${myWins} in categories` : 'Dead even';
  if (net.verdictRound !== L.round) { net.verdictRound = L.round; fanfare(res !== 'loss'); }
}

function rematch() {
  if (!net.lobby || !net.conn) return;
  $('rematch').disabled = true;
  if (net.role === 'guest') {
    send({ type: 'rematch' });
    msg('lobby-msg', 'Rematch requested. Waiting for the host…');
    show('lobby'); return;
  }
  net.lobby = { ...net.lobby, round: net.lobby.round + 1, seed: newSeed() };
  net.players.me = freshPlayer('host', net.lobby.round);
  net.started = false;
  msg('lobby-msg', 'Rematch! Starting…');
  show('lobby');
  sendLobby(); sendProgress();
  evaluate();
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
window.addEventListener('beforeunload', teardown);

(function initFromLink() {
  const h = (location.hash || '').slice(1).toUpperCase();
  if (CODE_RE.test(h)) { setPlay('online'); $('join-code').value = h; msg('online-msg', `You've been invited to lobby ${h}. Enter your name and press Join.`); }
})();
