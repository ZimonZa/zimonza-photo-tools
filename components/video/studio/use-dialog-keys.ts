"use client";

import { useCallback, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard handling for a modal dialog: Tab and Shift+Tab stay inside `ref`, and Escape calls
 * `onEscape` when given. Handled keys stop here, so a dialog inside another dialog owns its keys.
 * Put the result on the dialog's `onKeyDown`.
 */
export function useDialogKeys(ref: RefObject<HTMLElement>, onEscape?: () => void) {
  return useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const root = ref.current;
      if (!root) return;
      if (e.key === "Escape") {
        if (!onEscape) return;
        e.preventDefault();
        e.stopPropagation();
        onEscape();
        return;
      }
      if (e.key !== "Tab") return;
      e.stopPropagation();
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!root.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    },
    [ref, onEscape]
  );
}
