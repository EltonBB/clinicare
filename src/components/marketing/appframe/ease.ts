/**
 * One easing source for the marketing app panes so the curve never drifts across
 * files. `EASE` is the framer-motion bezier tuple; `EASE_CSS` is the same curve as
 * a CSS `cubic-bezier()` string (for inline `style`/`transition` on raw elements).
 */
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_CSS = "cubic-bezier(0.16,1,0.3,1)";
