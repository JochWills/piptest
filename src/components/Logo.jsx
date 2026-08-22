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

/* Wordmark uses a dotless i (ı) with the dot drawn separately,
   so only the dot carries the brand colour — as in the original. */
export function Wordmark({ size = 22 }) {
  return (
    <span
      style={{
        fontFamily: "Poppins, Inter, system-ui, sans-serif",
        fontWeight: 500, fontSize: size, letterSpacing: "-0.01em",
        color: "var(--ink)", lineHeight: 1, position: "relative",
        display: "inline-block", whiteSpace: "nowrap",
      }}
    >
      p<span style={{ position: "relative" }}>
        ı
        <span style={{
          position: "absolute", left: "50%", top: -size * 0.30,
          transform: "translateX(-50%)",
          width: size * 0.155, height: size * 0.155,
          borderRadius: "50%", background: "var(--brand)",
        }} />
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
