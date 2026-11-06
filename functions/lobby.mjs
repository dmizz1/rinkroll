// Head-to-head lobbies for Rink Roll, stored in Netlify Blobs (store "lobbies").
// Both players talk to this API instead of to each other, so it works on any network.
//   GET  /api/lobby?code=ABCDE&cid=...            → { lobby, you, me, opp }
//   POST /api/lobby  { action: 'create', cid, name, mode, pos }
//   POST /api/lobby  { action: 'join',   cid, name, code }
//   POST /api/lobby  { action: 'progress', cid, code, p: { round, slots, seqIdx, rerolls, done, avg } }
//   POST /api/lobby  { action: 'rematch', cid, code, fromRound }
// Keys: l/<code>/meta (settings + who holds each seat), l/<code>/host and l/<code>/guest (each written only by that player).
import { getStore } from '@netlify/blobs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const SCALE = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const clean = (s, max) => String(s || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const cidOk = c => typeof c === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(c);
const newCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const fresh = (round, name) => ({ round, slots: [], seqIdx: 0, rerolls: 1, done: false, avg: null, name, t: Date.now() });

function cleanSlots(slots) {
  if (!Array.isArray(slots)) return [];
  return slots.slice(0, 7).map(s => s && typeof s === 'object' ? {
    name: clean(s.name, 40), team: clean(s.team, 4), pos: clean(s.pos, 3), grade: SCALE.includes(s.grade) ? s.grade : 'F'
  } : null);
}
const publicPlayer = p => p && { name: p.name, round: p.round, slots: p.slots, seqIdx: p.seqIdx, rerolls: p.rerolls, done: p.done, avg: p.avg, t: p.t };

export default async (req) => {
  const store = getStore({ name: 'lobbies', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const code = (url.searchParams.get('code') || '').toUpperCase(), cid = url.searchParams.get('cid') || '';
    if (!CODE_RE.test(code)) return json({ error: 'Lobby codes are 5 letters and numbers.' }, 400);
    const L = await store.get(`l/${code}/meta`, { type: 'json' });
    if (!L) return json({ error: 'No lobby found with that code.' }, 404);
    const you = cid && cid === L.hostCid ? 'host' : cid && cid === L.guestCid ? 'guest' : null;
    if (!you) return json({ error: 'You\'re not in this lobby.' }, 403);
    const [host, guest] = await Promise.all([store.get(`l/${code}/host`, { type: 'json' }), store.get(`l/${code}/guest`, { type: 'json' })]);
    const me = you === 'host' ? host : guest, opp = you === 'host' ? guest : host;
    return json({ lobby: { code, mode: L.mode, pos: L.pos, seed: L.seed, round: L.round, hasGuest: !!L.guestCid }, you, me: publicPlayer(me), opp: publicPlayer(opp), now: Date.now() });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let b; try { b = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const cid = b.cid;
  if (!cidOk(cid)) return json({ error: 'Invalid request.' }, 400);

  if (b.action === 'create') {
    const mode = b.mode === 'alltime' ? 'alltime' : 'current', pos = ['F', 'D', 'G'].includes(b.pos) ? b.pos : 'F';
    const name = clean(b.name, 16) || 'Player';
    for (let i = 0; i < 6; i++) {
      const code = newCode();
      const L = { code, mode, pos, seed: Math.floor(Math.random() * 2 ** 31), round: 1, hostCid: cid, guestCid: null, created: Date.now() };
      const r = await store.setJSON(`l/${code}/meta`, L, { onlyIfNew: true });
      if (r && r.modified === false) continue;
      await store.setJSON(`l/${code}/host`, fresh(1, name));
      return json({ ok: true, code, you: 'host' });
    }
    return json({ error: 'Couldn\'t make a lobby. Try again.' }, 503);
  }

  const code = String(b.code || '').toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: 'Lobby codes are 5 letters and numbers, like K7QMX.' }, 400);
  const L = await store.get(`l/${code}/meta`, { type: 'json' });
  if (!L) return json({ error: `No lobby found with code ${code}. Check the code with your friend.` }, 404);

  if (b.action === 'join') {
    const name = clean(b.name, 16) || 'Player';
    if (cid === L.hostCid) return json({ ok: true, code, you: 'host' });
    if (cid === L.guestCid) return json({ ok: true, code, you: 'guest' });
    if (L.guestCid) return json({ error: `Lobby ${code} already has two players.` }, 409);
    // claim the challenger seat: first one in wins, even if two people join at once
    const claim = await store.setJSON(`l/${code}/claim`, { cid, t: Date.now() }, { onlyIfNew: true });
    if (claim && claim.modified === false) {
      const who = await store.get(`l/${code}/claim`, { type: 'json' });
      if (!who || who.cid !== cid) return json({ error: `Lobby ${code} already has two players.` }, 409);
    }
    await store.setJSON(`l/${code}/meta`, { ...L, guestCid: cid });
    await store.setJSON(`l/${code}/guest`, fresh(L.round, name));
    return json({ ok: true, code, you: 'guest' });
  }

  const you = cid === L.hostCid ? 'host' : cid === L.guestCid ? 'guest' : null;
  if (!you) return json({ error: 'You\'re not in this lobby.' }, 403);

  if (b.action === 'progress') {
    const p = b.p || {};
    const cur = (await store.get(`l/${code}/${you}`, { type: 'json' })) || fresh(L.round, 'Player');
    const doc = {
      name: clean(b.name, 16) || cur.name, round: Math.max(1, Math.min(9999, p.round | 0)), slots: cleanSlots(p.slots),
      seqIdx: Math.max(0, p.seqIdx | 0), rerolls: Math.max(0, Math.min(1, p.rerolls | 0)), done: !!p.done,
      avg: typeof p.avg === 'number' && isFinite(p.avg) ? p.avg : null, t: Date.now()
    };
    await store.setJSON(`l/${code}/${you}`, doc);
    return json({ ok: true });
  }

  if (b.action === 'rematch') {
    const from = b.fromRound | 0;
    if (L.round !== from) return json({ ok: true, round: L.round }); // someone already started the next round
    await store.setJSON(`l/${code}/meta`, { ...L, round: from + 1, seed: Math.floor(Math.random() * 2 ** 31) });
    return json({ ok: true, round: from + 1 });
  }

  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/lobby' };
