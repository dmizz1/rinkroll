// Daily leaderboard API for Rink Roll.
//   GET  /api/leaderboard?day=YYYY-MM-DD        → { day, total, entries: [...] } (top 100)
//   POST /api/leaderboard  { day, pos, name, grades[], players[], device }
// Storage (Netlify Blobs, store "leaderboard"):
//   e/<day>/<device>   one document per submission, written only if new, so no entry is ever lost
//   s/<day>            a cached summary of all entries for the day, rebuilt from the entries as they arrive
import { getStore } from '@netlify/blobs';

const SCALE = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const SLOTS = { F: 6, D: 5, G: 5 };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
});
const clean = (s, max) => String(s || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const safeKey = s => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
const rank = list => list.sort((a, b) => b.avg - a.avg || a.t - b.t);
const publicEntry = e => ({ name: e.name, pos: e.pos, grades: e.grades, players: e.players, avg: e.avg, t: e.t });

function dayIsCurrent(day) {
  const d = Date.parse(day + 'T12:00:00Z'); if (isNaN(d)) return false;
  return Math.abs(Date.now() - d) <= 40 * 3600 * 1000; // "today" somewhere in the world
}

// Read every entry for a day, using the cached summary and fetching only new ones.
async function loadDay(store, day) {
  const summary = (await store.get(`s/${day}`, { type: 'json' })) || { entries: {} };
  const known = summary.entries || {};
  const keys = [];
  const { blobs } = await store.list({ prefix: `e/${day}/` });
  blobs.forEach(b => keys.push(b.key));
  const missing = keys.filter(k => !known[k]);
  if (missing.length) {
    const got = await Promise.all(missing.map(k => store.get(k, { type: 'json' }).then(v => [k, v]).catch(() => [k, null])));
    got.forEach(([k, v]) => { if (v) known[k] = publicEntry(v); });
    try { await store.setJSON(`s/${day}`, { entries: known, updated: Date.now() }); } catch {}
  }
  return Object.values(known);
}

export default async (req) => {
  const store = getStore({ name: 'leaderboard', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const day = url.searchParams.get('day') || '';
    if (!DAY_RE.test(day)) return json({ error: 'Pick a day as YYYY-MM-DD.' }, 400);
    const all = rank(await loadDay(store, day));
    return json({ day, total: all.length, entries: all.slice(0, 100) });
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const day = String(body.day || '');
  const pos = String(body.pos || '');
  const name = clean(body.name, 16);
  const device = safeKey(String(body.device || ''));
  const grades = Array.isArray(body.grades) ? body.grades.map(String) : [];
  const players = Array.isArray(body.players) ? body.players.map(p => clean(p, 40)) : [];
  if (!DAY_RE.test(day) || !dayIsCurrent(day)) return json({ error: 'You can only post to today\'s leaderboard.' }, 400);
  if (!SLOTS[pos] || grades.length !== SLOTS[pos] || players.length !== SLOTS[pos]) return json({ error: 'That build doesn\'t look complete.' }, 400);
  if (!grades.every(g => SCALE.includes(g)) || players.some(p => !p)) return json({ error: 'That build doesn\'t look right.' }, 400);
  if (name.length < 2) return json({ error: 'Enter a name with at least 2 characters.' }, 400);
  if (device.length < 8) return json({ error: 'Invalid request.' }, 400);

  const avg = Math.round(grades.reduce((a, g) => a + SCALE.indexOf(g), 0) / grades.length * 1000) / 1000;
  const entry = { name, pos, grades, players, avg, t: Date.now() };
  const key = `e/${day}/${device}`;
  const res = await store.setJSON(key, entry, { onlyIfNew: true });
  const already = res && res.modified === false;

  const all = await loadDay(store, day);
  if (!all.some(e => e.t === entry.t && e.name === entry.name) && !already) all.push(publicEntry(entry));
  const ranked = rank(all);
  const mineT = already ? ((await store.get(key, { type: 'json' })) || entry).t : entry.t;
  const pos1 = ranked.findIndex(e => e.t === mineT) + 1;
  return json({ ok: true, already, rank: pos1 || null, total: ranked.length });
};

export const config = { path: '/api/leaderboard' };
