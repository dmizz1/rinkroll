// Sign-in for Rink Roll accounts: email link, password (with email-verified sign-up and reset) and Google.
//   POST /api/auth/email     { email, age13 }                      → emails a one-time sign-in link
//   POST /api/auth/password  { action: 'signup', email, age13 }   → emails a link; after using it the page asks for the new password
//                            { action: 'login', email, password }  → signs in
//                            { action: 'reset-request', email }    → emails a reset link (always says ok)
//                            { action: 'reset', t, password }      → sets the new password and signs in
//   POST /api/auth/verify    { t }                                  → uses a sign-in / sign-up link
//   POST /api/auth/logout
//   GET  /api/auth/google?age=1  → Google;  GET /api/auth/google/callback → back to /#account
// Links point at the page (/#login=… , /#reset=…), which posts the token, so email scanners that open links can't use them up.
import {
  store, sha, token, json, clean, normEmail, emailOk, cookies, setCookie, sameOrigin, hashPassword, checkPassword, passwordOk,
  startSession, endSession, userByEmail, findOrCreate, sendEmail, rateLimited, SITE
} from '../lib/account.mjs';

const LINK_MIN = 15, RESET_MIN = 30;

async function makeToken(S, data, minutes) {
  const t = token();
  await S.setJSON(`tk/${sha(t)}`, { ...data, exp: Date.now() + minutes * 60000 });
  return t;
}
async function useToken(S, t, kinds) {
  if (typeof t !== 'string' || t.length > 100) return null;
  const k = `tk/${sha(t)}`, d = await S.get(k, { type: 'json' });
  if (!d || !kinds.includes(d.kind)) return null;
  await S.delete(k);
  return d.exp > Date.now() ? d : null;
}
const signedIn = (cookie, created) => json({ ok: true, created }, 200, { 'set-cookie': cookie });
const AGE_MSG = 'To make an account, check the box confirming you\'re 13 or older.';

export default async (req) => {
  const S = store(), url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/auth\/?/, '').replace(/\/$/, '');

  // ---------- Google ----------
  if (req.method === 'GET' && route === 'google') {
    const id = process.env.GOOGLE_CLIENT_ID;
    if (!id) return Response.redirect(`${SITE}/#account?err=google`, 302);
    const state = token(16), age = url.searchParams.get('age') === '1' ? '1' : '0';
    const q = new URLSearchParams({ client_id: id, redirect_uri: `${SITE}/api/auth/google/callback`, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
    return new Response(null, { status: 302, headers: { location: `https://accounts.google.com/o/oauth2/v2/auth?${q}`, 'set-cookie': setCookie('rr_gs', `${state}.${age}`, 600), 'cache-control': 'no-store' } });
  }
  if (req.method === 'GET' && route === 'google/callback') {
    const back = (q, cookie) => new Response(null, { status: 302, headers: { location: `${SITE}/#account${q}`, ...(cookie ? { 'set-cookie': cookie } : {}), 'cache-control': 'no-store' } });
    const [state, age] = String(cookies(req).rr_gs || '').split('.');
    if (!state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return back('?err=google');
    try {
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: url.searchParams.get('code'), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${SITE}/api/auth/google/callback`, grant_type: 'authorization_code' }) });
      const tok = await r.json();
      if (!r.ok || !tok.id_token) return back('?err=google');
      // the token came straight from Google over HTTPS, so its claims can be read directly; still check who it was for
      const claims = JSON.parse(Buffer.from(tok.id_token.split('.')[1], 'base64url').toString());
      const okIss = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
      if (!okIss || claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.exp * 1000 < Date.now() || !claims.email_verified) return back('?err=google');
      const res = await findOrCreate(S, { email: normEmail(claims.email), name: claims.given_name || claims.name, google: String(claims.sub), age13: age === '1' });
      if (res.error === 'age') return back('?err=age');
      return back(res.created ? '?new=1' : '', await startSession(S, res.user));
    } catch { return back('?err=google'); }
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!sameOrigin(req)) return json({ error: 'Not allowed.' }, 403);
  let b; try { b = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  if (route === 'logout') return json({ ok: true }, 200, { 'set-cookie': await endSession(req, S) });

  if (route === 'verify') {
    const d = await useToken(S, b.t, ['login', 'signup']);
    if (!d) return json({ error: 'That link has expired or was already used. Ask for a new one.' }, 400);
    const res = await findOrCreate(S, { email: d.email, age13: d.age13 });
    if (res.error === 'age') return json({ error: AGE_MSG }, 400);
    // the password is chosen on the page by whoever opened the link (never sent ahead with the request),
    // so nobody can set a password on someone else's email
    return json({ ok: true, created: res.created, setPassword: d.kind === 'signup' && !res.user.pw }, 200, { 'set-cookie': await startSession(S, res.user) });
  }

  const email = normEmail(b.email);

  if (route === 'email') {
    if (!emailOk(email)) return json({ error: 'Enter a valid email address.' }, 400);
    const existing = await userByEmail(S, email);
    if (!existing && !b.age13) return json({ error: AGE_MSG, needAge: true }, 400);
    if (await rateLimited(S, email)) return json({ error: 'We just sent a link to that address. Check your inbox (and spam), or try again in a minute.' }, 429);
    const t = await makeToken(S, { kind: 'login', email, age13: !!b.age13 }, LINK_MIN);
    try { await sendEmail('login', email, `${SITE}/#login=${t}`); } catch (e) { return json({ error: e.message }, 502); }
    return json({ ok: true });
  }

  if (route === 'password') {
    if (b.action === 'login') {
      if (!emailOk(email) || typeof b.password !== 'string') return json({ error: 'Enter your email and password.' }, 400);
      const lk = `lf/${sha(email)}`, lf = (await S.get(lk, { type: 'json' })) || { n: 0, t: 0 };
      if (lf.n >= 8 && Date.now() - lf.t < 15 * 60000) return json({ error: 'Too many tries. Wait 15 minutes or reset your password.' }, 429);
      const u = await userByEmail(S, email);
      if (!u || !u.pw || !(await checkPassword(b.password, u.pw))) {
        await S.setJSON(lk, { n: Date.now() - lf.t > 15 * 60000 ? 1 : lf.n + 1, t: Date.now() });
        return json({ error: u && !u.pw ? 'This account doesn\'t have a password yet. Use "Email me a link" or Google, or reset your password to make one.' : 'Wrong email or password.' }, 401);
      }
      await S.delete(lk);
      return signedIn(await startSession(S, u), false);
    }
    if (b.action === 'signup') {
      if (!emailOk(email)) return json({ error: 'Enter a valid email address.' }, 400);
      const u = await userByEmail(S, email);
      if (u && u.pw) return json({ error: 'There\'s already an account with this email. Sign in instead, or reset your password.' }, 409);
      if (!u && !b.age13) return json({ error: AGE_MSG, needAge: true }, 400);
      if (await rateLimited(S, email)) return json({ error: 'We just sent a link to that address. Check your inbox (and spam), or try again in a minute.' }, 429);
      const t = await makeToken(S, { kind: 'signup', email, age13: !!b.age13 }, LINK_MIN);
      try { await sendEmail('login', email, `${SITE}/#login=${t}`); } catch (e) { return json({ error: e.message }, 502); }
      return json({ ok: true, check: true });
    }
    if (b.action === 'reset-request') {
      if (!emailOk(email)) return json({ error: 'Enter a valid email address.' }, 400);
      const u = await userByEmail(S, email);
      if (u && !(await rateLimited(S, email))) {
        const t = await makeToken(S, { kind: 'reset', email }, RESET_MIN);
        try { await sendEmail('reset', email, `${SITE}/#reset=${t}`); } catch (e) { return json({ error: e.message }, 502); }
      }
      return json({ ok: true }); // same answer either way, so nobody can test which emails have accounts
    }
    if (b.action === 'reset') {
      if (!passwordOk(b.password)) return json({ error: 'Use a password with at least 8 characters.' }, 400);
      const d = await useToken(S, b.t, ['reset']);
      if (!d) return json({ error: 'That reset link has expired or was already used. Ask for a new one.' }, 400);
      const u = await userByEmail(S, d.email);
      if (!u) return json({ error: 'No account found.' }, 404);
      u.pw = await hashPassword(b.password);
      await S.setJSON(`u/${u.uid}`, u);
      return signedIn(await startSession(S, u), false);
    }
  }
  return json({ error: 'Unknown action.' }, 400);
};

export const config = { path: '/api/auth/*' };
