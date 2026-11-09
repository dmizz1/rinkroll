// Global ranking and public profiles.
//   GET /api/rank                → { rows: top 50 by average Daily grade (10+ Dailies), me: your spot, min }
//   GET /api/rank?profile=handle → { profile } (public stats, badges, recent builds; never the email)
import { store, json, currentUser, publicView, SCALE } from '../lib/account.mjs';

const MIN = 10, FRESH = 5 * 60000;

async function table(S) {
  const cached = await S.get('rank/sum', { type: 'json' });
  if (cached && Date.now() - cached.t < FRESH) return cached.rows;
  const { blobs } = await S.list({ prefix: 'rk/' });
  const rows = (await Promise.all(blobs.map(b => S.get(b.key, { type: 'json' }).then(v => v && { uid: b.key.slice(3), ...v }).catch(() => null))))
    .filter(r => r && r.n >= MIN)
    .map(r => ({ uid: r.uid, name: r.name, handle: r.handle, n: r.n, avg: r.sum / r.n, sc: r.sc || [] }))
    .sort((a, b) => b.avg - a.avg || b.n - a.n);
  try { await S.setJSON('rank/sum', { t: Date.now(), rows }); } catch {}
  return rows;
}
const out = (r, i) => ({ rank: i + 1, name: r.name, handle: r.handle, n: r.n, avg: Math.round(r.avg * 100) / 100, grade: SCALE[Math.round(r.avg)], sc: r.sc });

export default async (req) => {
  const S = store(), url = new URL(req.url);
  const h = (url.searchParams.get('profile') || '').toLowerCase();
  if (h) {
    if (!/^[a-z0-9]{1,24}$/.test(h)) return json({ error: 'No player found.' }, 404);
    const m = await S.get(`h/${h}`, { type: 'json' });
    const u = m && m.uid ? await S.get(`u/${m.uid}`, { type: 'json' }) : null;
    if (!u) return json({ error: 'No player found.' }, 404);
    const rows = await table(S), i = rows.findIndex(r => r.uid === u.uid);
    return json({ profile: { ...publicView(u, false), rank: i >= 0 ? i + 1 : null } });
  }
  const rows = await table(S), u = await currentUser(req, S);
  const i = u ? rows.findIndex(r => r.uid === u.uid) : -1;
  return json({ min: MIN, total: rows.length, rows: rows.slice(0, 50).map(out), me: i >= 0 ? out(rows[i], i) : null });
};

export const config = { path: '/api/rank' };
