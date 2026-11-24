"use client";

import { useEffect, useState, type RefObject } from "react";
import type { Size } from "@/lib/video/geometry";

/** The size of `ref`'s element in whole pixels (null while it has none), kept up to date on resize. */
export function useElementSize(ref: RefObject<HTMLElement>): Size | null {
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      setSize((prev) => (w <= 0 || h <= 0 ? null : prev?.width === w && prev.height === h ? prev : { width: w, height: h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
