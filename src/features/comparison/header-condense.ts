"use client";

import { useEffect, useState } from "react";

// Condensing removes height from a sticky header, which moves the content under
// it. With a single threshold that shift can push the page back across the line
// and toggle again, so the two edges are kept apart: condense well into the
// result, expand only back near the top.
export const CONDENSE_ENTER_Y = 96;
export const CONDENSE_EXIT_Y = 24;

export function shouldCondenseHeader(scrollY: number, condensed: boolean): boolean {
  if (scrollY > CONDENSE_ENTER_Y) return true;
  if (scrollY < CONDENSE_EXIT_Y) return false;
  return condensed;
}

/**
 * True once the buyer has scrolled far enough that the search summary has done
 * its job and the recommendation deserves the room.
 *
 * On a 375x812 viewport the results header measured 131px — 16% of the screen —
 * and held it for the whole page, so the recommendation was read a few lines at
 * a time. Most of the traffic this is built for is mobile.
 */
export function useCondensedHeader(): boolean {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      setCondensed((current) => shouldCondenseHeader(window.scrollY, current));
    };
    const onScroll = () => {
      // One read per frame: scroll fires far more often than the layout changes.
      if (frame === 0) frame = window.requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return condensed;
}
