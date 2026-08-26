/* ============================================================
   theme.js — design tokens

   Brand blue is sampled from the logo mark. Green/red are
   reserved strictly for price and P&L so they never compete
   with the brand colour for attention.
   ============================================================ */

export const BRAND = "#2563EB";

/* Wordmark colours. "pip" is near-black navy on light backgrounds, but that
   would disappear on the dark theme, so it flips to the light ink there.
   "test" keeps the same blue in both. */
export const LOGO_BLUE = "#1668F5";

export const THEMES = {
  dark: {
    bg: "#0B0D11", bg2: "#0F1216",
    surface: "#151920", surface2: "#1B2029", surface3: "#232935",
    border: "#232935", borderStrong: "#31394A",
    ink: "#EAEDF2", muted: "#98A2B3", dim: "#5F6875",
    brand: BRAND, brandHover: "#3B7BF0", brandSoft: "#12203C", brandInk: "#FFFFFF",
    up: "#22C55E", upSoft: "#0F2A1B", down: "#EF4444", downSoft: "#2C1416",
    grid: "#171C24", shadow: "none",
    logoInk: "#F2F5FA", logoBlue: LOGO_BLUE,
    heroGlow: "radial-gradient(1200px 600px at 50% -10%, rgba(37,99,235,.18), transparent 70%)",
  },
  light: {
    bg: "#F7F8FA", bg2: "#FFFFFF",
    surface: "#FFFFFF", surface2: "#F4F6F9", surface3: "#EAEEF4",
    border: "#E3E7ED", borderStrong: "#CFD6E0",
    ink: "#0D1117", muted: "#5C6672", dim: "#8C96A3",
    brand: BRAND, brandHover: "#1D4FD7", brandSoft: "#EAF1FE", brandInk: "#FFFFFF",
    up: "#16A34A", upSoft: "#E7F8EE", down: "#DC2626", downSoft: "#FDECEC",
    grid: "#EDF0F4", shadow: "0 1px 2px rgba(13,17,23,.06)",
    logoInk: "#0A1A3C", logoBlue: LOGO_BLUE,
    heroGlow: "radial-gradient(1200px 600px at 50% -10%, rgba(37,99,235,.10), transparent 70%)",
  },
};

export const cssVars = (t) => {
  const o = {};
  Object.entries(t).forEach(([k, v]) => { o[`--${k}`] = v; });
  return o;
};

/* markets offered in the simulator */
export const SYMBOLS = [
  { id: "BTCUSDT", label: "BTC/USDT", cls: "Crypto" },
  { id: "ETHUSDT", label: "ETH/USDT", cls: "Crypto" },
  { id: "SOLUSDT", label: "SOL/USDT", cls: "Crypto" },
  { id: "BNBUSDT", label: "BNB/USDT", cls: "Crypto" },
  { id: "XRPUSDT", label: "XRP/USDT", cls: "Crypto" },
  { id: "DOGEUSDT", label: "DOGE/USDT", cls: "Crypto" },
  { id: "ADAUSDT", label: "ADA/USDT", cls: "Crypto" },
  { id: "LINKUSDT", label: "LINK/USDT", cls: "Crypto" },
  { id: "AVAXUSDT", label: "AVAX/USDT", cls: "Crypto" },
  { id: "LTCUSDT", label: "LTC/USDT", cls: "Crypto" },
];

export const INTERVALS = [
  { id: "1s", ms: 1000, label: "1s" },
  { id: "1m", ms: 60000, label: "1m" },
  { id: "5m", ms: 300000, label: "5m" },
  { id: "15m", ms: 900000, label: "15m" },
  { id: "30m", ms: 1800000, label: "30m" },
  { id: "1h", ms: 3600000, label: "1H" },
  { id: "4h", ms: 14400000, label: "4H" },
  { id: "1d", ms: 86400000, label: "1D" },
];

export const SPEEDS = [1, 2, 3, 5, 10, 25, 50];
export const barMsOf = (id) => INTERVALS.find((i) => i.id === id)?.ms || 60000;

/* setup tags for journalling — user-extendable in Settings */
export const DEFAULT_TAGS = [
  "Break of structure", "Liquidity sweep", "Order block", "FVG",
  "Trend continuation", "Reversal", "Range fade", "News",
];

export const SESSIONS = [
  { id: "asia", label: "Asia", from: 0, to: 8 },
  { id: "london", label: "London", from: 7, to: 16 },
  { id: "ny", label: "New York", from: 12, to: 21 },
];
