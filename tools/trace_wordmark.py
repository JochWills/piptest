#!/usr/bin/env python3
"""
Traces the PipTest wordmark artwork into SVG paths.

The supplied logo is a raster: near-black navy "pip" and blue "test" on white.
A PNG can't adapt to the dark theme and blurs when scaled, so this splits the
two colour groups, vectorises each, and writes a React component whose fills
are CSS variables.

Contours come from OpenCV rather than a tracer, because it reports holes
(the counters inside p, e and the dot on the i) as separate contours, which
is what makes fill-rule evenodd render the letterforms correctly.

    python3 tools/trace_wordmark.py [path/to/logo.png]

Writes src/components/WordmarkPaths.jsx
"""
import sys
import numpy as np
import cv2
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/uploads/pipnewlogo.png"
OUT = "src/components/WordmarkPaths.jsx"

SUPERSAMPLE = 2      # trace at 2x then scale down: smoother curves, same file size
EPSILON = 0.55       # contour simplification, in source pixels


def clean(mask):
    """The artwork has soft, slightly noisy edges, so a bare threshold leaves
    speckles that become dozens of spurious contours. Close small gaps, then
    open to drop the specks, then keep only components of a sensible size."""
    m = mask.astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, k)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, k)

    n, labels, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    biggest = stats[1:, cv2.CC_STAT_AREA].max() if n > 1 else 0
    for i in range(1, n):
        # a stray speck is orders of magnitude smaller than a letter
        if stats[i, cv2.CC_STAT_AREA] > max(60, biggest * 0.004):
            keep[labels == i] = 1
    return keep.astype(bool)


def masks(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int16)

    # soften scanner noise before thresholding
    blur = cv2.GaussianBlur(a.astype(np.uint8), (3, 3), 0).astype(np.int16)
    ink = clean(blur.mean(axis=2) < 205)

    # Splitting on colour alone fails: the anti-aliased rim of each blue letter
    # isn't blue enough to pass the test, so it lands in the dark group and
    # draws a thin outline around every letter. "pip" and "test" don't overlap
    # horizontally, so split on position and take the colour test only as a
    # way to find where the boundary falls.
    # measured from the artwork: navy is rgb(14,29,75) so b-r is ~61,
    # the blue is rgb(19,112,253) so b-r is ~234. 140 sits clearly between.
    bluish = ink & ((blur[..., 2] - blur[..., 0]) > 140)

    # per-column: what fraction of the ink is properly blue?
    ink_per_col = ink.sum(axis=0).astype(float)
    blue_per_col = bluish.sum(axis=0).astype(float)
    frac = np.divide(blue_per_col, ink_per_col, out=np.zeros_like(ink_per_col),
                     where=ink_per_col > 0)

    first_blue = int(np.argmax(frac > 0.5))          # first solidly blue column
    empty = np.nonzero(ink_per_col == 0)[0]          # gaps between letters
    before = empty[empty < first_blue]
    # step back to the letter gap immediately before the blue run, so the
    # boundary sits in whitespace rather than through a letter
    boundary = int(before.max()) if len(before) else first_blue
    print(f"  first blue column {first_blue}, split in the gap at x={boundary}")

    grid_x = np.arange(ink.shape[1])[None, :]
    dark = ink & (grid_x < boundary)
    blue = ink & (grid_x >= boundary)
    print(f"  split at x={int(boundary)}")
    return ink, clean(dark), clean(blue)


def to_paths(mask, ox, oy, scale):
    """One SVG path string per colour group, holes included."""
    m = (mask.astype(np.uint8)) * 255
    if SUPERSAMPLE != 1:
        m = cv2.resize(m, None, fx=SUPERSAMPLE, fy=SUPERSAMPLE, interpolation=cv2.INTER_CUBIC)
        m = (m > 127).astype(np.uint8) * 255
    contours, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

    areas = [cv2.contourArea(c) for c in contours]
    biggest = max(areas) if areas else 0
    out, pts_total = [], 0
    for c, area in zip(contours, areas):
        # keep letter shapes and their counters; drop anything speck-sized
        if area < max(40 * SUPERSAMPLE ** 2, biggest * 0.004):
            continue
        approx = cv2.approxPolyDP(c, EPSILON * SUPERSAMPLE, True)
        if len(approx) < 3:
            continue
        pts_total += len(approx)
        d = []
        for i, p in enumerate(approx):
            x = (p[0][0] / SUPERSAMPLE - ox) * scale
            y = (p[0][1] / SUPERSAMPLE - oy) * scale
            d.append(f"{'M' if i == 0 else 'L'}{x:.1f} {y:.1f}")
        d.append("Z")
        out.append("".join(d))
    return "".join(out), len(out), pts_total


def main():
    ink, dark, blue = masks(SRC)
    ys, xs = np.nonzero(ink)
    x0, y0 = xs.min(), ys.min()
    x1, y1 = xs.max() + 1, ys.max() + 1

    # normalise to a 100-tall viewBox so the component is easy to size
    scale = 100.0 / (y1 - y0)
    w = round((x1 - x0) * scale, 2)

    dpath, dn, dp = to_paths(dark, x0, y0, scale)
    bpath, bn, bp = to_paths(blue, x0, y0, scale)
    print(f"source {x1-x0}x{y1-y0}px")
    print(f"  pip : {dn} contours, {dp} points")
    print(f"  test: {bn} contours, {bp} points")

    jsx = '''import React from "react";

/* ============================================================
   WordmarkPaths — the PipTest wordmark, vectorised

   Traced from the supplied artwork, so the letterforms are
   exactly the original rather than an approximation with a
   substitute font.

   Two path groups rather than one, so each half can take a CSS
   variable — which is what lets "pip" invert on the dark theme
   while "test" keeps its blue. Holes (the counters in p and e,
   the dot on the i) are separate contours resolved by
   fill-rule="evenodd".

   Generated by tools/trace_wordmark.py — regenerate rather than
   editing the path data by hand.
   ============================================================ */

const W = %s;
const H = 100;
export const WORDMARK_RATIO = W / H;

const PIP = "%s";
const TEST = "%s";

export default function WordmarkPaths({
  height = 18,
  pip = "var(--logoInk)",
  test = "var(--logoBlue)",
  style,
}) {
  return (
    <svg
      height={height}
      width={height * WORDMARK_RATIO}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="PipTest"
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <path d={PIP} fill={pip} fillRule="evenodd" />
      <path d={TEST} fill={test} fillRule="evenodd" />
    </svg>
  );
}
''' % (w, dpath, bpath)

    with open(OUT, "w") as f:
        f.write(jsx)
    print(f"wrote {OUT} ({len(jsx)/1024:.1f} KB)")

    # the social-card generator draws the same shapes, so share the geometry
    import json, re
    def to_polys(d):
        out = []
        for sub in d.split("Z"):
            pts = re.findall(r"[ML]([-\d.]+) ([-\d.]+)", sub)
            if len(pts) >= 3:
                out.append([[float(x), float(y)] for x, y in pts])
        return out
    with open("tools/wordmark.json", "w") as f:
        json.dump({"w": w, "h": 100, "pip": to_polys(dpath), "test": to_polys(bpath)}, f)
    print("wrote tools/wordmark.json")


if __name__ == "__main__":
    main()
