/* ============================================================
   avatars.js — profile pictures without images

   An avatar is stored as a short string like "fox:4": an icon id
   and a colour index. That's about 6 bytes per user, so a
   thousand accounts cost roughly 6 KB — versus tens of megabytes
   if people uploaded photos. No file storage, no upload
   endpoint, no image resizing, nothing to moderate.

   Emoji are used rather than custom artwork because they cost
   nothing to ship. The trade-off is that they render in each
   platform's own style, so the same avatar looks slightly
   different on a Mac, a PC and an Android phone. The coloured
   disc behind them is ours, which keeps the set feeling
   consistent regardless.
   ============================================================ */

export const AVATAR_ICONS = [
  /* markets */
  { id: "bull",    char: "🐂", label: "Bull" },
  { id: "bear",    char: "🐻", label: "Bear" },
  { id: "chartup", char: "📈", label: "Uptrend" },
  { id: "chartdn", char: "📉", label: "Downtrend" },
  { id: "candle",  char: "🕯️", label: "Candle" },
  { id: "target",  char: "🎯", label: "Target" },
  { id: "rocket",  char: "🚀", label: "Rocket" },
  { id: "diamond", char: "💎", label: "Diamond" },
  { id: "bolt",    char: "⚡", label: "Bolt" },
  { id: "fire",    char: "🔥", label: "Fire" },
  { id: "ice",     char: "🧊", label: "Ice" },
  { id: "clock",   char: "⏱️", label: "Stopwatch" },

  /* animals */
  { id: "fox",     char: "🦊", label: "Fox" },
  { id: "wolf",    char: "🐺", label: "Wolf" },
  { id: "owl",     char: "🦉", label: "Owl" },
  { id: "eagle",   char: "🦅", label: "Eagle" },
  { id: "shark",   char: "🦈", label: "Shark" },
  { id: "octopus", char: "🐙", label: "Octopus" },
  { id: "lion",    char: "🦁", label: "Lion" },
  { id: "tiger",   char: "🐯", label: "Tiger" },
  { id: "penguin", char: "🐧", label: "Penguin" },
  { id: "turtle",  char: "🐢", label: "Turtle" },
  { id: "whale",   char: "🐳", label: "Whale" },
  { id: "bee",     char: "🐝", label: "Bee" },

  /* other */
  { id: "brain",   char: "🧠", label: "Brain" },
  { id: "chess",   char: "♟️", label: "Pawn" },
  { id: "dice",    char: "🎲", label: "Dice" },
  { id: "compass", char: "🧭", label: "Compass" },
  { id: "star",    char: "⭐", label: "Star" },
  { id: "moon",    char: "🌙", label: "Moon" },
  { id: "coffee",  char: "☕", label: "Coffee" },
  { id: "anchor",  char: "⚓", label: "Anchor" },
];

/* Muted enough that a row of avatars doesn't fight the UI, but
   distinct from each other at 26px. */
export const AVATAR_COLORS = [
  { id: 0, bg: "#1E3A8A", fg: "#DBEAFE", name: "Blue" },
  { id: 1, bg: "#134E4A", fg: "#CCFBF1", name: "Teal" },
  { id: 2, bg: "#14532D", fg: "#DCFCE7", name: "Green" },
  { id: 3, bg: "#713F12", fg: "#FEF3C7", name: "Amber" },
  { id: 4, bg: "#7C2D12", fg: "#FFEDD5", name: "Rust" },
  { id: 5, bg: "#7F1D1D", fg: "#FEE2E2", name: "Red" },
  { id: 6, bg: "#701A75", fg: "#FAE8FF", name: "Plum" },
  { id: 7, bg: "#3730A3", fg: "#E0E7FF", name: "Indigo" },
  { id: 8, bg: "#334155", fg: "#E2E8F0", name: "Slate" },
  { id: 9, bg: "#422006", fg: "#FEF3C7", name: "Bronze" },
];

const ICON_BY_ID = new Map(AVATAR_ICONS.map((i) => [i.id, i]));

export const encodeAvatar = (iconId, colorId) => `${iconId}:${colorId}`;

/* Never throws: an unknown or missing value falls back to
   something derived from the handle, so a row always renders. */
export function decodeAvatar(value, handle = "") {
  const [id, c] = String(value || "").split(":");
  const icon = ICON_BY_ID.get(id);
  if (icon) {
    const color = AVATAR_COLORS[Number(c)] || AVATAR_COLORS[0];
    return { icon, color, isDefault: false };
  }
  return { ...defaultAvatar(handle), isDefault: true };
}

/* Everyone gets a stable avatar before they ever pick one —
   derived from the handle, so it doesn't change on each render
   and two people rarely collide. */
export function defaultAvatar(handle = "") {
  let h = 2166136261;
  for (let i = 0; i < handle.length; i++) {
    h ^= handle.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  return {
    icon: AVATAR_ICONS[h % AVATAR_ICONS.length],
    color: AVATAR_COLORS[(h >>> 8) % AVATAR_COLORS.length],
  };
}
