import React from "react";

/* ============================================================
   Logo

   The wordmark is the brand artwork itself, exported to PNG with
   a transparent background — so the letterforms are exactly the
   original rather than a font that merely resembles it.

   Two variants exist because the navy "pip" would disappear on
   the dark theme. Both are in the DOM and CSS shows the right
   one, keyed off data-theme on the app root. That avoids passing
   a theme prop down to every place a logo appears, and means no
   flash while an image swaps.

   Regenerate with: python3 tools/make_wordmark.py
   ============================================================ */

export const WORDMARK_RATIO = 3.9808;   // must match the generated assets

export function LogoMark({ size = 32, brand = "var(--brand)", ink = "var(--ink)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M32 4.5 L54.5 17.6 v26.8 L32 59.5 L9.5 44.4 V17.6 Z"
        stroke={brand} strokeWidth="4.5" strokeLinejoin="round" fill="none"
      />
      <line x1="20.5" y1="24" x2="20.5" y2="47" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="17.4" y="30" width="6.2" height="12.5" rx="1.6" fill={ink} />
      <line x1="32" y1="17" x2="32" y2="50" stroke={brand} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="28.6" y="23.5" width="6.8" height="19" rx="1.7" fill={brand} />
      <line x1="43.5" y1="14" x2="43.5" y2="42" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="40.4" y="18.5" width="6.2" height="19" rx="1.6" fill={ink} />
    </svg>
  );
}

export function Wordmark({ size = 22, style }) {
  /* `size` is a nominal type size; the artwork including the p descender
     measures about 82% of it, which keeps it optically level with the mark. */
  const h = Math.round(size * 0.82);
  const common = {
    height: h, width: Math.round(h * WORDMARK_RATIO),
    alt: "PipTest", draggable: false,
    style: { display: "block", ...style },
  };
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <img className="wm wm-light" src="/wordmark-light.png"
        srcSet="/wordmark-light.png 1x, /wordmark-light@3x.png 3x" {...common} />
      <img className="wm wm-dark" src="/wordmark-dark.png"
        srcSet="/wordmark-dark.png 1x, /wordmark-dark@3x.png 3x" {...common} />
    </span>
  );
}

export default function Logo({ size = 30, showText = true, gap = 9 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <LogoMark size={size} />
      {showText && <Wordmark size={size * 0.8} />}
    </span>
  );
}
