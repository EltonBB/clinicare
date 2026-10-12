/**
 * How many rows of `rowHeight`, `gap` apart, fit in `space` pixels. Always at
 * least one: a column or cell too short for a single row still shows one rather
 * than nothing.
 */
export function rowsThatFit(space: number, rowHeight: number, gap: number) {
  if (!(rowHeight > 0) || !Number.isFinite(space)) {
    return 1;
  }

  return Math.max(1, Math.floor((space + gap) / (rowHeight + gap)));
}

/**
 * How many entries to draw in `slots` rows: all of them when they fit, otherwise
 * one row fewer, so the last row can be the "+N more" link.
 */
export function visibleEntryCount(total: number, slots: number) {
  return total <= slots ? total : Math.max(slots - 1, 0);
}
