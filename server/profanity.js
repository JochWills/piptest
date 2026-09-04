/* ============================================================
   profanity.js — server-side profanity filter

   Mirrors src/lib/profanity.js word-for-word. Not imported from there:
   server/ is a separately deployed service (its own package.json, its
   own Render service) with no build step that would bundle anything
   from src/, so a cross-boundary import would only work by accident in
   dev and break the moment the two are deployed independently — the
   same reasoning ws.js already uses for duplicating index.js's origin
   allow-list rather than importing it. If the word list changes,
   change it in both places.

   This is the actual enforcement boundary, unlike the client copy: it
   runs on every request regardless of what sent it (browser, modified
   client, raw API call), so a message or a handle can't carry
   profanity into the database no matter what wrote it.
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

/* No word-boundary anchors — deliberately. hasProfanity's \b matching is
   right for a sentence, where real words are separated by spaces, but a
   handle is one unbroken alphanumeric token: "fuckface" or "shitlord99"
   never contains a word boundary next to the bad word at all, so \b
   matching lets straight through exactly the concatenations someone
   would actually type to dodge a filter. This accepts the opposite,
   smaller risk instead — a handle that happens to contain a blocked
   word as a substring of an innocent one ("scunthorpe", "cockpit") gets
   wrongly rejected — because for a handle, unlike a chat message, that
   false positive costs someone a rename prompt, while a false negative
   here is a slur sitting in every room's participant list forever. */
const SUBSTRING_RE = new RegExp(`(?:${WORDS.map(wordPattern).join("|")})`, "gi");

/** True if the text contains a blocked word anywhere, ignoring word boundaries.
    Meant for single-token fields (handle, display name) — see hasProfanity
    for ordinary sentences. */
export function hasProfaneSubstring(text) {
  SUBSTRING_RE.lastIndex = 0;
  return SUBSTRING_RE.test(text || "");
}
