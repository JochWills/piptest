import React from "react";

/* ============================================================
   Logo

   Wordmark is Sora at 550 — the closest match to the brand
   artwork out of thirteen candidates, scored by overlap against
   the original. It gets the details right: the flat-topped "t"
   with a curved foot, the squared-off aperture on the "e", and
   the rectangular dot on the "i".

   Using a real font rather than traced outlines means it scales
   and sits on the baseline properly at any size.
   ============================================================ */

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

/* "pip" takes --logoInk, which is the brand navy on light backgrounds and
   near-white on dark, since the navy would otherwise disappear. "test"
   keeps the same blue in both. */
export function Wordmark({ size = 22 }) {
  return (
    <span
      style={{
        fontFamily: "Sora, Poppins, Inter, system-ui, sans-serif",
        fontWeight: 550, fontSize: size, lineHeight: 1,
        letterSpacing: "-0.012em", display: "inline-block", whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "var(--logoInk)" }}>pip</span>
      <span style={{ color: "var(--logoBlue)" }}>test</span>
    </span>
  );
}

export default function Logo({ size = 30, showText = true, gap = 9 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <LogoMark size={size} />
      {showText && <Wordmark size={size * 0.78} />}
    </span>
  );
}
