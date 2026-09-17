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
export const LOGO_BLUE = "#1370FD";   // sampled from the artwork: rgb(19,112,253)
export const LOGO_NAVY = "#0E1D4B";   // sampled from the artwork: rgb(14,29,75)

export const THEMES = {
  dark: {
    bg: "#0B0D11", bg2: "#0F1216",
    surface: "#151920", surface2: "#1B2029", surface3: "#232935",
    border: "#232935", borderStrong: "#31394A",
    ink: "#EAEDF2", muted: "#98A2B3", dim: "#5F6875",
    brand: BRAND, brandHover: "#3B7BF0", brandSoft: "#12203C", brandInk: "#FFFFFF",
    up: "#22C55E", upSoft: "#0F2A1B", down: "#EF4444", downSoft: "#2C1416",
    grid: "#171C24", shadow: "none",
    logoInk: "#F4F7FC", logoBlue: LOGO_BLUE,
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
    logoInk: LOGO_NAVY, logoBlue: LOGO_BLUE,
    heroGlow: "radial-gradient(1200px 600px at 50% -10%, rgba(37,99,235,.10), transparent 70%)",
  },
};

export const cssVars = (t) => {
  const o = {};
  Object.entries(t).forEach(([k, v]) => { o[`--${k}`] = v; });
  return o;
};

/* markets offered in the simulator. `source` decides which feed a
   symbol's candles and live price come from (surfaced in the UI too):
   · "Binance" — fetched straight from the browser, see lib/market.js.
     Keyless, unlimited, and its public market data carries no
     redistribution problem, which is why it's the only feed here.

   Forex, metals and indices are deliberately NOT listed. They were
   live briefly on a Dukascopy feed and were withdrawn: Dukascopy
   confirmed in writing that they "do not offer historical data
   licensing for commercial use", and Piptest is commercial (it's free
   to users but ad-supported). Every other free feed checked says the
   same in its terms — Finnhub is "strictly for personal use", Alpha
   Vantage free is non-commercial, Twelve Data's free tier bars
   commercial use and sells redistribution as a paid add-on, and
   HistData/TrueFX publish no terms at all, which is not permission.

   So do not re-add a market here until there is written permission
   covering all three things Piptest actually does: commercial use,
   redistribution/display to end users, and caching data server-side.
   COMING_SOON below is what the UI shows in the meantime. */
export const SYMBOLS = [
  { id: "BTCUSDT", label: "BTC/USDT", cls: "Crypto", source: "Binance" },
  { id: "ETHUSDT", label: "ETH/USDT", cls: "Crypto", source: "Binance" },
  { id: "SOLUSDT", label: "SOL/USDT", cls: "Crypto", source: "Binance" },
  { id: "BNBUSDT", label: "BNB/USDT", cls: "Crypto", source: "Binance" },
  { id: "XRPUSDT", label: "XRP/USDT", cls: "Crypto", source: "Binance" },
  { id: "DOGEUSDT", label: "DOGE/USDT", cls: "Crypto", source: "Binance" },
  { id: "ADAUSDT", label: "ADA/USDT", cls: "Crypto", source: "Binance" },
  { id: "LINKUSDT", label: "LINK/USDT", cls: "Crypto", source: "Binance" },
  { id: "AVAXUSDT", label: "AVAX/USDT", cls: "Crypto", source: "Binance" },
  { id: "LTCUSDT", label: "LTC/USDT", cls: "Crypto", source: "Binance" },
];

/* Shown as an inert "coming soon" note wherever a market is chosen, so
   the absence reads as planned rather than as a missing feature. */
export const COMING_SOON = "Forex, gold & indices — coming soon";

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

export const barMsOf = (id) => INTERVALS.find((i) => i.id === id)?.ms || 60000;

/* The replay bar's "speed" control used to be an abstract ×N multiplier —
   unclear what it was N times of, and inconsistent across chart intervals
   (4× felt completely different on a 1s chart than on a 1D one). It's a
   step-size picker instead now: literally one of the same INTERVALS values,
   so "30m" means the same thing here as it does in the timeframe tabs. Next
   / play then advance the replay by that much calendar time — either as
   whole bars of the currently displayed interval (a step size at or above
   it), or, below it, by actually fetching finer data and building up the
   still-forming candle live (see datafeed.js's aggregation in control.step).
   Simulator just passes the raw duration in ms; the replay/datafeed layer
   works out what that means in bars. */

export const SESSIONS = [
  { id: "asia", label: "Asia", from: 0, to: 8 },
  { id: "london", label: "London", from: 7, to: 16 },
  { id: "ny", label: "New York", from: 12, to: 21 },
];
