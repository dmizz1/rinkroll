// The signed-in player's account.
//   GET  /api/me                          → { user: null } or { user: {...stats, badges, history...} }
//   POST /api/me { action: 'build', build }      a finished Solo / Daily build
//                { action: 'line', line }        a finished Line Builder season
//                { action: 'h2h', code, round }  a finished head-to-head round (result read from the lobby itself)
//                { action: 'import', dailies }   past Dailies saved on this device (once)
//                { action: 'showcase', ids }  { action: 'rename', name }  { action: 'set-password', password }
//                { action: 'delete', confirm: 'DELETE' }
import { getStore } from '@netlify/blobs';
import {
  store, json, clean, sameOrigin, currentUser, hashPassword, passwordOk, cleanBuild, addBuild, addLine, addH2H, BADGES,
  publicView, saveRankRow, deleteAccount, endSession, etToday, SCALE
} from '../lib/account.mjs';

const gv = g => Math.max(0, SCALE.indexOf(g));

// Top of the Board: look back at finished Dailies this player posted to and see if they ended #1
async function checkTopBoard(u) {
  const today = etToday();
  const todo = (u.daily.days || []).filter(d => d < today && !(u.daily.lbChecked || []).includes(d)).slice(-5);
  if (!todo.length) return false;
  const lb = getStore({ name: 'leaderboard', consistency: 'strong' });
  for (const d of todo) {
    const s = await lb.get(`s/${d}`, { type: 'json' }).catch(() => null);
    const list = s ? Object.values(s.entries || {}).sort((a, b) => b.avg - a.avg || a.t - b.t) : [];
    if (list[0] && list[0].uid === u.uid) u.badges['top-board'] = (u.badges['top-board'] || 0) + 1;
    u.daily.lbChecked = [...(u.daily.lbChecked || []), d].slice(-60);
  }
  return true;
}

export default async (req) => {
  const S = store();
  const u = await currentUser(req, S);
  if (req.method === 'GET') {
    if (!u) return json({ user: null });
    if (await checkTopBoard(u)) { await S.setJSON(`u/${u.uid}`, u); await saveRankRow(S, u); }
    return json({ user: publicView(u, true), catalog: BADGES });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  if (!u) return json({ error: 'Sign in first.' }, 401);
  let b; try { b = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const save = async (extra = {}) => { await S.setJSON(`u/${u.uid}`, u); await saveRankRow(S, u); return json({ ok: true, ...extra }); };

  if (b.action === 'build') {
    const build = cleanBuild(b.build || {});
    if (!build) return json({ error: 'That build doesn\'t look complete.' }, 400);
    if (build.play === 'h2h') return json({ error: 'Head-to-head builds are saved with the result.' }, 400);
    if (build.play === 'daily' && u.daily.days.includes(build.day)) return json({ ok: true, earned: [], already: true });
    return save({ earned: addBuild(u, build, etToday()) });
  }

  if (b.action === 'line') return save({ earned: addLine(u, b.line || {}) });

  if (b.action === 'h2h') {
    const code = String(b.code || '').toUpperCase(), round = b.round | 0;
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code) || round < 1) return json({ error: 'Invalid request.' }, 400);
    const LS = getStore({ name: 'lobbies', consistency: 'strong' });
    const L = await LS.get(`l/${code}/meta`, { type: 'json' });
    if (!L) return json({ error: 'No lobby found.' }, 404);
    const seat = L.hostUid === u.uid ? 'host' : L.guestUid === u.uid ? 'guest' : null;
    const oppUid = seat === 'host' ? L.guestUid : L.hostUid;
    if (!seat || !oppUid) return json({ ok: true, counted: false, why: 'both' }); // records count when both players are signed in
    const [me, opp] = await Promise.all([LS.get(`l/${code}/${seat}`, { type: 'json' }), LS.get(`l/${code}/${seat === 'host' ? 'guest' : 'host'}`, { type: 'json' })]);
    if (!me || !opp || !me.done || !opp.done || me.round !== round || opp.round !== round) return json({ ok: true, counted: false, why: 'unfinished' });
    const once = await S.setJSON(`hx/${code}/${round}/${u.uid}`, { t: Date.now() }, { onlyIfNew: true });
    if (once && once.modified === false) return json({ ok: true, counted: false, why: 'already' });
    // same rule as the page: higher overall average wins, then more categories won
    const a = me.slots.map(s => gv(s && s.grade)), o = opp.slots.map(s => gv(s && s.grade));
    const avgA = a.reduce((x, y) => x + y, 0) / a.length, avgO = o.reduce((x, y) => x + y, 0) / o.length;
    let wins = 0, losses = 0; a.forEach((v, i) => { if (v > (o[i] ?? 0)) wins++; else if (v < (o[i] ?? 0)) losses++; });
    const res = Math.abs(avgA - avgO) > 1e-9 ? (avgA > avgO ? 'win' : 'loss') : wins > losses ? 'win' : losses > wins ? 'loss' : 'tie';
    const first3Lost = a.length >= 3 && [0, 1, 2].every(i => a[i] < (o[i] ?? 0));
    const earned = addH2H(u, { res, first3Lost, oppUid, oppName: opp.name, mine: { ovr: SCALE[Math.round(avgA)], grades: me.slots.map(s => s && s.grade) } });
    // the head-to-head build itself also counts toward build stats and grade badges
    // grades come from the lobby record; the page only adds each player's full grade list (for Perfect Pick / Optimal)
    const extra = Array.isArray(b.slots) ? b.slots : [];
    const build = cleanBuild({ mode: L.mode, pos: L.pos, play: 'h2h', slots: me.slots.map((s, i) => ({ name: s && s.name, grade: s && s.grade, grades: extra[i] && s && extra[i].name === s.name ? extra[i].grades : null })) });
    if (build) earned.push(...addBuild(u, build, etToday()));
    return save({ counted: true, res, earned });
  }

  if (b.action === 'import') {
    if (u.imported) return json({ ok: true, imported: 0 });
    const list = (Array.isArray(b.dailies) ? b.dailies : []).slice(0, 120)
      .map(d => ({ ...cleanBuild({ mode: 'current', pos: d.pos, play: 'daily', day: d.day, slots: (d.slots || []).map(s => ({ name: s && s.name, grade: s && s.grade })) }) }))
      .filter(d => d && d.day && d.slots).sort((x, y) => x.day < y.day ? -1 : 1);
    const seen = new Set(u.daily.days); let n = 0;
    for (const d of list) { if (seen.has(d.day) || d.day > etToday()) continue; seen.add(d.day); addBuild(u, d, d.day); n++; }
    u.imported = true;
    return save({ imported: n });
  }

  if (b.action === 'showcase') {
    u.showcase = (Array.isArray(b.ids) ? b.ids : []).filter(k => BADGES[k] && u.badges[k]).slice(0, 3);
    return save();
  }
  if (b.action === 'rename') {
    const name = clean(b.name, 16);
    if (name.length < 2) return json({ error: 'Use at least 2 characters.' }, 400);
    u.name = name; return save();
  }
  if (b.action === 'set-password') {
    if (!passwordOk(b.password)) return json({ error: 'Use a password with at least 8 characters.' }, 400);
    u.pw = await hashPassword(b.password); return save();
  }
  if (b.action === 'delete') {
    if (b.confirm !== 'DELETE') return json({ error: 'Type DELETE to confirm.' }, 400);
    await deleteAccount(S, u);
    return json({ ok: true }, 200, { 'set-cookie': await endSession(req, S) });
  }
  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/me' };
