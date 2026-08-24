import React from "react";

/* ============================================================
   Logo

   The mark is redrawn as SVG rather than shipped as the PNG so
   it stays crisp at any size and adapts to the light theme —
   the PNG's white candles would vanish on a white background.
   ============================================================ */

export function LogoMark({ size = 32, brand = "var(--brand)", ink = "var(--ink)" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* pointy-top hexagon, rounded joins */}
      <path
        d="M32 4.5 L54.5 17.6 v26.8 L32 59.5 L9.5 44.4 V17.6 Z"
        stroke={brand} strokeWidth="4.5" strokeLinejoin="round" fill="none"
      />
      {/* left candle */}
      <line x1="20.5" y1="24" x2="20.5" y2="47" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="17.4" y="30" width="6.2" height="12.5" rx="1.6" fill={ink} />
      {/* middle candle — brand blue */}
      <line x1="32" y1="17" x2="32" y2="50" stroke={brand} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="28.6" y="23.5" width="6.8" height="19" rx="1.7" fill={brand} />
      {/* right candle */}
      <line x1="43.5" y1="14" x2="43.5" y2="42" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      <rect x="40.4" y="18.5" width="6.2" height="19" rx="1.6" fill={ink} />
    </svg>
  );
}

/* ------------------------------------------------------------
   Wordmark

   Only the DOT of the "i" is brand blue, so the word is set with
   a dotless i (U+0131) and the dot drawn as a separate circle.

   Placing it needs the font's metrics, not a guess. With
   line-height: 1 the inline box is exactly 1em tall and Poppins
   puts the baseline ~0.85em below the box top (ascent 1.05,
   descent 0.35, so half-leading is negative). The x-height is
   ~0.548em, which puts the top of the stem at 0.85 − 0.548 ≈
   0.30em down. The dot sits just above that.

   The previous value was NEGATIVE, which floated the dot above
   the whole line box instead of above the stem.
   ------------------------------------------------------------ */
const BASELINE = 0.85;    // em below box top
const XHEIGHT  = 0.548;   // em
const DOT      = 0.15;    // em diameter
const GAP      = 0.085;   // em optical gap above the stem
const DOT_TOP  = BASELINE - XHEIGHT - GAP - DOT;   // ~0.067em

export function Wordmark({ size = 22 }) {
  return (
    <span
      style={{
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        fontWeight: 500, fontSize: size, lineHeight: 1,
        letterSpacing: "-0.01em", color: "var(--ink)",
        display: "inline-block", whiteSpace: "nowrap",
      }}
    >
      p<span style={{ position: "relative", display: "inline-block" }}>
        {"\u0131"}
        <span
          aria-hidden="true"
          style={{
            position: "absolute", left: "50%", transform: "translateX(-50%)",
            top: `${DOT_TOP}em`, width: `${DOT}em`, height: `${DOT}em`,
            borderRadius: "50%", background: "var(--brand)",
          }}
        />
      </span>ptest
    </span>
  );
}

export default function Logo({ size = 30, showText = true, gap = 10 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <LogoMark size={size} />
      {showText && <Wordmark size={size * 0.72} />}
    </span>
  );
}
