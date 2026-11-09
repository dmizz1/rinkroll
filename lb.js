/* ---------- daily leaderboard (public site only) ---------- */
const LB_ON = __LB__ && !!siteUrl();
function deviceId() {
  try {
    let d = localStorage.getItem('rinkroll-device');
    if (!d) { d = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('rinkroll-device', d); }
    return d;
  } catch (e) { return 'd' + Math.random().toString(36).slice(2) + 'tmp'; }
}
async function lbGet(day) {
  const r = await fetch('/api/leaderboard?day=' + encodeURIComponent(day), { cache: 'no-store' });
  if (!r.ok) throw new Error('load');
  return r.json();
}
function lbRowsHtml(entries, limit, highlightT) {
  if (!entries.length) return '<p class="note">No builds posted yet today. Be the first.</p>';
  return '<ol class="lb-list">' + entries.slice(0, limit).map((e, i) => {
    const ovr = SCALE[Math.max(0, Math.min(13, Math.round(e.avg)))];
    const chips = e.grades.map(g => `<span class="gr" data-t="${tier(g)}">${esc(g)}</span>`).join('');
    return `<li class="${e.t === highlightT ? 'me' : ''}"><span class="lb-rank">${i + 1}</span><span class="lb-main"><span class="lb-name">${e.handle ? `<a href="#u=${esc(e.handle)}">${esc(e.name)}</a>` : esc(e.name)}${e.sc && typeof miniBadges === 'function' ? miniBadges(e.sc) : ''}</span><span class="lb-chips">${chips}</span><span class="lb-players">${e.players.map(esc).join(' · ')}</span></span><span class="gr" data-t="${tier(ovr)}">${ovr}</span></li>`;
  }).join('') + '</ol>';
}
function lbMine(day) { try { return JSON.parse(localStorage.getItem('rinkroll-lb-' + day) || 'null'); } catch (e) { return null; } }

async function showDailyLeaderboard() {
  const box = $('lboard');
  if (!LB_ON || !state.daily) { box.hidden = true; return; }
  box.hidden = false;
  const day = state.daily.key, mine = lbMine(day);
  try { const n = localStorage.getItem('rinkroll-name'); if (n && !$('lb-name').value) $('lb-name').value = n; } catch (e) {}
  $('lb-form').hidden = !!mine;
  $('lb-msg').textContent = mine ? `You're #${mine.rank} of ${mine.total} today.` : '';
  $('lb-list').innerHTML = '<p class="note">Loading today\'s leaderboard…</p>';
  try {
    const data = await lbGet(day);
    $('lb-list').innerHTML = lbRowsHtml(data.entries, 50, mine && mine.t);
    $('lb-count').textContent = `${data.total} ${data.total === 1 ? 'build' : 'builds'}`;
  } catch (e) { $('lb-list').innerHTML = '<p class="note">Couldn\'t load the leaderboard. Check your connection and try again.</p>'; }
}

async function submitDaily(ev) {
  ev.preventDefault();
  if (!state.daily) return;
  const name = $('lb-name').value.trim();
  if (name.length < 2) { $('lb-msg').textContent = 'Enter a name with at least 2 characters.'; return; }
  try { localStorage.setItem('rinkroll-name', name.slice(0, 16)); } catch (e) {}
  $('lb-submit').disabled = true; $('lb-msg').textContent = 'Posting…';
  const body = { day: state.daily.key, pos: state.pos, name, device: deviceId(), grades: state.slots.map(s => s.grade), players: state.slots.map(s => s.player.name) };
  try {
    const r = await fetch('/api/leaderboard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) { $('lb-msg').textContent = data.error || 'Couldn\'t post your build. Try again.'; $('lb-submit').disabled = false; return; }
    const list = await lbGet(state.daily.key).catch(() => null);
    const meT = list && list.entries.find(e => e.name === name.slice(0, 16) && e.grades.join() === body.grades.join());
    try { localStorage.setItem('rinkroll-lb-' + state.daily.key, JSON.stringify({ rank: data.rank, total: data.total, t: meT ? meT.t : null })); } catch (e) {}
    $('lb-form').hidden = true;
    $('lb-msg').textContent = data.already ? `You already posted today. You're #${data.rank} of ${data.total}.` : `Posted! You're #${data.rank} of ${data.total} today.`;
    if (list) { $('lb-list').innerHTML = lbRowsHtml(list.entries, 50, meT && meT.t); $('lb-count').textContent = `${list.total} builds`; }
    pop();
  } catch (e) { $('lb-msg').textContent = 'Couldn\'t reach the leaderboard. Check your connection and try again.'; }
  $('lb-submit').disabled = false;
}
$('lb-form').addEventListener('submit', submitDaily);

async function loadDailyPreview() {
  const el = $('lb-preview'); if (!el) return;
  if (!LB_ON) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = '<p class="note">Loading today\'s top builds…</p>';
  try {
    const data = await lbGet(dailyInfo().key);
    if (!dailyDone()) {
      // no spoilers: other people's builds stay hidden until you've finished today's Daily
      const n = data.total;
      el.innerHTML = `<h3 class="lb-h">Today's leaderboard <small>${n} ${n === 1 ? 'build' : 'builds'} posted</small></h3>`
        + `<p class="note lb-locked">${n ? 'Finish today\'s Daily to see everyone\'s builds and where you rank.' : 'No builds posted yet. Finish today\'s Daily and be the first.'}</p>`;
      return;
    }
    el.innerHTML = `<h3 class="lb-h">Today's top builds <small>${data.total} posted</small></h3>` + lbRowsHtml(data.entries, 5, null);
  } catch (e) { el.innerHTML = ''; el.hidden = true; }
}
