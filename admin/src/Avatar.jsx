import React from "react";
import { decodeAvatar } from "./avatars.js";

/* ============================================================
   Avatar

   A coloured disc with an emoji in it. The disc is ours, which
   keeps a row of avatars looking like one set even though the
   emoji themselves are drawn by each operating system.
   ============================================================ */

export default function Avatar({ value, handle = "", size = 28, title, style }) {
  const { icon, color } = decodeAvatar(value, handle);
  return (
    <span
      title={title ?? handle}
      aria-label={`${icon.label} avatar`}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: color.bg, color: color.fg,
        display: "inline-grid", placeItems: "center",
        /* emoji don't sit on the same baseline everywhere; a fixed
           line-height and a nudge keeps them centred in the disc */
        fontSize: Math.round(size * 0.54), lineHeight: 1,
        userSelect: "none", ...style,
      }}
    >
      <span style={{ transform: "translateY(1%)" }}>{icon.char}</span>
    </span>
  );
}
