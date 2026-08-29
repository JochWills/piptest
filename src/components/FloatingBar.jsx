import React, { useState, useEffect, useRef, useCallback } from "react";

/* ============================================================
   FloatingBar

   A panel that floats over the chart and can be dragged around
   within it. Position is clamped to its container — the chart
   section it's rendered inside (an absolutely-positioned child of
   a position:relative ancestor) — and remembered between sessions.

   This used to be clamped to the viewport instead (position:
   fixed), which sounds equivalent but isn't: a saved position is
   just x/y pixels, and the chart column isn't always in the same
   place in the viewport — it moves when the window narrows enough
   to drop the ad rail, or stacks entirely below the order ticket
   on a narrow window. A position that was safely over the chart at
   one width could land on the blotter, the resize handle, or the
   order ticket at another. Clamping to the container this actually
   floats over — not the viewport — means it can only ever end up
   somewhere over the chart/blotter, never outside it.

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

  /* keep it inside its container (offsetParent — the nearest
     position:relative ancestor, i.e. the chart section) when that
     container changes size */
  const clampToView = useCallback((p) => {
    const el = elRef.current;
    const w = el?.offsetWidth || minWidth;
    const h = el?.offsetHeight || 56;
    const c = el?.offsetParent;
    const cw = c?.clientWidth || window.innerWidth;
    const ch = c?.clientHeight || window.innerHeight;
    return {
      x: clamp(p.x, 8, Math.max(8, cw - w - 8)),
      y: clamp(p.y, 8, Math.max(8, ch - h - 8)),
    };
  }, [minWidth]);

  useEffect(() => {
    const reflow = () => onPos((p) => clampToView(p));
    reflow(); // correct a saved/default position against the real container as soon as it exists
    const container = elRef.current?.offsetParent;
    const ro = container && "ResizeObserver" in window ? new ResizeObserver(reflow) : null;
    ro?.observe(container);
    window.addEventListener("resize", reflow);
    return () => { ro?.disconnect(); window.removeEventListener("resize", reflow); };
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
    /* dx/dy were captured from clientX/Y (viewport space) at drag start,
       so the bar's new top-left below is in viewport space too — but pos
       is relative to the container (offsetParent) now, not the viewport,
       so that container's own offset has to be subtracted back out. */
    const c = elRef.current?.offsetParent;
    const crect = c ? c.getBoundingClientRect() : { left: 0, top: 0 };
    onPos(clampToView({
      x: e.clientX - dragRef.current.dx - crect.left,
      y: e.clientY - dragRef.current.dy - crect.top,
    }));
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
        position: "absolute", left: pos.x, top: pos.y, zIndex: 80,
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

/* Sensible starting spot for a brand-new user with nothing saved yet —
   centred near the bottom of the viewport, the way a transport bar
   usually sits. It's only a rough guess (the real container isn't
   mounted yet to measure), but that's fine: the mount-time reflow in
   the effect above immediately reclamps it against the actual chart
   section as soon as it exists. */
export const defaultBarPos = (width = 560) => ({
  x: Math.max(8, Math.round((window.innerWidth - width) / 2)),
  y: Math.max(8, window.innerHeight - 132),
});
