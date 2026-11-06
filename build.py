"""Build Rink Roll: the Claude artifact page and the standalone Netlify site folder."""
import os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
P = lambda *a: os.path.join(ROOT, *a)
read = lambda f: open(P(f), encoding='utf-8').read()

tpl = read('template.html')
cur = read('data_current.txt').strip()
alt = read('data_alltime.txt').strip()
assert '`' not in cur + alt and '${' not in cur + alt
import json
DATA_DATE = json.load(open(P('data_meta.json'), encoding='utf-8'))['updated']

SHARE_DESC = 'Spin real NHL players, steal one graded skill from each, and build a monster. Play solo, the Daily, the salary-cap Line Builder, or head-to-head with a friend.'
NAV = '<nav class="site-nav" aria-label="Site"><a href="how-to-play.html">How to play</a><a href="privacy.html">Privacy</a></nav>'
CONTACT = 'shlumpedd13@gmail.com'
SITE = 'https://rinkroll.app/'

EXTRAS = read('extras.js')
LINE = read('line.js')
FX = read('visuals.js')
LBJS = read('lb.js')
CAPS = read('data_cap.txt').strip() if os.path.exists(P('data_cap.txt')) else ''
assert '`' not in CAPS and '${' not in CAPS

def inject(t):
    return t.replace('/*__EXTRAS__*/', EXTRAS).replace('/*__LINE__*/', LINE).replace('/*__FX__*/', FX).replace('/*__LBJS__*/', LBJS).replace('__CAPS__', CAPS).replace('__CURRENT__', cur).replace('__ALLTIME__', alt).replace('__DATA_DATE__', DATA_DATE)

# ---------- 1. Claude artifact ----------
art = inject(tpl.replace('__NAV__', '')).replace('__LB__', 'false')
open(P('rink-roll.html'), 'w', encoding='utf-8').write(art)

# ---------- 2. standalone game ----------
t = tpl.replace('__NAV__', NAV)
start = t.index('/* ---------- head-to-head ---------- */')
end = t.index('initNet();\n') + len('initNet();\n')
t = t[:start] + read('online_peer.js') + t[end:]

def rep(a, b):
    global t
    assert t.count(a) == 1, a
    t = t.replace(a, b)

rep('''    <div class="online-panel" id="online-panel" hidden>
''', '''    <div class="online-panel" id="online-panel" hidden>
      <div class="name-row"><label for="my-name">Your name</label><input id="my-name" class="name-input" maxlength="16" autocomplete="nickname" placeholder="Player"></div>
''')
rep('<button class="btn" id="copy-code">Copy code</button>', '<button class="btn" id="copy-code">Copy code</button><button class="btn" id="copy-link">Copy invite link</button>')
rep("Send this code to a friend. They open Rink Roll, choose Head-to-head, and enter it under Join a lobby. The game starts as soon as they're in.",
    "Send the invite link (or just the code) to a friend. Keep this page open: the lobby lives in your browser. The game starts as soon as they join.")
rep('.op-msg {', '''.name-row { grid-column: 1 / -1; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.name-row label { font-family: var(--display); font-weight: 800; font-size: 20px; text-transform: uppercase; letter-spacing: .04em; }
.name-input { flex: 0 1 260px; min-width: 0; background: #060c16; border: 2px solid var(--rule); border-radius: 4px; padding: 8px 12px; color: var(--ice); font: 600 18px var(--body); }
.name-input:focus { outline: none; border-color: var(--gold); }
.op-msg {''')
rep('<meta name="claude:viewport-fit-sides" content="cover">\n', '')
rep('<script>\nconst CURRENT_RAW', '<script src="https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"></script>\n<script>\nconst CURRENT_RAW')
rep('Data: NHL rosters, stats and EDGE tracking updated __DATA_DATE__.</div>',
    'Data: NHL rosters, stats and EDGE tracking updated __DATA_DATE__.</div>\n    <div>Head-to-head connects the two browsers directly through PeerJS. No accounts, and nothing is stored on a server. <a href="how-to-play.html">How to play</a> · <a href="privacy.html">Privacy policy</a></div>')

def social(title, desc, url):
    img = SITE + 'og.png'
    return (f'<meta property="og:site_name" content="Rink Roll">\n'
            f'<meta property="og:title" content="{title}">\n<meta property="og:description" content="{desc}">\n'
            f'<meta property="og:url" content="{url}">\n<meta property="og:type" content="website">\n'
            f'<meta property="og:image" content="{img}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
            f'<meta property="og:image:alt" content="Rink Roll: spin real NHL players, steal one skill from each, build a monster.">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="{title}">\n'
            f'<meta name="twitter:description" content="{desc}">\n<meta name="twitter:image" content="{img}">\n'
            '<meta name="theme-color" content="#0a1220">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
            '<meta name="apple-mobile-web-app-title" content="Rink Roll">\n')

BASE_RESET = '<style>html{-webkit-text-size-adjust:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}.foot a{color:var(--frost)}</style>'

def document(title_and_styles_and_body, description):
    i = title_and_styles_and_body.index('</style>') + len('</style>')
    head_part, body_part = title_and_styles_and_body[:i], title_and_styles_and_body[i:]
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            f'<meta name="description" content="{description}">\n'
            f'<link rel="canonical" href="{SITE}">\n'
            + social('Rink Roll · Build your own NHL player', SHARE_DESC, SITE)
            + head_part + '\n' + BASE_RESET + '\n</head>\n<body>' + body_part + '\n</body>\n</html>\n')

os.makedirs(P('netlify'), exist_ok=True)
game = document(t, 'Spin real NHL players, take one graded skill from each, and build your own forward, defenseman or goalie. Play solo, the daily challenge, or head-to-head with a friend.')
open(P('netlify', 'index.html'), 'w', encoding='utf-8').write(inject(game).replace('__LB__', 'true'))

# ---------- 3. content pages ----------
style = tpl[tpl.index('<style>'):tpl.index('</style>') + len('</style>')]
fonts = tpl[tpl.index('<link rel="preconnect"'):tpl.index('<style>')]
DOC_CSS = '''<style>
.doc { max-width: 72ch; padding-block: 28px 8px; }
.doc .kicker { font-family: var(--data); font-size: 13px; letter-spacing: .16em; text-transform: uppercase; color: var(--lamp); margin: 0; }
.doc h1 { font-family: var(--display); font-weight: 900; font-size: clamp(40px, 8vw, 64px); line-height: .95; text-transform: uppercase; margin: 6px 0 14px; text-wrap: balance; }
.doc h2 { font-family: var(--display); font-weight: 800; font-size: 30px; text-transform: uppercase; letter-spacing: .03em; margin: 34px 0 8px; padding-top: 14px; border-top: 1px solid var(--rule); text-wrap: balance; }
.doc h3 { font-family: var(--display); font-weight: 800; font-size: 22px; text-transform: uppercase; letter-spacing: .04em; margin: 18px 0 4px; color: var(--ice); }
.doc p, .doc li, .doc dd { color: #cdd9e5; font-size: 17px; line-height: 1.6; }
.doc .lede { font-size: 19px; color: var(--ice); }
.doc .small { font-size: 14px; color: var(--frost); }
.doc a { color: var(--g-a); }
.doc b { color: var(--ice); }
.steps, .tips { padding-left: 1.3em; display: grid; gap: 8px; }
.cat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 8px; }
.cat-grid section { background: var(--boards); border: 1px solid var(--rule); border-radius: 6px; padding: 14px 16px; }
.cat-grid h3 { margin-top: 0; }
.cat-grid dl { margin: 0; display: grid; gap: 2px; }
.cat-grid dt { font-family: var(--display); font-weight: 800; font-size: 18px; text-transform: uppercase; margin-top: 8px; }
.cat-grid dd { margin: 0; font-size: 15px; line-height: 1.5; }
.scale { display: flex; flex-wrap: wrap; gap: 6px; }
.cta { margin-top: 30px; }
.cta .go { display: inline-block; text-decoration: none; color: #fff; }
.home { color: inherit; text-decoration: none; }
</style>'''

def page(slug, title, desc, body_file):
    body = read(os.path.join('pages', body_file)).replace('__CONTACT__', CONTACT)
    content = (f'<title>{title}</title>\n' + fonts + style + '\n' + DOC_CSS +
               '\n<div class="wrap">\n  <header class="masthead">\n    <div>\n'
               '      <p class="credit">Created by D.M</p>\n'
               '      <a class="home" href="./"><p class="brand">Rink<span>·</span>Roll</p></a>\n'
               '      <p class="tag">Spin real NHL players. Steal one skill from each. Build a monster.</p>\n'
               '      ' + NAV + '\n    </div>\n  </header>\n' + body +
               '\n  <footer class="foot"><div>Rink Roll is a fan-made game and is not affiliated with, endorsed by, or sponsored by the NHL, the NHLPA or any team. <a href="./">Play</a> · <a href="how-to-play.html">How to play</a> · <a href="privacy.html">Privacy</a></div></footer>\n</div>')
    # document() splits after the LAST style block in the head
    i = content.rindex('</style>') + len('</style>')
    doc = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
           '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
           f'<meta name="description" content="{desc}">\n<link rel="canonical" href="{SITE}{slug}">\n' + social(title, desc, SITE + slug) + content[:i] + '\n' + BASE_RESET +
           '\n</head>\n<body>' + content[i:] + '\n</body>\n</html>\n')
    open(P('netlify', slug), 'w', encoding='utf-8').write(doc)

page('how-to-play.html', 'How to Play · Rink Roll', 'How Rink Roll works: spin real NHL players, assign each to a category, and build a forward, defenseman or goalie. Modes, categories, grades and strategy.', 'how-to-play.body.html')
page('privacy.html', 'Privacy Policy · Rink Roll', 'Privacy policy for Rink Roll, a free fan-made hockey game.', 'privacy.body.html')
print('built')
