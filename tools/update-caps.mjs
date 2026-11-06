// Pull current-season NHL cap hits from PuckPedia team pages and write data_cap.txt
// (name|team|cap_hit_dollars). Run with Node 20+:  node tools/update-caps.mjs
// Run on demand from the GitHub Actions tab ("Update cap hits"); it refuses to
// overwrite the file if the pull looks incomplete.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEAMS = { ANA: 'anaheim-ducks', BOS: 'boston-bruins', BUF: 'buffalo-sabres', CGY: 'calgary-flames', CAR: 'carolina-hurricanes', CHI: 'chicago-blackhawks', COL: 'colorado-avalanche', CBJ: 'columbus-blue-jackets', DAL: 'dallas-stars', DET: 'detroit-red-wings', EDM: 'edmonton-oilers', FLA: 'florida-panthers', LAK: 'los-angeles-kings', MIN: 'minnesota-wild', MTL: 'montreal-canadiens', NSH: 'nashville-predators', NJD: 'new-jersey-devils', NYI: 'new-york-islanders', NYR: 'new-york-rangers', OTT: 'ottawa-senators', PHI: 'philadelphia-flyers', PIT: 'pittsburgh-penguins', SJS: 'san-jose-sharks', SEA: 'seattle-kraken', STL: 'st-louis-blues', TBL: 'tampa-bay-lightning', TOR: 'toronto-maple-leafs', UTA: 'utah-mammoth', VAN: 'vancouver-canucks', VGK: 'vegas-golden-knights', WSH: 'washington-capitals', WPG: 'winnipeg-jets' };

const decode = s => s.replace(/&#039;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();

async function getPage(slug) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`https://puckpedia.com/team/${slug}`, { headers: { 'user-agent': 'Mozilla/5.0 (rinkroll cap update)', 'accept': 'text/html' } });
      if (r.ok) return await r.text();
      console.log(`${slug}: HTTP ${r.status}`);
    } catch (e) { console.log(`${slug}: ${e.message}`); }
    await new Promise(res => setTimeout(res, 1500 * (i + 1)));
  }
  return null;
}

// A contract row: <a ... href="/player/slug" ...>Last, First</a> ... </td><td ...>$9,750,000 ...
function parse(html) {
  const out = [], seen = new Set();
  const re = /<a[^>]*href="\/player\/([^"]+)"[^>]*>([^<]*,[^<]*)<\/a>/g;
  let m;
  while ((m = re.exec(html))) {
    const slug = m[1]; if (seen.has(slug)) continue;
    const rest = html.slice(re.lastIndex, re.lastIndex + 6000);
    const endTd = rest.indexOf('</td>'); if (endTd < 0) continue;
    const next = rest.slice(endTd + 5);
    const tdStart = next.indexOf('<td'); if (tdStart < 0 || tdStart > 400) continue; // must be the very next cell
    const tdEnd = next.indexOf('</td>', tdStart); if (tdEnd < 0) continue;
    const cell = next.slice(tdStart, tdEnd).replace(/<[^>]+>/g, ' ');
    const money = cell.match(/\$\s*([\d,]{5,})/); if (!money) continue;
    const [last, first] = decode(m[2]).split(',').map(s => s.trim());
    if (!first || !last) continue;
    seen.add(slug);
    out.push([`${first} ${last}`, +money[1].replace(/,/g, '')]);
  }
  return out;
}

const lines = [], perTeam = {};
for (const [ab, slug] of Object.entries(TEAMS)) {
  const html = await getPage(slug);
  const rows = html ? parse(html) : [];
  perTeam[ab] = rows.length;
  rows.filter(([, cap]) => cap > 0).forEach(([name, cap]) => lines.push(`${name}|${ab}|${cap}`));
  await new Promise(res => setTimeout(res, 700)); // be polite
}
console.log(JSON.stringify(perTeam));
const thin = Object.entries(perTeam).filter(([, n]) => n < 15).map(([t]) => t);
if (thin.length || lines.length < 700) {
  console.error(`Cap pull looks incomplete (teams with few rows: ${thin.join(', ') || 'none'}; ${lines.length} rows). Leaving data_cap.txt unchanged.`);
  process.exit(1);
}
writeFileSync(join(ROOT, 'data_cap.txt'), lines.join('\n') + '\n');
console.log(`Wrote ${lines.length} cap hits.`);
