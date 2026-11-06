// Pull current-season NHL cap hits from CapWages team pages and write data_cap.txt
// (name|team|cap_hit_dollars). Run with Node 20+:  node tools/update-caps.mjs
// It refuses to overwrite the file if the pull looks incomplete.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEAMS = {
  ANA: 'anaheim_ducks', BOS: 'boston_bruins', BUF: 'buffalo_sabres', CGY: 'calgary_flames', CAR: 'carolina_hurricanes',
  CHI: 'chicago_blackhawks', COL: 'colorado_avalanche', CBJ: 'columbus_blue_jackets', DAL: 'dallas_stars', DET: 'detroit_red_wings',
  EDM: 'edmonton_oilers', FLA: 'florida_panthers', LAK: 'los_angeles_kings', MIN: 'minnesota_wild', MTL: 'montreal_canadiens',
  NSH: 'nashville_predators', NJD: 'new_jersey_devils', NYI: 'new_york_islanders', NYR: 'new_york_rangers', OTT: 'ottawa_senators',
  PHI: 'philadelphia_flyers', PIT: 'pittsburgh_penguins', SJS: 'san_jose_sharks', SEA: 'seattle_kraken', STL: 'st_louis_blues',
  TBL: 'tampa_bay_lightning', TOR: 'toronto_maple_leafs', UTA: 'utah_mammoth', VAN: 'vancouver_canucks', VGK: 'vegas_golden_knights',
  WSH: 'washington_capitals', WPG: 'winnipeg_jets'
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// Season label like "2026-27" (the season starts in the fall)
const now = new Date();
const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const SEASON = `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

async function getPage(slug) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://capwages.com/teams/${slug}`, { headers: { 'user-agent': UA, accept: 'text/html' } });
      if (r.ok) return await r.text();
      console.log(`${slug}: HTTP ${r.status}`);
    } catch (e) { console.log(`${slug}: ${e.message}`); }
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  return null;
}

function rosterPlayers(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let data;
  try { data = JSON.parse(m[1]); } catch { return []; }
  const roster = data?.props?.pageProps?.data?.roster || {};
  const out = [];
  for (const group of Object.values(roster)) if (Array.isArray(group)) out.push(...group);
  return out;
}

function capHitFor(p) {
  for (const c of p.contracts || []) for (const d of c.details || []) {
    if (d.season === SEASON && d.capHit) {
      const n = +String(d.capHit).replace(/[^\d]/g, '');
      if (n > 0) return n;
    }
  }
  return 0;
}

const lines = [], perTeam = {};
for (const [ab, slug] of Object.entries(TEAMS)) {
  const html = await getPage(slug);
  const seen = new Set(); let n = 0;
  for (const p of html ? rosterPlayers(html) : []) {
    if (!p || !p.name || seen.has(p.slug || p.name)) continue;
    seen.add(p.slug || p.name);
    const cap = capHitFor(p); if (!cap) continue;
    const [last, first] = String(p.name).split(',').map(s => s.trim());
    const name = (first ? `${first} ${last}` : last).replace(/[|`\n\r]/g, '').replace(/\$\{/g, '');
    lines.push(`${name}|${ab}|${cap}`); n++;
  }
  perTeam[ab] = n;
  await new Promise(res => setTimeout(res, 800)); // be polite
}
console.log(`Season ${SEASON}:`, JSON.stringify(perTeam));
const thin = Object.entries(perTeam).filter(([, n]) => n < 15).map(([t]) => t);
if (thin.length || lines.length < 600) {
  console.error(`Cap pull looks incomplete (teams with few rows: ${thin.join(', ') || 'none'}; ${lines.length} rows). Leaving data_cap.txt unchanged.`);
  process.exit(1);
}
writeFileSync(join(ROOT, 'data_cap.txt'), lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} cap hits.`);
