// Rink Roll monthly stats update.
// Pulls current NHL rosters, season stats and NHL EDGE tracking, grades every
// player against his position, and writes data_current.txt + data_meta.json.
// Run with Node 20+:  node tools/update-stats.mjs
// It refuses to overwrite the data if the pull looks incomplete.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api-web.nhle.com/v1';
const MIN_PLAYERS = 600;          // sanity floor for a full league pull
const CONCURRENCY = 12;

// ---------- seasons ----------
const now = new Date();
const startYear = now.getUTCMonth() >= 8 ? now.getUTCFullYear() : now.getUTCFullYear() - 1; // season starts ~October
const sid = y => Number(`${y}${y + 1}`);
const CURRENT = sid(startYear), LAST_FULL = sid(startYear - 1);
const SEASONS = [sid(startYear - 2), LAST_FULL, CURRENT];

// ---------- fetch helpers ----------
async function getJSON(path, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(API + path, { headers: { 'user-agent': 'rinkroll-stats-updater' } });
      if (r.status === 404) return null;
      if (r.ok) return await r.json();
    } catch (e) { /* retry */ }
    await new Promise(res => setTimeout(res, 800 * (i + 1)));
  }
  return null;
}
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }));
  return out;
}
const toSec = s => { if (!s) return 0; const [m, x] = s.split(':').map(Number); return m * 60 + x; };

// ---------- 1. rosters ----------
const standings = await getJSON('/standings/now');
if (!standings || !standings.standings) throw new Error('Could not load standings');
const teams = standings.standings.map(t => t.teamAbbrev.default);
const rosters = await pool(teams, 8, t => getJSON(`/roster/${t}/current`));
const players = [];
teams.forEach((t, i) => {
  const r = rosters[i]; if (!r) return;
  for (const g of ['forwards', 'defensemen', 'goalies']) for (const p of (r[g] || [])) players.push({
    id: p.id, name: `${p.firstName.default} ${p.lastName.default}`, team: t, pos: p.positionCode,
    h: p.heightInInches, wgt: p.weightInPounds, bd: p.birthDate, num: p.sweaterNumber ?? ''
  });
});
console.log(`Rosters: ${teams.length} teams, ${players.length} players`);
if (teams.length < 30 || players.length < MIN_PLAYERS) throw new Error('Roster pull looks incomplete; leaving data unchanged.');

// ---------- 2. stats + tracking ----------
let missing = 0;
await pool(players, CONCURRENCY, async p => {
  const isG = p.pos === 'G';
  const l = await getJSON(`/player/${p.id}/landing`);
  let e = await getJSON(`/edge/${isG ? 'goalie' : 'skater'}-detail/${p.id}/${LAST_FULL}/2`);
  if (!e || (!e.skatingSpeed && !e.shotLocationSummary)) e = await getJSON(`/edge/${isG ? 'goalie' : 'skater'}-detail/${p.id}/now`);
  if (!l) { missing++; return; }
  const st = (l.seasonTotals || []).filter(s => s.leagueAbbrev === 'NHL' && s.gameTypeId === 2 && SEASONS.includes(s.season));
  const sum = k => st.reduce((a, s) => a + (s[k] || 0), 0);
  p.gp = sum('gamesPlayed');
  const ct = (l.careerTotals && l.careerTotals.regularSeason) || {};
  p.cgp = ct.gamesPlayed || 0;
  if (isG) { p.sa = sum('shotsAgainst'); p.ga = sum('goalsAgainst'); p.csv = ct.savePctg; p.cw = ct.wins || 0; }
  else {
    p.g = sum('goals'); p.a = sum('assists'); p.pm = sum('plusMinus'); p.pim = sum('pim'); p.sh = sum('shots'); p.ppp = sum('powerPlayPoints');
    const toi = st.reduce((a, s) => a + toSec(s.avgToi) * (s.gamesPlayed || 0), 0); p.toi = p.gp ? Math.round(toi / p.gp) : 0;
    p.cg = ct.goals || 0; p.ca = ct.assists || 0;
  }
  if (e) {
    if (isG) {
      const L = Object.fromEntries((e.shotLocationSummary || []).map(x => [x.locationCode, x]));
      p.eAll = L.all?.savePctgPercentile; p.eHigh = L.high?.savePctgPercentile; p.eMid = L.mid?.savePctgPercentile; p.eLong = L.long?.savePctgPercentile;
      p.eSaves = L.all?.saves; p.eGaa = e.stats?.goalsAgainstAvg?.percentile; p.e900 = e.stats?.gamesAbove900?.percentile;
    } else {
      p.spd = e.skatingSpeed?.speedMax?.percentile; p.burst = e.skatingSpeed?.burstsOver20?.percentile; p.shotSpd = e.topShotSpeed?.percentile;
      const S = Object.fromEntries((e.sogSummary || []).map(x => [x.locationCode, x]));
      p.shPctP = S.all?.shootingPctgPercentile; p.highShP = S.high?.shotsPercentile; p.oz = e.zoneTimeDetails?.offensiveZoneEvPercentile;
    }
  }
});
console.log(`Stats: ${players.length - missing} loaded, ${missing} missing`);
if (missing > players.length * 0.05) throw new Error('Too many player pages failed; leaving data unchanged.');

// ---------- 3. grading ----------
const grp = p => p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F';
const age = bd => (now - new Date(bd)) / 3.15576e10;
const pctRank = (arr, key) => {
  const v = arr.map(p => p[key]).filter(x => x != null && !isNaN(x)).sort((a, b) => a - b);
  return x => {
    if (x == null || isNaN(x) || !v.length) return 0.5;
    let lo = 0, hi = v.length; while (lo < hi) { const m = (lo + hi) >> 1; if (v[m] < x) lo = m + 1; else hi = m; }
    let hi2 = lo; while (hi2 < v.length && v[hi2] === x) hi2++;
    return ((lo + hi2) / 2) / v.length;
  };
};
const shrink = (x, n, k) => x == null ? 0.5 : 0.5 + (x - 0.5) * (n / (n + k));
const CUT = [[.98, 'S'], [.94, 'A+'], [.89, 'A'], [.83, 'A-'], [.76, 'B+'], [.68, 'B'], [.60, 'B-'], [.51, 'C+'], [.42, 'C'], [.33, 'C-'], [.24, 'D+'], [.16, 'D'], [.08, 'D-'], [0, 'F']];
const ORDER = { F: ['Speed', 'Shot', 'Hands', 'Sense', 'Playmaking', 'Build'], D: ['Speed', 'Shot', 'Physicality', 'Build', 'Stick-checking'], G: ['Speed', 'Reflexes', 'Mid-range', 'Long-range', 'Rebounding'] };

for (const G of ['F', 'D', 'G']) {
  const P = players.filter(p => grp(p) === G && p.gp != null);
  P.forEach(p => { p.age = age(p.bd); });
  if (G !== 'G') {
    P.forEach(p => {
      const gp = p.gp || 0, r = k => gp ? (p[k] || 0) / gp : null;
      p.gpg = r('g'); p.apg = r('a'); p.ppg = gp ? ((p.g || 0) + (p.a || 0)) / gp : null; p.spg = r('sh');
      p.pppg = r('ppp'); p.pimpg = r('pim'); p.pmpg = r('pm');
      p.aRatio = ((p.g || 0) + (p.a || 0)) > 3 ? p.a / (p.g + p.a) : null;
    });
    const Q = P.filter(p => p.gp >= 20);
    const R = {}; ['gpg', 'apg', 'ppg', 'spg', 'pppg', 'pimpg', 'pmpg', 'aRatio', 'toi'].forEach(k => R[k] = pctRank(Q, k));
    const Rh = pctRank(P, 'h'), Rw = pctRank(P, 'wgt');
    P.forEach(p => {
      const n = p.gp || 0, s = k => shrink(R[k](p[k]), n, 25), e = k => shrink(p[k], n, 20);
      const sc = {};
      sc.Speed = 0.6 * e('spd') + 0.4 * e('burst');
      sc.Build = G === 'F' ? 0.4 * Rh(p.h) + 0.4 * Rw(p.wgt) + 0.2 * s('pimpg') : 0.5 * Rh(p.h) + 0.5 * Rw(p.wgt);
      if (G === 'F') {
        sc.Shot = 0.35 * e('shotSpd') + 0.35 * s('gpg') + 0.30 * e('shPctP');
        sc.Hands = 0.3 * e('shPctP') + 0.25 * e('highShP') + 0.25 * s('ppg') + 0.2 * s('pppg');
        sc.Sense = 0.35 * e('oz') + 0.25 * s('pmpg') + 0.25 * s('ppg') + 0.15 * s('toi');
        sc.Playmaking = 0.6 * s('apg') + 0.2 * s('pppg') + 0.2 * s('aRatio');
      } else {
        sc.Shot = 0.5 * e('shotSpd') + 0.3 * s('gpg') + 0.2 * s('spg');
        sc.Physicality = 0.35 * Rw(p.wgt) + 0.15 * Rh(p.h) + 0.3 * s('pimpg') + 0.2 * e('shotSpd');
        sc['Stick-checking'] = 0.35 * s('pmpg') + 0.35 * s('toi') + 0.15 * (1 - s('pimpg')) + 0.15 * e('oz');
      }
      p.sc = sc;
    });
    // career pedigree
    P.forEach(p => { p.cgpg = p.cgp ? (p.cg || 0) / p.cgp : null; p.cppg = p.cgp ? ((p.cg || 0) + (p.ca || 0)) / p.cgp : null; p.capg = p.cgp ? (p.ca || 0) / p.cgp : null; });
    const QC = P.filter(p => p.cgp >= 40); const Rc = { cgpg: pctRank(QC, 'cgpg'), cppg: pctRank(QC, 'cppg'), capg: pctRank(QC, 'capg') };
    P.forEach(p => {
      const c = k => shrink(Rc[k](p[k]), p.cgp || 0, 60), sc = p.sc;
      if (G === 'F') { sc.Shot = 0.75 * sc.Shot + 0.25 * c('cgpg'); sc.Hands = 0.8 * sc.Hands + 0.2 * c('cppg'); sc.Playmaking = 0.8 * sc.Playmaking + 0.2 * c('capg'); }
      else sc.Shot = 0.8 * sc.Shot + 0.2 * c('cgpg');
    });
  } else {
    P.forEach(p => {
      const n = p.eSaves || 0, e = k => shrink(p[k], n, 500), yr = Math.max(0, Math.min(1, (38 - p.age) / 18));
      p.sc = {
        Speed: 0.4 * e('eHigh') + 0.3 * e('eMid') + 0.3 * yr,
        Reflexes: 0.6 * e('eHigh') + 0.4 * e('eAll'),
        'Mid-range': 0.5 * e('eMid') + 0.3 * e('eAll') + 0.2 * e('e900'),
        'Long-range': 0.5 * e('eLong') + 0.3 * e('eAll') + 0.2 * e('eGaa'),
        Rebounding: 0.4 * e('eAll') + 0.3 * e('e900') + 0.3 * e('eGaa')
      };
      p.sv3 = p.sa ? 1 - p.ga / p.sa : null;
    });
    const r3 = pctRank(P.filter(p => p.sa >= 500), 'sv3'), rc = pctRank(P.filter(p => p.cgp >= 40), 'csv');
    P.forEach(p => {
      const a = shrink(r3(p.sv3), p.sa || 0, 800), b = shrink(rc(p.csv), p.cgp || 0, 60);
      for (const k in p.sc) p.sc[k] = 0.55 * p.sc[k] + 0.3 * a + 0.15 * b;
    });
  }
  for (const c of ORDER[G]) {
    const rk = pctRank(P.map(p => ({ v: p.sc[c] })), 'v');
    P.forEach(p => { p.gr = p.gr || {}; p.gr[c] = CUT.find(([t]) => rk(p.sc[c]) >= t)[1]; });
  }
}

// ---------- 4. write ----------
const exclude = new Set(existsSync(join(ROOT, 'exclude.txt'))
  ? readFileSync(join(ROOT, 'exclude.txt'), 'utf8').split('\n').map(s => s.replace(/#.*/, '').trim()).filter(Boolean) : []);
const clean = s => String(s).replace(/[|`\n\r]/g, '').replace(/\$\{/g, '');
const lines = players.filter(p => p.gr && !exclude.has(p.name)).map(p => {
  const g = grp(p);
  const stats = g === 'G' ? `${p.cgp || 0}|${p.csv ? p.csv.toFixed(3) : ''}|${p.cw || 0}` : `${p.cgp || 0}|${p.cg || 0}|${p.ca || 0}`;
  return [clean(p.name), p.team, p.pos, p.num, ORDER[g].map(c => p.gr[c]).join(' '), stats].join('|');
});
if (lines.length < MIN_PLAYERS) throw new Error(`Only ${lines.length} graded players; leaving data unchanged.`);
writeFileSync(join(ROOT, 'data_current.txt'), lines.join('\n') + '\n');
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
writeFileSync(join(ROOT, 'data_meta.json'), JSON.stringify({ updated: `${months[now.getUTCMonth()]} ${now.getUTCDate()}, ${now.getUTCFullYear()}`, players: lines.length, seasons: SEASONS }, null, 2) + '\n');
console.log(`Wrote ${lines.length} players (${exclude.size} excluded by name).`);
