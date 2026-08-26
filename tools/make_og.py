#!/usr/bin/env python3
"""
Generates the Open Graph / social preview card for PipTest.

Drawn at 2x and downsampled, so edges and text are antialiased
without needing a headless browser.

    python3 tools/make_og.py

Writes public/og.png (1200x630) and public/og-square.png (1000x1000).
"""
import math, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S = 2                      # supersample factor
W, H = 1200 * S, 630 * S

BG      = (11, 13, 17)
INK     = (234, 237, 242)
MUTED   = (152, 162, 179)
DIM     = (95, 104, 117)
BRAND   = (37, 99, 235)
UP      = (34, 197, 94)
DOWN    = (239, 68, 68)
BORDER  = (35, 41, 53)
LOGO_BLUE = (22, 104, 245)

FONT_DIR = "/usr/share/fonts/truetype/google-fonts"
def font(name, size):
    return ImageFont.truetype(f"{FONT_DIR}/Poppins-{name}.ttf", size * S)


def radial_glow(img, cx, cy, radius, colour, peak=0.20):
    """Soft brand glow behind the headline."""
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = radius * t
        a = peak * (1 - t) ** 1.6
        col = tuple(int(BG[k] + (colour[k] - BG[k]) * a) for k in range(3))
        gd.ellipse([cx - r, cy - r * 0.62, cx + r, cy + r * 0.62], fill=col)
    glow = glow.filter(ImageFilter.GaussianBlur(40 * S))
    return Image.blend(img, glow, 0.85)


def candles(draw, x0, y0, w, h, n=44, revealed=32, seed=11):
    """A replay chart: revealed bars solid, the future faded out."""
    rnd = seed
    def rand():
        nonlocal rnd
        rnd = (rnd * 1103515245 + 12345) % 2147483648
        return rnd / 2147483648

    price, series = 100.0, []
    for _ in range(n):
        o = price
        c = o + (rand() - 0.46) * 5.0
        hi = max(o, c) + rand() * 1.9
        lo = min(o, c) - rand() * 1.9
        series.append((o, hi, lo, c))
        price = c

    los = min(s[2] for s in series); his = max(s[1] for s in series)
    span = his - los or 1
    bw = w / n
    def Y(v): return y0 + h - (v - los) / span * h

    for i, (o, hi, lo, c) in enumerate(series):
        cx = x0 + i * bw + bw / 2
        up = c >= o
        base = UP if up else DOWN
        fade = 0.62 if i < revealed else 0.16
        col = tuple(int(BG[k] + (base[k] - BG[k]) * fade) for k in range(3))
        draw.line([(cx, Y(hi)), (cx, Y(lo))], fill=col, width=max(1, int(1.6 * S)))
        top, bot = Y(max(o, c)), Y(min(o, c))
        if bot - top < 2 * S: bot = top + 2 * S
        draw.rounded_rectangle([cx - bw * 0.30, top, cx + bw * 0.30, bot],
                               radius=1.6 * S, fill=col)

    # replay cursor
    cursor_col = tuple(int(BG[k] + (BRAND[k] - BG[k]) * 0.55) for k in range(3))
    cx = x0 + revealed * bw
    y = y0
    while y < y0 + h:
        draw.line([(cx, y), (cx, min(y + 7 * S, y0 + h))], fill=cursor_col, width=max(1, int(1.6 * S)))
        y += 13 * S


def logo_mark(draw, cx, cy, size):
    """Hexagon outline with three candles, matching the app logo."""
    r = size / 2
    pts = [(cx + r * math.sin(math.radians(a)), cy - r * math.cos(math.radians(a)))
           for a in (0, 60, 120, 180, 240, 300)]
    draw.line(pts + [pts[0]], fill=BRAND, width=int(size * 0.075), joint="curve")

    u = size / 64.0
    def candle(x, top, bot, bt, bb, col):
        X = cx + (x - 32) * u
        draw.line([(X, cy + (top - 32) * u), (X, cy + (bot - 32) * u)],
                  fill=col, width=max(1, int(2.3 * u)))
        draw.rounded_rectangle([X - 3.2 * u, cy + (bt - 32) * u, X + 3.2 * u, cy + (bb - 32) * u],
                               radius=1.7 * u, fill=col)
    candle(20.5, 24, 47, 30, 42.5, INK)
    candle(32,   17, 50, 23.5, 42.5, BRAND)
    candle(43.5, 14, 42, 18.5, 37.5, INK)


def wordmark(draw, x, baseline_y, size):
    """'pip' in near-white, 'test' in brand blue — matching the logo."""
    f = font("Medium", size)
    draw.text((x, baseline_y), "pip", font=f, fill=INK, anchor="ls")
    x += draw.textlength("pip", font=f)
    draw.text((x, baseline_y), "test", font=f, fill=LOGO_BLUE, anchor="ls")
    return x + draw.textlength("test", font=f)


def build(width, height, square=False):
    """Layout is explicit rather than fractional: the copy block is measured,
    then the chart band starts below it. Nothing can collide."""
    global W, H
    W, H = width, height
    img = Image.new("RGB", (W, H), BG)
    img = radial_glow(img, W * 0.5, H * 0.02, W * 0.75, BRAND)
    d = ImageDraw.Draw(img)

    pad = int(72 * S)

    # --- brand lockup ---
    mark = int(58 * S)
    logo_mark(d, pad + mark / 2, pad + mark / 2, mark)
    wordmark(d, pad + mark + int(18 * S), pad + mark * 0.70, 40)

    # --- headline ---
    hsize = 58 if not square else 50
    head = font("Bold", hsize)
    y = pad + int(118 * S)
    for line in ["Get a year of screen time", "into a weekend."]:
        d.text((pad, y), line, font=head, fill=INK)
        y += int(hsize * 1.24 * S)

    # --- subline (single line keeps the card breathing) ---
    sub = font("Regular", 25 if not square else 23)
    y += int(10 * S)
    d.text((pad, y), "Replay real markets bar by bar — alone, or with your group.",
           font=sub, fill=MUTED)
    y += int(46 * S)

    # --- chart band: everything left over, above the footer ---
    footer_baseline = H - int(46 * S)
    band_top = y + int(16 * S)
    band_bot = footer_baseline - int(34 * S)
    if band_bot - band_top > 40 * S:
        candles(d, pad, band_top, W - pad * 2, band_bot - band_top, n=44, revealed=32)

    # --- scrim so the footer always reads over the chart ---
    scrim_h = int(H * 0.22)
    scrim = Image.new("RGBA", (W, scrim_h), (0, 0, 0, 0))
    sd = ImageDraw.Draw(scrim)
    for i in range(scrim_h):
        sd.line([(0, i), (W, i)], fill=BG + (int(255 * (i / scrim_h) ** 1.5),))
    img.paste(Image.alpha_composite(
        img.crop((0, H - scrim_h, W, H)).convert("RGBA"), scrim).convert("RGB"),
        (0, H - scrim_h))
    d = ImageDraw.Draw(img)

    # --- footer ---
    small = font("Medium", 22)
    d.text((pad, footer_baseline), "piptest.com", font=small, fill=DIM, anchor="ls")

    tag = "Market replay & backtesting"
    tw = d.textlength(tag, font=small)
    bx1 = W - pad - tw - int(28 * S)
    by1 = footer_baseline - int(27 * S)
    d.rounded_rectangle([bx1, by1, W - pad, footer_baseline + int(11 * S)],
                        radius=int(999 * S), fill=BG, outline=BORDER, width=int(1.4 * S))
    d.text((W - pad - int(14 * S), footer_baseline), tag, font=small, fill=MUTED, anchor="rs")

    # brand hairline along the top edge
    d.rectangle([0, 0, W, int(4 * S)], fill=BRAND)

    return img.resize((width // S, height // S), Image.LANCZOS)


if __name__ == "__main__":
    os.makedirs("public", exist_ok=True)
    build(1200 * S, 630 * S).save("public/og.png", optimize=True)
    print("wrote public/og.png", os.path.getsize("public/og.png"), "bytes")
    build(1000 * S, 1000 * S, square=True).save("public/og-square.png", optimize=True)
    print("wrote public/og-square.png", os.path.getsize("public/og-square.png"), "bytes")
