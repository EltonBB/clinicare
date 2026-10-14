"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * A Link for repeated per-record rows (client/staff/appointment lists): it
 * prefetches on hover or keyboard focus instead of on entering the viewport.
 * A default Link in a 50-row list fires 50 background requests, each a full
 * server render with its own auth check, for pages that are mostly never opened.
 */
export function HoverPrefetchLink({ onMouseEnter, onFocus, ...props }: ComponentProps<typeof Link>) {
  const [active, setActive] = useState(false);

  return (
    <Link
      {...props}
      prefetch={active ? null : false}
      onMouseEnter={(event) => {
        setActive(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setActive(true);
        onFocus?.(event);
      }}
    />
  );
}
