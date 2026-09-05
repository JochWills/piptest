/* ============================================================
   adblock.js — ad blocker detection

   Deliberately does NOT depend on whether PIP Affiliates' own ad
   actually loads (the <img> in Simulator's ad rail) — that couples
   access to a third party's uptime, and a slow or briefly-down ad
   server would then lock out every user, blocker or not. Instead
   this plants a decoy element using the class names generic cosmetic
   filter lists target on any page ("adsbox", "ad-banner", etc. — the
   same technique classic anti-adblock scripts like BlockAdBlock use)
   and checks whether an active blocker hid it. That's a real signal
   of "this browser is running an ad blocker" independent of whether
   PIP Affiliates' server happens to be up right now.

   Cosmetic filters can apply asynchronously after the element lands
   in the DOM, so this waits a beat before reading it back. Not a
   security boundary — nothing here needs to be, it's just answering
   "is a blocker active", not protecting anything secret.
   ============================================================ */

const BAIT_CLASSES = "adsbox ad-banner ad-placement text-ad textAd ad-slot adunit pub_300x250";

export function detectAdBlock(delayMs = 150) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") { resolve(false); return; }
    const bait = document.createElement("div");
    bait.className = BAIT_CLASSES;
    bait.setAttribute("aria-hidden", "true");
    bait.style.cssText = "position:absolute; left:-9999px; top:-9999px; width:300px; height:250px;";
    bait.innerHTML = "&nbsp;";
    document.body.appendChild(bait);
    setTimeout(() => {
      let blocked = false;
      try {
        const cs = getComputedStyle(bait);
        blocked = bait.offsetParent === null || bait.offsetHeight === 0 || bait.offsetWidth === 0
          || cs.display === "none" || cs.visibility === "hidden";
      } catch (e) { blocked = false; }
      bait.remove();
      resolve(blocked);
    }, delayMs);
  });
}
