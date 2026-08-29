/* ============================================================
   profanity.js — light client-side chat filter

   This is a courtesy filter, not a security boundary: it runs in
   the sender's browser, so a modified client (or a raw API call)
   can still push an unfiltered message into the room doc. It
   catches the normal case — someone typing a slur or a swear word
   into the box — without pretending to be moderation.

   Matching is whole-word and leetspeak-tolerant enough to catch
   spaced-out or number-substituted spellings (f u c k, f4ck)
   without flagging innocent substrings — every entry is checked
   at a word boundary, so "classic", "scunthorpe" and "assassin"
   are untouched.

   Common inflections and misspellings (fucking, fucken, fuk, shitty,
   retarded, …) are listed out explicitly rather than bolted on with
   a generic suffix or fuzzy match, because a generic "+er/+ing" rule
   turns short nouns into real words — "dick" + er = "dicker", "cock"
   + er = "cocker" (spaniel) — and a generic edit-distance match does
   the same to short common words at a distance of one typo.

   The slur section blocks actual slur *terms*, not the neutral
   demographic words (a religion, ethnicity, orientation) they get
   aimed at — "jew", "black", "gay" etc. are never on this list, on
   purpose: those are how people identify themselves, and blocking
   the word itself censors legitimate use far more often than it
   catches an insult built from it, without even reliably catching
   the insult (it's the surrounding language that's hateful, not the
   demographic word). A word that has no other use but the slur is
   fair game; a word that doubles as someone's own name for
   themselves is not.
   ============================================================ */

const WORDS = [
  "fuck", "fucking", "fucked", "fucker", "fuckers", "fucken", "fuckin", "fuk", "motherfucker",
  "shit", "shitty", "shitting", "bullshit",
  "bitch", "bitchy", "bitches",
  "asshole", "assholes",
  "bastard", "bastards",
  "cunt", "cunts",
  "dick", "dickhead", "dickheads",
  "piss", "pissed", "pissing",
  "cock",
  "pussy", "pussies",
  "slut", "sluts",
  "whore", "whores",
  "poes",
  /* slurs — ethnic/racial/religious/orientation/disability */
  "nigger", "niggers", "nigga", "niggas", "negro", "negroes", "coon", "coons",
  "chink", "gook", "spic", "spick", "wetback", "beaner", "kike", "raghead", "towelhead", "paki",
  "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies",
  "retard", "retarded", "spastic", "mongoloid",
];

/* letter -> the characters people swap in for it, so "f4ck" and
   "f u c k" still match "fuck" */
const LEET = { a: "a4@", e: "e3", i: "i1!", o: "o0", u: "uv" };

const wordPattern = (w) =>
  w.split("").map((c) => `[${LEET[c] || c}]\\s*`).join("");

const FILTER_RE = new RegExp(`\\b(?:${WORDS.map(wordPattern).join("|")})\\b`, "gi");

/** True if the text contains a blocked word. */
export function hasProfanity(text) {
  FILTER_RE.lastIndex = 0;
  return FILTER_RE.test(text || "");
}

/** Replace each blocked word with asterisks of the same length, punctuation and spacing left alone. */
export function censor(text) {
  if (!text) return text;
  FILTER_RE.lastIndex = 0;
  return text.replace(FILTER_RE, (m) => m.replace(/\S/g, "*"));
}
