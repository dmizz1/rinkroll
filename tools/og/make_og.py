"""Make the link-preview image (netlify/og.png, 1200x630) and the home-screen icon (netlify/apple-touch-icon.png).
Run:  python3 tools/og/make_og.py      (needs Pillow; fonts are the site's own, SIL Open Font License)"""
import math, os, random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, '..', '..', 'netlify')
F = lambda n, s: ImageFont.truetype(os.path.join(HERE, n), s)
D900, D800 = 'saira-extra-condensed-latin-900-normal.woff', 'saira-extra-condensed-latin-800-normal.woff'
BODY, DATA = 'barlow-latin-600-normal.woff', 'saira-semi-condensed-latin-700-normal.woff'
NIGHT, ICE, FROST, LAMP, GOLD = (10, 18, 32), (234, 242, 247), (159, 179, 200), (230, 57, 70), (244, 201, 93)
TIER = {'S': (244, 201, 93), 'A': (111, 211, 255), 'B': (94, 224, 168), 'C': (201, 212, 224), 'D': (255, 159, 90), 'F': (255, 93, 108)}
random.seed(7)

def arena(w, h, crowd=True):
    img = Image.new('RGB', (w, h), NIGHT)
    glow = Image.new('L', (w, h), 0); g = ImageDraw.Draw(glow)
    g.ellipse((w * .1, -h * .55, w * .9, h * .55), fill=120); glow = glow.filter(ImageFilter.GaussianBlur(w // 8))
    img = Image.composite(Image.new('RGB', (w, h), (30, 52, 92)), img, glow)
    d = ImageDraw.Draw(img, 'RGBA')
    for _ in range(int(w * h / 3000)):  # skate scratches
        cx, cy, r = random.uniform(0, w), random.uniform(0, h), random.uniform(80, 600); a = random.uniform(0, 360)
        d.arc((cx - r, cy - r, cx + r, cy + r), a, a + random.uniform(8, 35), fill=(205, 228, 255, random.randint(8, 22)), width=1)
    d.rectangle((w // 2 - 3, 0, w // 2 + 3, h), fill=(230, 57, 70, 40))
    for x in (int(w * .235), int(w * .765)): d.rectangle((x - 7, 0, x + 7, h), fill=(59, 123, 234, 26))
    if crowd:
        layer = Image.new('RGBA', (w, 170), (0, 0, 0, 0)); c = ImageDraw.Draw(layer)
        for y0, col, step in ((30, (13, 22, 38), 17), (58, (8, 14, 25), 16), (88, (5, 9, 15), 15)):
            x = -10
            while x < w + 20:
                r = random.uniform(7, 11); y = y0 + random.uniform(0, 10)
                c.ellipse((x - r, y - r, x + r, y + r), fill=col + (255,))
                c.pieslice((x - r * 1.9, y + r - 4, x + r * 1.9, y + r + 30), 180, 360, fill=col + (255,))
                c.rectangle((x - r * 1.9, y + r + 10, x + r * 1.9, y + r + 80), fill=col + (255,))
                if random.random() < .06: c.rectangle((x + 4, y + 4, x + 6, y + 7), fill=(255, 255, 255, 160))
                x += step + random.uniform(0, 6)
        fade = Image.new('L', (w, 170), 0); fd = ImageDraw.Draw(fade)
        for yy in range(170): fd.line((0, yy, w, yy), fill=int(255 * min(1, max(0, (165 - yy) / 70))))
        a = layer.getchannel('A'); layer.putalpha(Image.composite(a, Image.new('L', a.size, 0), fade).point(lambda v: v))
        from PIL import ImageChops
        layer.putalpha(ImageChops.multiply(a, fade))
        base = img.convert('RGBA'); base.alpha_composite(layer); img = base.convert('RGB')
    return img

def chip(d, x, y, w, h, g, size):
    col = TIER[g[0]]
    d.rounded_rectangle((x, y, x + w, y + h), radius=8, fill=col)
    f = F(D900, size); bb = d.textbbox((0, 0), g, font=f)
    d.text((x + (w - (bb[2] - bb[0])) / 2 - bb[0], y + (h - (bb[3] - bb[1])) / 2 - bb[1]), g, font=f, fill=NIGHT)

def og():
    W, H = 1200, 630
    img = arena(W, H); d = ImageDraw.Draw(img, 'RGBA')
    d.text((72, 150), 'CREATED BY D.M', font=F(DATA, 22), fill=FROST)
    big = F(D900, 178); x = 66
    for part, col in (('RINK', ICE), ('·', LAMP), ('ROLL', ICE)):
        d.text((x, 168), part, font=big, fill=col); x += d.textlength(part, font=big) + 6
    tf = F(BODY, 34)
    d.text((72, 390), 'Spin real NHL players.', font=tf, fill=ICE)
    d.text((72, 432), 'Steal one skill from each.', font=tf, fill=ICE)
    d.text((72, 474), 'Build a monster.', font=tf, fill=ICE)
    d.text((72, 548), 'SOLO · DAILY · LINE BUILDER · HEAD-TO-HEAD', font=F(DATA, 22), fill=FROST)
    # jumbotron card
    cx, cy, cw, ch = 700, 128, 432, 440
    d.rounded_rectangle((cx + 6, cy + 10, cx + cw + 6, cy + ch + 10), radius=18, fill=(0, 0, 0, 90))
    d.rounded_rectangle((cx, cy, cx + cw, cy + ch), radius=18, fill=(20, 32, 54), outline=(44, 61, 92), width=3)
    d.rounded_rectangle((cx + 14, cy + 14, cx + cw - 14, cy + ch - 14), radius=12, outline=LAMP, width=2)
    d.text((cx + 34, cy + 34), 'YOUR FORWARD', font=F(DATA, 20), fill=FROST)
    d.text((cx + 34, cy + 58), 'PURE SNIPER', font=F(D900, 46), fill=ICE)
    chip(d, cx + cw - 34 - 92, cy + 34, 92, 74, 'A', 60)
    rows = [('SPEED', 'B+'), ('SHOT', 'S'), ('HANDS', 'A+'), ('SENSE', 'A-'), ('PLAYMAKING', 'B'), ('BUILD', 'A')]
    ry = cy + 128
    for k, g in rows:
        d.rounded_rectangle((cx + 30, ry, cx + cw - 30, ry + 42), radius=8, fill=(12, 21, 37))
        d.text((cx + 46, ry + 6), k, font=F(D800, 26), fill=ICE)
        chip(d, cx + cw - 30 - 70, ry + 5, 62, 32, g, 24)
        ry += 48
    d.text((W - 72 - d.textlength('RINKROLL.APP', font=F(D900, 34)), 580), 'RINKROLL.APP', font=F(D900, 34), fill=GOLD)
    img.save(os.path.join(OUT, 'og.png'), optimize=True)

def icon():
    S = 180
    img = arena(S, S, crowd=False); d = ImageDraw.Draw(img, 'RGBA')
    cx, top, rx, ry, depth = S / 2, 62, 58, 22, 34
    d.rectangle((cx - rx, top, cx + rx, top + depth), fill=(22, 27, 34))
    d.ellipse((cx - rx, top + depth - ry, cx + rx, top + depth + ry), fill=(22, 27, 34), outline=(170, 180, 195), width=3)
    d.rectangle((cx - rx + 2, top, cx + rx - 2, top + depth), fill=(22, 27, 34))
    d.line((cx - rx, top, cx - rx, top + depth), fill=(170, 180, 195), width=3); d.line((cx + rx, top, cx + rx, top + depth), fill=(170, 180, 195), width=3)
    d.ellipse((cx - rx, top - ry, cx + rx, top + ry), fill=(58, 66, 80), outline=(170, 180, 195), width=3)
    img.save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)

og(); icon(); print('wrote og.png and apple-touch-icon.png')
