"use client";

import { useCallback, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keyboard handling for a dialog: Escape calls `onEscape` when given, and for a modal dialog (the
 * default) Tab and Shift+Tab stay inside `ref`. Handled keys stop here, so a dialog inside another
 * dialog owns its keys. Put the result on the dialog's `onKeyDown`. A non-modal dialog
 * (`{ modal: false }`) lets Tab leave.
 */
export function useDialogKeys(ref: RefObject<HTMLElement>, onEscape?: () => void, { modal = true }: { modal?: boolean } = {}) {
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
      if (e.key !== "Tab" || !modal) return;
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
    [ref, onEscape, modal]
  );
}
