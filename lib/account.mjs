// Shared account code for Rink Roll's site functions (sign-in, sessions, stats and badges).
// Everything lives in the Netlify Blobs store "accounts":
//   u/<uid>          the account (email, name, handle, password hash, stats, badges, recent history)
//   em/<sha(email)>  email → uid        h/<handle> handle → uid
//   se/<sha(token)>  session → uid      tk/<sha(token)> one-time email link (sign-in, sign-up, reset)
//   rl/<sha(email)>  last email sent (rate limit)
//   rk/<uid>         public ranking row      rank/sum cached ranking
//   hx/<code>/<round>/<uid>  a head-to-head result already counted
import { getStore } from '@netlify/blobs';
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);
export const SITE = 'https://rinkroll.app';
export const SCALE = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+', 'S'];
const SESSION_DAYS = 60;
// Daily resets: the leaderboard for that date is stored under a new name, so it starts empty (keep in sync with DAILY_RESET in template.html)
export const DAY_RESETS = { '2026-11-09': 'r1' };
export const dayStore = day => day + (DAY_RESETS[day] ? '~' + DAY_RESETS[day] : '');

export const store = () => getStore({ name: 'accounts', consistency: 'strong' });
export const sha = s => createHash('sha256').update(String(s)).digest('hex');
export const token = (n = 32) => randomBytes(n).toString('base64url');
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
export const clean = (s, max) => String(s || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>`]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
export const normEmail = e => String(e || '').trim().toLowerCase();
export const emailOk = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

export function cookies(req) {
  const out = {};
  for (const part of (req.headers.get('cookie') || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export const setCookie = (name, value, maxAge) => `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

// POSTs must come from the site itself
export function sameOrigin(req) {
  const o = req.headers.get('origin');
  if (!o) return true;
  try { const u = new URL(o), h = new URL(req.url); return u.host === h.host; } catch { return false; }
}

// ---------- passwords ----------
export async function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(pw, salt, 64);
  return { salt, hash: key.toString('hex') };
}
export async function checkPassword(pw, rec) {
  if (!rec || !rec.salt) return false;
  const key = await scrypt(pw, rec.salt, 64), want = Buffer.from(rec.hash, 'hex');
  return key.length === want.length && timingSafeEqual(key, want);
}
export const passwordOk = pw => typeof pw === 'string' && pw.length >= 8 && pw.length <= 200;

// ---------- sessions ----------
export async function currentUser(req, S = store()) {
  const t = cookies(req).rr_s; if (!t || t.length > 100) return null;
  const s = await S.get(`se/${sha(t)}`, { type: 'json' });
  if (!s || s.exp < Date.now()) return null;
  const u = await S.get(`u/${s.uid}`, { type: 'json' });
  return u || null;
}
export async function startSession(S, u) {
  const t = token();
  await S.setJSON(`se/${sha(t)}`, { uid: u.uid, exp: Date.now() + SESSION_DAYS * 864e5 });
  u.sess = [...(u.sess || []), sha(t)].slice(-10);
  await S.setJSON(`u/${u.uid}`, u);
  return setCookie('rr_s', t, SESSION_DAYS * 86400);
}
export async function endSession(req, S) {
  const t = cookies(req).rr_s; if (t) await S.delete(`se/${sha(t)}`);
  return setCookie('rr_s', '', 0);
}

// ---------- accounts ----------
async function uniqueHandle(S, base) {
  base = (base || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14) || 'player';
  for (let i = 0; i < 30; i++) {
    const h = i === 0 ? base : base + Math.floor(Math.random() * (i < 10 ? 100 : 10000));
    const r = await S.setJSON(`h/${h}`, { uid: '' }, { onlyIfNew: true });
    if (!r || r.modified !== false) return h;
  }
  return 'p' + token(6).toLowerCase().replace(/[^a-z0-9]/g, '');
}
export async function userByEmail(S, email) {
  const m = await S.get(`em/${sha(email)}`, { type: 'json' });
  return m ? await S.get(`u/${m.uid}`, { type: 'json' }) : null;
}
// Find the account for this email, or make one. The email has been proven (link or Google) before this runs.
export async function findOrCreate(S, { email, name, google, age13 }) {
  let u = await userByEmail(S, email);
  if (u) {
    let changed = false;
    if (google && !u.google) { u.google = google; changed = true; }
    if (changed) await S.setJSON(`u/${u.uid}`, u);
    return { user: u, created: false };
  }
  if (!age13) return { error: 'age' };
  const uid = token(12);
  const display = clean(name, 16) || clean(email.split('@')[0], 16) || 'Player';
  const handle = await uniqueHandle(S, display);
  u = { uid, email, name: display, handle, created: Date.now(), age13: true, google: google || null, pw: null, ...emptyStats() };
  const claim = await S.setJSON(`em/${sha(email)}`, { uid }, { onlyIfNew: true });
  if (claim && claim.modified === false) return findOrCreate(S, { email, name, google, age13 }); // made at the same moment elsewhere
  await S.setJSON(`h/${handle}`, { uid });
  await S.setJSON(`u/${uid}`, u);
  return { user: u, created: true };
}
export async function deleteAccount(S, u) {
  for (const s of u.sess || []) await S.delete(`se/${s}`);
  await Promise.all([S.delete(`em/${sha(u.email)}`), S.delete(`h/${u.handle}`), S.delete(`rk/${u.uid}`), S.delete(`u/${u.uid}`)]);
}

// ---------- email (Resend) ----------
const FROM = 'Rink Roll <login@mail.rinkroll.app>';
export async function sendEmail(kind, to, url) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('Email is not set up yet.');
  const isReset = kind === 'reset';
  const send = body => fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const base = { from: FROM, to: [to], reply_to: 'shlumpedd13@gmail.com' };
  let r = await send({ ...base, template: { id: isReset ? 'rinkroll-password-reset' : 'rinkroll-sign-in', variables: isReset ? { RESET_URL: url } : { LOGIN_URL: url } } });
  if (!r.ok) { // fall back to a plain email if the template can't be used
    const subject = isReset ? 'Reset your Rink Roll password' : 'Your Rink Roll sign-in link';
    const line = isReset ? 'Open this link to choose a new password. It works once and expires in 30 minutes.' : 'Open this link to sign in. It works once and expires in 15 minutes.';
    r = await send({ ...base, subject, text: `${subject}\n\n${line}\n${url}\n\nIf you didn't ask for this, you can ignore this email.\n\nRink Roll · rinkroll.app`,
      html: `<p style="font-family:Arial,sans-serif;font-size:16px">${line}</p><p><a href="${url}" style="font-family:Arial,sans-serif;font-size:16px">${isReset ? 'Choose a new password' : 'Sign in to Rink Roll'}</a></p><p style="font-family:Arial,sans-serif;font-size:13px;color:#666">If you didn't ask for this, you can ignore this email.</p>` });
  }
  if (!r.ok) throw new Error('Couldn\'t send the email. Try again in a minute.');
}
// one email per address per 45 seconds
export async function rateLimited(S, email) {
  const k = `rl/${sha(email)}`, last = await S.get(k, { type: 'json' });
  if (last && Date.now() - last.t < 45000) return true;
  await S.setJSON(k, { t: Date.now() });
  return false;
}

// ---------- stats and badges ----------
export const BADGES = {
  'first-star': { name: 'First Star', group: 'Grades', how: 'Get an S grade in any category', rep: true },
  'perfect-pick': { name: 'Perfect Pick', group: 'Grades', how: 'Put every player in his best category', rep: true },
  'honor-roll': { name: 'Honor Roll', group: 'Grades', how: 'Finish a build A- or better', rep: true },
  's-tier': { name: 'S-Tier', group: 'Grades', how: 'Finish a build S overall', rep: true },
  'optimal': { name: 'Optimal', group: 'Grades', how: 'Match the best possible build exactly', rep: true },
  'dumpster-fire': { name: 'Dumpster Fire', group: 'Grades', how: 'Finish a build F overall', rep: true },
  'rookie-season': { name: 'Rookie Season', group: 'Daily', how: 'Finish your first Daily' },
  'hat-trick': { name: 'Hat Trick', group: 'Daily', how: '3-day Daily streak' },
  'iron-man': { name: 'Iron Man', group: 'Daily', how: '30-day Daily streak' },
  'every-game': { name: 'Every Game', group: 'Daily', how: '82-day Daily streak' },
  'top-board': { name: 'Top of the Board', group: 'Daily', how: 'Finish #1 on a Daily leaderboard', rep: true },
  'first-win': { name: 'First Win', group: 'Head-to-head', how: 'Win your first head-to-head' },
  'win-streak': { name: 'Win Streak', group: 'Head-to-head', how: 'Win 5 head-to-heads in a row', rep: true },
  'rivalry': { name: 'Rivalry', group: 'Head-to-head', how: 'Play the same person 10 times' },
  'comeback': { name: 'Comeback', group: 'Head-to-head', how: 'Win after losing the first 3 categories', rep: true },
  'presidents': { name: 'Presidents\' Trophy', group: 'Line Builder', how: 'Finish first in the season', rep: true },
  'champion': { name: 'Champion', group: 'Line Builder', how: 'Win the Cup', rep: true },
  'cap-wizard': { name: 'Cap Wizard', group: 'Line Builder', how: 'Win the Cup with under $7M of cap left', rep: true },
  'money-puck': { name: 'Money Puck', group: 'Line Builder', how: 'Make the playoffs on less than half the cap', rep: true }
};
export const tierOf = (id, n) => !n ? null : !BADGES[id].rep ? 'earned' : n >= 25 ? 'gold' : n >= 5 ? 'silver' : 'bronze';

export function emptyStats() {
  return {
    hist: [], badges: {}, showcase: [],
    tot: { builds: 0, sum: 0 }, byMode: {}, byPos: {},
    daily: { days: [], n: 0, sum: 0, streak: 0, best: 0, last: null, lbChecked: [] },
    h2h: { w: 0, l: 0, t: 0, streak: 0, opp: {} },
    lines: { n: 0, cups: 0, playoffs: 0 }
  };
}
const gv = g => Math.max(0, SCALE.indexOf(g));
const earn = (u, id, got) => { u.badges[id] = (u.badges[id] || 0) + 1; got.push(id); };
const earnOnce = (u, id, got) => { if (!u.badges[id]) earn(u, id, got); };
const dayNum = k => Math.round(Date.parse(k + 'T12:00:00Z') / 864e5);

// best total if every drawn player filled exactly one category (players × categories)
function optimalTotal(players) {
  const n = players.length; let best = -1; const used = new Array(n).fill(false);
  (function rec(i, s) {
    if (i === n) { if (s > best) best = s; return; }
    for (let j = 0; j < n; j++) if (!used[j]) { used[j] = true; rec(i + 1, s + gv(players[j][i])); used[j] = false; }
  })(0, 0);
  return best;
}

// Validates a finished build sent by the page: slots = [{ name, grade, grades: [the player's grade in every category] }]
export function cleanBuild(b) {
  const slots = Array.isArray(b.slots) ? b.slots : [];
  if (slots.length < 5 || slots.length > 7) return null;
  const out = slots.map(s => ({ name: clean(s && s.name, 40), grade: SCALE.includes(s && s.grade) ? s.grade : null, grades: Array.isArray(s && s.grades) ? s.grades.slice(0, 7).map(g => SCALE.includes(g) ? g : 'F') : null }));
  if (out.some(s => !s.name || !s.grade)) return null;
  return {
    mode: b.mode === 'alltime' ? 'alltime' : 'current', pos: ['F', 'D', 'G'].includes(b.pos) ? b.pos : 'F',
    play: ['solo', 'daily', 'h2h'].includes(b.play) ? b.play : 'solo',
    day: typeof b.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.day) ? b.day : null, slots: out
  };
}

// Adds one finished build to the account; returns the badges earned by it
export function addBuild(u, b, today) {
  const got = [];
  const vals = b.slots.map(s => gv(s.grade)), total = vals.reduce((a, c) => a + c, 0), avg = total / vals.length, ovr = Math.round(avg);
  u.tot.builds++; u.tot.sum += avg;
  const m = u.byMode[b.mode] = u.byMode[b.mode] || { n: 0, sum: 0 }; m.n++; m.sum += avg;
  const p = u.byPos[b.pos] = u.byPos[b.pos] || { n: 0, sum: 0 }; p.n++; p.sum += avg;
  if (b.slots.some(s => s.grade === 'S')) earn(u, 'first-star', got);
  if (ovr >= 10) earn(u, 'honor-roll', got);
  if (ovr >= 13) earn(u, 's-tier', got);
  if (ovr <= 0) earn(u, 'dumpster-fire', got);
  const full = b.slots.every(s => s.grades && s.grades.length === b.slots.length);
  if (full) {
    if (b.slots.every(s => gv(s.grade) === Math.max(...s.grades.map(gv)))) earn(u, 'perfect-pick', got);
    if (total >= optimalTotal(b.slots.map(s => s.grades))) earn(u, 'optimal', got);
  }
  if (b.play === 'daily' && b.day && !u.daily.days.includes(b.day) && Math.abs(dayNum(b.day) - dayNum(today)) <= 1) {
    const D = u.daily;
    D.days = [...D.days, b.day].slice(-400); D.n++; D.sum += avg;
    D.streak = D.last && dayNum(b.day) - dayNum(D.last) === 1 ? D.streak + 1 : 1;
    D.last = b.day; D.best = Math.max(D.best, D.streak);
    earnOnce(u, 'rookie-season', got);
    if (D.streak >= 3) earnOnce(u, 'hat-trick', got);
    if (D.streak >= 30) earnOnce(u, 'iron-man', got);
    if (D.streak >= 82) earnOnce(u, 'every-game', got);
  }
  pushHist(u, { k: 'build', t: Date.now(), mode: b.mode, pos: b.pos, play: b.play, day: b.day, ovr: SCALE[ovr], grades: b.slots.map(s => s.grade), players: b.slots.map(s => s.name) });
  return got;
}
export function addLine(u, r) {
  const got = [];
  const variant = r.variant === 'cap' ? 'cap' : 'skill';
  const W = r.W | 0, L = r.L | 0, OTL = r.OTL | 0, cup = !!r.cup, playoffs = !!r.playoffs, capUsed = +r.capUsed || 0;
  u.lines.n++; if (cup) u.lines.cups++; if (playoffs) u.lines.playoffs++;
  if (r.presidents) earn(u, 'presidents', got);
  if (cup) earn(u, 'champion', got);
  if (variant === 'cap' && cup && capUsed > 0 && 50e6 - capUsed < 7e6) earn(u, 'cap-wizard', got);
  if (variant === 'cap' && playoffs && capUsed > 0 && capUsed < 25e6) earn(u, 'money-puck', got);
  pushHist(u, { k: 'line', t: Date.now(), variant, rec: `${W}-${L}-${OTL}`, pts: W * 2 + OTL, finish: clean(r.finish, 80), cup, players: Array.isArray(r.players) ? r.players.slice(0, 6).map(x => clean(x, 40)) : [] });
  return got;
}
// res: 'win' | 'loss' | 'tie'; first3Lost: lost each of the first three categories; oppUid: the other signed-in player
export function addH2H(u, { res, first3Lost, oppUid, oppName, mine }) {
  const got = [], H = u.h2h;
  if (res === 'win') { H.w++; H.streak++; earnOnce(u, 'first-win', got); if (H.streak % 5 === 0) earn(u, 'win-streak', got); if (first3Lost) earn(u, 'comeback', got); }
  else if (res === 'loss') { H.l++; H.streak = 0; }
  else H.t++;
  if (oppUid) { H.opp[oppUid] = (H.opp[oppUid] || 0) + 1; if (H.opp[oppUid] >= 10) earnOnce(u, 'rivalry', got); }
  pushHist(u, { k: 'h2h', t: Date.now(), res, opp: clean(oppName, 16), ovr: mine ? mine.ovr : null, grades: mine ? mine.grades : [] });
  return got;
}
function pushHist(u, e) { u.hist = [e, ...(u.hist || [])].slice(0, 60); }

export const avgLetter = (sum, n) => n ? SCALE[Math.round(sum / n)] : null;
export function publicView(u, self) {
  const view = {
    name: u.name, handle: u.handle, created: u.created,
    stats: {
      builds: u.tot.builds, avg: avgLetter(u.tot.sum, u.tot.builds),
      byPos: Object.fromEntries(Object.entries(u.byPos).map(([k, v]) => [k, { n: v.n, avg: avgLetter(v.sum, v.n) }])),
      byMode: Object.fromEntries(Object.entries(u.byMode).map(([k, v]) => [k, { n: v.n, avg: avgLetter(v.sum, v.n) }])),
      daily: { n: u.daily.n, avg: avgLetter(u.daily.sum, u.daily.n), streak: liveStreak(u), best: u.daily.best },
      h2h: { w: u.h2h.w, l: u.h2h.l, t: u.h2h.t },
      lines: u.lines
    },
    badges: Object.fromEntries(Object.entries(u.badges).map(([k, n]) => [k, { n, tier: tierOf(k, n) }])),
    showcase: (u.showcase || []).filter(k => u.badges[k]),
    hist: (u.hist || []).slice(0, self ? 60 : 10)
  };
  if (self) { view.email = u.email; view.hasPassword = !!u.pw; view.google = !!u.google; view.imported = !!u.imported; }
  return view;
}
// a streak only counts if the last Daily was today or yesterday (Eastern)
export function liveStreak(u) {
  if (!u.daily.last) return 0;
  return dayNum(etToday()) - dayNum(u.daily.last) <= 1 ? u.daily.streak : 0;
}
export function etToday() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date());
}
export async function saveRankRow(S, u) {
  await S.setJSON(`rk/${u.uid}`, { name: u.name, handle: u.handle, n: u.daily.n, sum: u.daily.sum, sc: (u.showcase || []).filter(k => u.badges[k]).slice(0, 3) });
}
