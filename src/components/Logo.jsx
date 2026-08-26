import React from "react";
import WordmarkPaths from "./WordmarkPaths.jsx";

/* ============================================================
   Logo

   Both halves are SVG so they stay crisp at any size and can
   adapt to the theme. The wordmark is traced from the original
   artwork (see tools/trace_wordmark.py) rather than set in a
   substitute font, so the letterforms are exact.
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

export function Wordmark({ size = 22, ...rest }) {
  /* `size` is a nominal cap height; the traced artwork measures
     ~72% of that, which keeps it optically level with the mark. */
  return <WordmarkPaths height={size * 0.72} {...rest} />;
}

export default function Logo({ size = 30, showText = true, gap = 10 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap }}>
      <LogoMark size={size} />
      {showText && <Wordmark size={size * 0.74} />}
    </span>
  );
}
