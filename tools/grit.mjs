// Grit grades for current NHL skaters (not used in the game yet).
// Writes data_grit.txt: name|team|pos|grit|netfront|tips|screens|battles|physicality  (letter grades, F to S)
// Run with Node 20+:  node tools/grit.mjs
//
// Components (last full season + this season, per game, graded within forwards and within defensemen):
//   Net-front presence  shots from the crease, net sides and low slot (volume and share of a player's shots)   [NHL EDGE]
//   Tips                tip-in + deflected shots on goal and goals                                             [NHL stats]
//   Screens (proxy)     crease shots, power-play goals and tip attempts: what a net-front screener produces   [EDGE + stats]
//   Puck battles (proxy) takeaways per 60, takeaways minus giveaways, shots from the corners / behind the net  [stats + EDGE]
//   Offensive physicality  hits per 60, penalty minutes per game, weight                                      [stats + roster]
// Screens and puck battles are not tracked publicly, so those two use the closest public signals.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'https://api-web.nhle.com/v1', REST = 'https://api.nhle.com/stats/rest/en/skater';
const now = new Date();
const startYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const sid = y => Number(`${y}${y + 1}`);
const SEASONS = [sid(startYear - 1), sid(startYear)];
const W = { netfront: 0.25, tips: 0.20, screens: 0.15, battles: 0.20, physicality: 0.20 };
const CUT = [[.98, 'S'], [.94, 'A+'], [.89, 'A'], [.83, 'A-'], [.76, 'B+'], [.68, 'B'], [.60, 'B-'], [.51, 'C+'], [.42, 'C'], [.33, 'C-'], [.24, 'D+'], [.16, 'D'], [.08, 'D-'], [0, 'F']];

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url, { headers: { 'user-agent': 'rinkroll-grit' } }); if (r.status === 404) return null; if (r.ok) return await r.json(); } catch (e) {}
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}
async function pool(items, n, fn) { let i = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }
const rest = async (report, season) => {
  const d = await getJSON(`${REST}/${report}?limit=-1&cayenneExp=seasonId=${season}%20and%20gameTypeId=2`);
  if (!d || !Array.isArray(d.data)) throw new Error(`Couldn't load ${report} for ${season}`);
  return d.data;
};

// 1. rosters
const st = await getJSON(`${WEB}/standings/now`);
const teams = st.standings.map(t => t.teamAbbrev.default);
const players = [];
await pool(teams, 8, async t => {
  const r = await getJSON(`${WEB}/roster/${t}/current`); if (!r) return;
  for (const g of ['forwards', 'defensemen']) for (const p of r[g] || []) players.push({ id: p.id, name: `${p.firstName.default} ${p.lastName.default}`, team: t, pos: p.positionCode, wgt: p.weightInPounds });
});
if (players.length < 500) throw new Error('Roster pull looks incomplete.');
const byId = new Map(players.map(p => [p.id, p]));
players.forEach(p => Object.assign(p, { gp: 0, toi: 0, hits: 0, take: 0, give: 0, pim: 0, ppg: 0, tipS: 0, tipG: 0, inner: 0, crease: 0, shotsEdge: 0, deep: 0 }));

// 2. league reports (one call per report per season)
for (const season of SEASONS) {
  const [rt, sh, sm] = await Promise.all([rest('realtime', season), rest('shottype', season), rest('summary', season)]);
  for (const r of rt) { const p = byId.get(r.playerId); if (!p) continue; p.gp += r.gamesPlayed || 0; p.toi += (r.timeOnIcePerGame || 0) * (r.gamesPlayed || 0); p.hits += r.hits || 0; p.take += r.takeaways || 0; p.give += r.giveaways || 0; }
  for (const r of sh) { const p = byId.get(r.playerId); if (!p) continue; p.tipS += (r.shotsOnNetTipIn || 0) + (r.shotsOnNetDeflected || 0); p.tipG += (r.goalsTipIn || 0) + (r.goalsDeflected || 0); }
  for (const r of sm) { const p = byId.get(r.playerId); if (!p) continue; p.pim += r.penaltyMinutes || 0; p.ppg += r.ppGoals || 0; }
}
// 3. shot locations (NHL EDGE), per player per season
const INNER = new Set(['Crease', 'L Net Side', 'R Net Side', 'Low Slot']), DEEP = new Set(['L Corner', 'R Corner', 'Behind the Net']);
await pool(players, 12, async p => {
  for (const season of SEASONS) {
    const e = await getJSON(`${WEB}/edge/skater-detail/${p.id}/${season}/2`);
    for (const a of (e && e.sogDetails) || []) {
      const n = a.shots || 0; p.shotsEdge += n;
      if (INNER.has(a.area)) p.inner += n;
      if (a.area === 'Crease') p.crease += n;
      if (DEEP.has(a.area)) p.deep += n;
    }
  }
});

// 4. grade within forwards and within defensemen
const pctRank = (arr, f) => { const v = arr.map(f).filter(x => x != null && isFinite(x)).sort((a, b) => a - b); return x => { if (x == null || !isFinite(x) || !v.length) return 0.5; let lo = 0, hi = v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; } let h2 = lo; while (h2 < v.length && v[h2] === x) h2++; return ((lo + h2) / 2) / v.length; }; };
const shrink = (x, n, k = 25) => 0.5 + (x - 0.5) * (n / (n + k));
const grade = q => CUT.find(([t]) => q >= t)[1];
const lines = [];
for (const G of ['F', 'D']) {
  const P = players.filter(p => (p.pos === 'D') === (G === 'D') && p.gp > 0);
  P.forEach(p => {
    const g = p.gp, mins = p.toi / 60 || 1;
    Object.assign(p, {
      innerPG: p.inner / g, innerShare: p.shotsEdge >= 10 ? p.inner / p.shotsEdge : null, creasePG: p.crease / g,
      tipSPG: p.tipS / g, tipGPG: p.tipG / g, ppgPG: p.ppg / g,
      take60: p.take / mins * 60, tgDiff: (p.take - p.give) / g, deepPG: p.deep / g,
      hits60: p.hits / mins * 60, pimPG: p.pim / g
    });
  });
  const Q = P.filter(p => p.gp >= 20);
  const R = {}; ['innerPG', 'innerShare', 'creasePG', 'tipSPG', 'tipGPG', 'ppgPG', 'take60', 'tgDiff', 'deepPG', 'hits60', 'pimPG', 'wgt'].forEach(k => R[k] = pctRank(Q, p => p[k]));
  P.forEach(p => {
    const s = k => shrink(R[k](p[k]), p.gp);
    p.c = {
      netfront: 0.6 * s('innerPG') + 0.4 * s('innerShare'),
      tips: 0.6 * s('tipSPG') + 0.4 * s('tipGPG'),
      screens: 0.5 * s('creasePG') + 0.25 * s('ppgPG') + 0.25 * s('tipSPG'),
      battles: 0.5 * s('take60') + 0.2 * s('tgDiff') + 0.3 * s('deepPG'),
      physicality: 0.5 * s('hits60') + 0.2 * s('pimPG') + 0.3 * R.wgt(p.wgt)
    };
    p.c.grit = Object.entries(W).reduce((a, [k, w]) => a + w * p.c[k], 0);
  });
  const g = {}; for (const k of ['grit', ...Object.keys(W)]) g[k] = pctRank(P, p => p.c[k]);
  for (const p of P) lines.push([p.name, p.team, p.pos, ...['grit', ...Object.keys(W)].map(k => grade(g[k](p.c[k])))].join('|'));
}
writeFileSync(join(ROOT, 'data_grit.txt'), lines.join('\n') + '\n');
console.log(`Wrote grit grades for ${lines.length} skaters (seasons ${SEASONS.join(', ')}).`);
