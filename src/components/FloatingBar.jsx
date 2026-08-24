import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   FloatingBar

   A panel that floats over the chart and can be dragged
   anywhere. Position is clamped to the viewport and remembered
   between sessions.

   Pointer events rather than mouse events, so it works on a
   trackpad, a touchscreen and a pen. Dragging is captured on the
   grip element and never reaches the chart underneath, so a drag
   can't accidentally draw a trendline.
   ============================================================ */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function FloatingBar({
  pos, onPos, children, collapsed, onToggleCollapse,
  minWidth = 320, label = "Replay",
}) {
  const elRef = useRef(null);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  /* keep it on screen when the window changes size */
  const clampToView = useCallback((p) => {
    const el = elRef.current;
    const w = el?.offsetWidth || minWidth;
    const h = el?.offsetHeight || 56;
    return {
      x: clamp(p.x, 8, Math.max(8, window.innerWidth - w - 8)),
      y: clamp(p.y, 8, Math.max(8, window.innerHeight - h - 8)),
    };
  }, [minWidth]);

  useEffect(() => {
    const onResize = () => onPos((p) => clampToView(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampToView, onPos]);

  const onPointerDown = (e) => {
    /* let buttons and inputs inside the bar work normally */
    if (e.target.closest("button, input, select, textarea, a")) return;
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = elRef.current.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    onPos(clampToView({ x: e.clientX - dragRef.current.dx, y: e.clientY - dragRef.current.dy }));
  };

  const endDrag = (e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (err) {}
  };

  return (
    <div
      ref={elRef}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        position: "fixed", left: pos.x, top: pos.y, zIndex: 80,
        minWidth: collapsed ? 0 : minWidth,
        background: "var(--surface)",
        border: "1px solid var(--borderStrong)",
        borderRadius: 12,
        boxShadow: dragging
          ? "0 18px 44px rgba(0,0,0,.42)"
          : "0 8px 26px rgba(0,0,0,.28)",
        transition: dragging ? "none" : "box-shadow .15s",
        userSelect: "none",
        touchAction: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        {/* grip */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title="Drag to move"
          aria-label={`Move the ${label.toLowerCase()} bar`}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "0 10px 0 12px",
            cursor: dragging ? "grabbing" : "grab",
            borderRight: collapsed ? "none" : "1px solid var(--border)",
            color: "var(--dim)", flexShrink: 0,
          }}
        >
          <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
            {[3, 8, 13].map((y) => (
              <React.Fragment key={y}>
                <circle cx="2.5" cy={y} r="1.25" /><circle cx="7.5" cy={y} r="1.25" />
              </React.Fragment>
            ))}
          </svg>
          {collapsed && <span className="sm" style={{ color: "var(--muted)", fontWeight: 600 }}>{label}</span>}
        </div>

        {!collapsed && <div style={{ flex: 1, minWidth: 0 }}>{children}</div>}

        <button
          className="btn ghost"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand" : "Collapse out of the way"}
          aria-label={collapsed ? "Expand replay bar" : "Collapse replay bar"}
          style={{ padding: "0 10px", borderRadius: 0, alignSelf: "stretch" }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            style={{ transform: collapsed ? "rotate(180deg)" : "none" }}>
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/* Sensible starting spot: centred near the bottom of the viewport,
   the way a transport bar usually sits. */
export const defaultBarPos = (width = 560) => ({
  x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
  y: Math.max(8, window.innerHeight - 132),
});
