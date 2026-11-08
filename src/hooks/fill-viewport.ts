/**
 * Callback ref for a panel that fills the rest of the screen (Calendar grid,
 * Inbox, Automations). It keeps `--fill-top` on the element at its distance
 * from the top of the page, so a class like
 * `lg:h-[calc(100dvh-var(--fill-top,230px)-1rem)]` holds whatever sits above
 * it: a toolbar that wraps, a billing or WhatsApp banner, a short laptop
 * screen. The fixed offsets it replaces were right for one header height only.
 * The var's fallback covers the first paint, before this runs.
 *
 * Module-level so its identity is stable: React calls it once per mounted
 * element and runs the returned cleanup on unmount.
 */
export function fillViewportRef(element: HTMLElement | null) {
  if (!element) {
    return;
  }

  const update = () => {
    const top = Math.round(element.getBoundingClientRect().top + window.scrollY);
    element.style.setProperty("--fill-top", `${top}px`);
  };

  update();
  // Anything above the panel changing height (a banner, a toolbar that wraps
  // on a narrower window) changes the body's height too; the screen's own
  // height is the `100dvh` in the class. The update waits a frame: resizing
  // the panel from inside the observer's own callback is what trips the
  // browser's "ResizeObserver loop" error.
  let frame = 0;
  const observer = new ResizeObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  });
  observer.observe(document.body);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
