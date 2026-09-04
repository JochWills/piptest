import React from "react";
import Logo from "../components/Logo.jsx";
import { Card } from "../components/ui.jsx";

/* ============================================================
   Legal — Privacy Policy & Terms of Service

   One file, two documents: they share a header/footer and cross-
   link to each other, and neither is long enough on its own to
   earn a separate layout. Both stay eager-loaded alongside
   Landing/Auth/Reset (see the lazy-import comment in App.jsx) —
   small, and reachable by someone who isn't signed in yet.

   Content is written to match what this app actually does, not
   generic boilerplate — see each section for the corresponding
   code (auth, rooms, admin console, the free-tier local-only
   fallback). Not a substitute for a lawyer's review, especially
   before anything paid or region-specific gets added.
   ============================================================ */

const LAST_UPDATED = "September 4, 2026";
const CONTACT_EMAIL = "info@piptest.com";

function Section({ title, children }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15, marginBottom: 8 }}>{title}</h3>
      <div className="sm mut" style={{ lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

export default function Legal({ kind, onBack, onNav }) {
  const isPrivacy = kind === "privacy";

  return (
    <div style={{ minHeight: "100vh", padding: "40px 20px 80px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
            aria-label="Back to the home page">
            <Logo size={30} />
          </button>
          <span className="link sm" onClick={() => onNav(isPrivacy ? "terms" : "privacy")}>
            {isPrivacy ? "Terms of Service →" : "Privacy Policy →"}
          </span>
        </div>

        <Card style={{ padding: 30 }}>
          <h2 style={{ fontSize: 23, marginBottom: 4 }}>{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h2>
          <p className="sm mut">Last updated {LAST_UPDATED}</p>

          {isPrivacy ? <PrivacyBody /> : <TermsBody />}
        </Card>

        <p className="sm mut" style={{ textAlign: "center", marginTop: 22, lineHeight: 1.6 }}>
          Questions about this {isPrivacy ? "policy" : "agreement"}?{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} className="link">{CONTACT_EMAIL}</a>
        </p>
      </div>
    </div>
  );
}

function PrivacyBody() {
  return (
    <>
      <Section title="The short version">
        PipTest keeps what it needs to run your account and sync your sessions — email, a
        display name, a handle, and the sessions/trades you create — and nothing more. It's
        never sold, never used for ads, and there's no ad or tracking pixel on this site at all.
        If you never create an account, none of this leaves your browser in the first place.
      </Section>

      <Section title="Who this is">
        PipTest is built and operated by NOX Media Group. This policy covers what happens to
        your data when you use piptest.com.
      </Section>

      <Section title="What we collect">
        <b style={{ color: "var(--ink)" }}>Account information</b> — the email, display name,
        handle and password you provide when you sign up. Passwords are hashed (scrypt) before
        they're ever stored; we never have your actual password and can't read it back to you.
        <br /><br />
        <b style={{ color: "var(--ink)" }}>Your avatar</b> is a short code (like <code>fox:4</code>),
        not an uploaded photo — there's nothing to collect there beyond the code itself.
        <br /><br />
        <b style={{ color: "var(--ink)" }}>Sessions, trades and journal entries</b> you create —
        the market/timeframe/date you replay, the setups you arm, and any notes you
        write. This is all simulated activity against historical market data, not a connection
        to any real brokerage or bank account.
        <br /><br />
        <b style={{ color: "var(--ink)" }}>Technical data</b> — your IP address is logged
        against certain account events (sign-in, password reset, admin actions) for security
        and abuse prevention. We don't run analytics or track your browsing beyond that.
      </Section>

      <Section title="What we use it for">
        Running your account (signing you in, keeping sessions synced across devices),
        emailing you a password-reset link if you ask for one, and keeping the service secure.
        That's it — no marketing email, no newsletters unless you explicitly ask for one in
        the future.
      </Section>

      <Section title="Where it's processed">
        Your account and trading data live in a Postgres database hosted by{" "}
        <b style={{ color: "var(--ink)" }}>Supabase</b>. The site and API run on{" "}
        <b style={{ color: "var(--ink)" }}>Render</b>. Password-reset emails are sent through{" "}
        <b style={{ color: "var(--ink)" }}>Resend</b>. None of these providers get to see your
        password — only your hashed password ever touches the database, and email delivery
        only ever sees your email address and the reset link itself.
        <br /><br />
        If you use PipTest without signing up, your sessions and trades are stored only in
        your own browser's local storage — they're never sent to us at all until you decide
        to create an account and bring them across.
      </Section>

      <Section title="Cookies">
        One cookie: an httpOnly, secure cookie that holds a rotating refresh token so you stay
        signed in. It can't be read by JavaScript (including by us, or by an injected script),
        and it's used for nothing except keeping your session alive. No ad cookies, no
        cross-site tracking.
      </Section>

      <Section title="Shared sessions (rooms)">
        If you host or join a room to replay a session together, your handle and your replay
        activity in that room (the chart moving, trades you arm) are visible live to everyone
        else in that room for as long as it's open. Anything you type in room chat is visible
        to other participants the same way.
      </Section>

      <Section title="How long we keep it">
        For as long as your account exists. You can delete your account at any time from
        Settings — that removes your account, every session, every trade and every token
        immediately and permanently. There's no backup to restore from on the current
        (free-tier) infrastructure, so this really is final.
      </Section>

      <Section title="Who can see it">
        Only you, unless you deliberately share it (a room code, for instance). PipTest's
        admin console — a separate, internal tool not shipped to regular visitors — lets
        Josh look up account and usage details for support and moderation; it isn't used to
        browse people's trading activity for any other reason.
      </Section>

      <Section title="Children">
        PipTest isn't directed at children, and we don't knowingly collect information from
        anyone under 16. If you believe a child has created an account, contact us and we'll
        remove it.
      </Section>

      <Section title="Changes to this policy">
        If this changes in a way that matters — what we collect, or who we share it with —
        we'll update the date at the top of this page. Continuing to use PipTest after that
        means you're OK with the update.
      </Section>
    </>
  );
}

function TermsBody() {
  return (
    <>
      <Section title="Agreement">
        By creating an account or using PipTest, you're agreeing to these terms. If you don't
        agree, don't use the site.
      </Section>

      <Section title="What PipTest is">
        PipTest is a practice and education tool. It replays historical market data bar-by-bar
        so you can rehearse trade setups against real price history. Every trade you place
        here is simulated — no real money moves, there's no connection to any brokerage or
        bank account, and nothing you do here is executed in a live market.
        <br /><br />
        Simulated results are not a prediction of live performance: replayed markets have no
        real slippage, no real spread, and none of the emotional cost of trading with actual
        money. Historical price data is sourced from third parties (Binance for crypto, Twelve
        Data for forex and index ETFs) — we don't guarantee it's complete or error-free.
        <br /><br />
        Nothing on PipTest is financial advice, and nothing here should be treated as a
        recommendation to buy, sell, or hold anything.
      </Section>

      <Section title="Your account">
        You're responsible for the accuracy of the information you give us and for keeping
        your password to yourself — anything that happens under your account is on you. One
        account per person; don't create accounts for anyone else without their permission.
      </Section>

      <Section title="Acceptable use">
        Don't try to break, scrape, overload, or reverse-engineer PipTest; don't impersonate
        anyone; don't use a shared room to harass or abuse other participants. We can suspend
        or remove access for anyone who does.
      </Section>

      <Section title="Shared sessions (rooms)">
        Hosting or joining a room shares your handle and live replay activity with everyone
        else in it for as long as it's open — see the Privacy Policy for what that covers.
        Be mindful of what you put in room chat or session notes if you're sharing a room with
        people you don't know well.
      </Section>

      <Section title="Availability">
        PipTest is free to use and provided as-is, without a guaranteed uptime. Features,
        pricing, and the service itself may change, and it may occasionally be unavailable —
        we'll try to keep disruption to a minimum, but we don't promise it won't happen.
      </Section>

      <Section title="Ending your account">
        You can delete your account at any time from Settings — see the Privacy Policy for
        exactly what that removes. We can suspend or delete an account that violates these
        terms.
      </Section>

      <Section title="Ownership">
        PipTest's software, design and branding belong to NOX Media Group. The sessions
        and notes you create are yours — deleting your account deletes them with it,
        rather than us keeping a copy.
      </Section>

      <Section title="No warranty, limited liability">
        PipTest is provided "as is," without warranties of any kind. We're not liable for any
        losses — trading losses very much included — that result from decisions made using
        this tool, whether based on simulated results, a data error, or downtime. Use your own
        judgment, and don't risk real money on a strategy you've only tested here without
        further diligence.
      </Section>

      <Section title="Changes to these terms">
        If these terms change materially, we'll update the date at the top of this page.
        Continuing to use PipTest after that means you're OK with the update.
      </Section>
    </>
  );
}
