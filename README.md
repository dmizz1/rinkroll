# Rink Roll

Spin real NHL players, take one graded skill from each, and build your own forward, defenseman or goalie.
Live at **https://rinkroll.app**.

## How the site is published
Netlify deploys the `netlify/` folder and the `functions/` API automatically on every push to `main`. There is no site build step on Netlify; it only installs `@netlify/blobs` for the leaderboard function.

## Monthly stats
`.github/workflows/monthly-stats.yml` runs on the 1st of every month. It:
1. pulls current rosters, stats and NHL EDGE tracking (`tools/update-stats.mjs`),
2. regrades every player and writes `data_current.txt` and `data_meta.json`,
3. rebuilds the site (`build.py`) and commits the result, which Netlify then deploys.

If the NHL data looks incomplete, the update stops and the site keeps its last good data.
To run it by hand: GitHub → **Actions** → **Monthly stats update** → **Run workflow**.

## Files
| File | What it is |
|---|---|
| `template.html` | The game: layout, styles and game logic |
| `online_peer.js` | Head-to-head play (PeerJS) for the public site |
| `pages/*.body.html` | How to Play and Privacy page content |
| `data_current.txt` | Current NHL players and grades (rewritten monthly) |
| `data_alltime.txt` | All-Time Greats, graded by hand |
| `exclude.txt` | Players to always leave out of the Current pool |
| `data_cap.txt` | Current cap hits (name\|team\|dollars) for the Cap Line |
| `extras.js` | Trophies, player comparison, trading card, sharing |
| `line.js` | Line builder (Cap Line and Skill Line) and the season sim |
| `lb.js` | Daily leaderboard (public site only) |
| `functions/leaderboard.mjs` | Leaderboard API, stored in Netlify Blobs |
| `build.py` | Builds everything into `netlify/` |

After editing anything, run `python3 build.py` and commit the `netlify/` folder too.
