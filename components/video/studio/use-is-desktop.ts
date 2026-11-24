"use client";

import { useEffect, useState } from "react";

/** Tailwind's `lg` breakpoint: desktop layout B at and above it, the phone layout below. */
const DESKTOP_QUERY = "(min-width: 1024px)";

/**
 * Whether the desktop layout is showing. Parts that exist once (the tool's settings, the estimate
 * line, the crop editor) use it to render in one place only.
 */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_QUERY).matches
  );
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const update = () => setDesktop(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return desktop;
}
