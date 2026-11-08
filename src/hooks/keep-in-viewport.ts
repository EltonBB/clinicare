/**
 * Callback ref for a small popover pinned to its trigger's right edge: when it
 * opens, nudge it sideways so it keeps a 16px margin from both screen edges.
 * On a phone the trigger can sit far enough left that a right-aligned popover
 * started off screen (the calendar's date picker lost a column, more in
 * Albanian, where longer labels push the trigger further left).
 *
 * Measured from the right edge plus `offsetWidth`, not the rect's left: the
 * popovers open with a scale-in from their top-right corner, so the left edge
 * is still moving while this runs.
 */
export function keepInViewport(element: HTMLElement | null) {
  if (!element) return;
  const margin = 16;
  const place = () => {
    element.style.translate = "";
    const viewport = document.documentElement.clientWidth;
    const right = element.getBoundingClientRect().right;
    const left = right - element.offsetWidth;
    const shift = left < margin ? margin - left : right > viewport - margin ? viewport - margin - right : 0;
    element.style.translate = shift ? `${Math.round(shift)}px 0` : "";
  };
  // Next frame: measured while mounting, the popover isn't in its final place
  // yet. Again on resize, so turning a phone keeps it on screen.
  const frame = requestAnimationFrame(place);
  window.addEventListener("resize", place);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", place);
  };
}
