#!/usr/bin/env python3
"""
Builds the wordmark image assets from the brand artwork.

The supplied logo is dark navy "pip" and blue "test" composited on white,
which can't sit on a dark background. This un-mattes it: for each pixel it
solves for how much ink is present, producing a clean alpha channel with no
white fringe.

Two variants:
  wordmark-light.png   navy  "pip" + blue "test"   for light backgrounds
  wordmark-dark.png    white "pip" + blue "test"   for dark backgrounds

Only "pip" is recoloured; the blue is identical in both, as in the original.

    python3 tools/make_wordmark.py [path/to/logo.png]
"""
import sys, os
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/pipnewlogo.png"
OUT = "public"
HEIGHT = 96
RETINA = 3

NAVY = np.array([14, 29, 75])
BLUE = np.array([19, 112, 253])
PAPER = 255.0
DARK_PIP = np.array([244, 247, 252])


def build(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.float64)

    ink = a.mean(axis=2) < 205
    ys, xs = np.nonzero(ink)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    a, ink = a[y0:y1, x0:x1], ink[y0:y1, x0:x1]

    # Split "pip" from "test" on position. Colour alone fails: the
    # anti-aliased rim of a blue letter isn't blue enough to pass the test
    # and would leave a navy outline around every letter.
    bluish = ink & ((a[..., 2] - a[..., 0]) > 140)
    col_ink = ink.sum(axis=0).astype(float)
    col_blue = bluish.sum(axis=0).astype(float)
    frac = np.divide(col_blue, col_ink, out=np.zeros_like(col_ink), where=col_ink > 0)
    first_blue = int(np.argmax(frac > 0.5))
    empty = np.nonzero(col_ink == 0)[0]
    before = empty[empty < first_blue]
    split = int(before.max()) if len(before) else first_blue
    print(f"  ink box {x1-x0}x{y1-y0}px, pip/test split at x={split}")

    gx = np.arange(a.shape[1])[None, :]
    is_blue = gx >= split

    # Un-matte: the artwork is ink over white, C = alpha*F + (1-alpha)*255,
    # so alpha = (255 - C) / (255 - F). The red channel has the widest gap
    # for both inks, so it's the least noisy channel to solve on.
    F_r = np.where(is_blue, BLUE[0], NAVY[0]).astype(np.float64)
    alpha = np.clip((PAPER - a[..., 0]) / (PAPER - F_r), 0, 1)
    alpha[alpha < 0.04] = 0          # drop paper noise

    def variant(pip_rgb):
        rgb = np.zeros(a.shape, np.uint8)
        for c in range(3):
            rgb[..., c] = np.where(is_blue, BLUE[c], pip_rgb[c])
        return Image.fromarray(np.dstack([rgb, (alpha * 255).round().astype(np.uint8)]), "RGBA")

    return variant(NAVY), variant(DARK_PIP)


def save(img, name):
    os.makedirs(OUT, exist_ok=True)
    ratio = img.width / img.height
    for scale, suffix in ((1, ""), (RETINA, f"@{RETINA}x")):
        h = HEIGHT * scale
        w = round(h * ratio)
        img.resize((w, h), Image.LANCZOS).save(f"{OUT}/{name}{suffix}.png", optimize=True)
        print(f"  wrote {OUT}/{name}{suffix}.png  {w}x{h}")
    return ratio


if __name__ == "__main__":
    light, dark = build(SRC)
    ratio = save(light, "wordmark-light")
    save(dark, "wordmark-dark")
    print(f"\naspect ratio {ratio:.4f} — WORDMARK_RATIO in Logo.jsx must match")
