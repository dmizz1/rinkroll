# Rink Roll

Spin real NHL players, take one graded skill from each, and build your own forward, defenseman or goalie.
Live at **https://rinkroll.app**.

## How the site is published
Netlify deploys the `netlify/` folder and the `functions/` API automatically on every push to `main`. There is no site build step on Netlify; it only installs `@netlify/blobs` for the leaderboard function.

## Monthly stats
`.github/workflows/monthly-stats.yml` runs on the 1st of every month. It:
1. pulls current rosters, stats and NHL EDGE tracking (`tools/update-stats.mjs`),
2. regrades every player and writes `data_current.txt` and `data_meta.json`,
   and refreshes cap hits from CapWages (`tools/update-caps.mjs` → `data_cap.txt`),
3. rebuilds the site (`build.py`) and commits the result, which Netlify then deploys.

If the NHL data looks incomplete, the update stops and the site keeps its last good data.
To run it by hand: GitHub → **Actions** → **Monthly stats update** → **Run workflow**.
To refresh only cap hits (after big trades or signings): **Actions** → **Update cap hits** → **Run workflow**.

## Files
| File | What it is |
|---|---|
| `template.html` | The game: layout, styles and game logic |
| `online_poll.js` | Head-to-head play for the public site (talks to `/api/lobby`) |
| `pages/*.body.html` | How to Play and Privacy page content |
| `data_current.txt` | Current NHL players and grades (rewritten monthly) |
| `data_alltime.txt` | Modern Era Stars (1980 and up: 75 F, 75 D, 35 G), graded by hand |
| `exclude.txt` | Players to always leave out of the Current pool |
| `data_cap.txt` | Current cap hits (name\|team\|dollars) for the Cap Line |
| `extras.js` | Trophies, player comparison, trading card, sharing |
| `line.js` | Line builder (Cap Line and Skill Line) and the season sim |
| `lb.js` | Daily leaderboard (public site only) |
| `functions/leaderboard.mjs` | Leaderboard API, stored in Netlify Blobs |
| `functions/lobby.mjs` | Head-to-head lobby API, stored in Netlify Blobs |
| `build.py` | Builds everything into `netlify/` |

After editing anything, run `python3 build.py` and commit the `netlify/` folder too.

## Classic look backup
The arena visuals (ice, spotlights, crowd, jumbotron reel, team colors, confetti) live in `visuals.js` and the `body.fx` styles.
Visitors can switch them off with the **Arena on/off** button in the header.
The site as it was before the visual upgrade is saved on the `classic-look` branch.

## Link previews
`netlify/og.png` (1200x630) is the image shown when the link is shared, and `netlify/apple-touch-icon.png` is the home-screen icon.
Regenerate both with `python3 tools/og/make_og.py`. The preview tags are written by `build.py` (`social()`).
