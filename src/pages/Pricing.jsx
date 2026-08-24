import React from "react";
import { Card, Svg, Ic } from "../components/ui.jsx";

/* ============================================================
   PricingTable — parked, not rendered anywhere right now.

   Taken off the landing page and out of Settings until the tiers
   are decided. To bring it back: import it into Landing.jsx,
   render <PricingTable onPick={onGetStarted} /> inside a
   <section id="pricing">, and restore the two nav links.
   ============================================================ */

export function PricingTable({ onPick, compact }) {
  const tiers = [
    { name: "Free", price: "$0", per: "forever", cta: "Start free", features: [
      "3 saved sessions", "Crypto markets, all timeframes", "Full drawing tools", "Trade journal and stats", "Join shared rooms",
    ] },
    { name: "Trader", price: "$14", per: "per month", featured: true, cta: "Start free trial", features: [
      "Unlimited sessions", "Host rooms up to 10 people", "Prop-firm challenge mode", "Full analytics breakdowns", "Tag and filter your book", "Export trades to CSV",
    ] },
    { name: "Desk", price: "$39", per: "per month", cta: "Talk to us", features: [
      "Everything in Trader", "Rooms up to 50 people", "Shared team journal", "Group performance view", "Priority support",
    ] },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit,minmax(${compact ? 240 : 280}px,1fr))`, gap: 16, alignItems: "start" }}>
      {tiers.map((t) => (
        <Card key={t.name} style={{
          padding: 24, position: "relative",
          borderColor: t.featured ? "var(--brand)" : "var(--border)",
          borderWidth: t.featured ? 2 : 1,
        }}>
          {t.featured && (
            <span className="pill b" style={{ position: "absolute", top: -11, left: 24 }}>Most popular</span>
          )}
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>{t.name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 18 }}>
            <span className="num" style={{ fontSize: 34, fontWeight: 700 }}>{t.price}</span>
            <span className="sm mut">{t.per}</span>
          </div>
          <button className={"btn " + (t.featured ? "pri" : "outline")} style={{ width: "100%", marginBottom: 18 }} onClick={onPick}>{t.cta}</button>
          <div style={{ display: "grid", gap: 9 }}>
            {t.features.map((f) => (
              <div key={f} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5 }}>
                <span style={{ color: "var(--brand)", flexShrink: 0, marginTop: 1 }}><Svg s={14}>{Ic.check}</Svg></span>
                <span className="mut">{f}</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

