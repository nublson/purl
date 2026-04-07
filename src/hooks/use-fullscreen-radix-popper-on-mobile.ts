"use client";

import { useLayoutEffect, useRef } from "react";

const MOBILE_MAX_WIDTH_QUERY = "(max-width: 767px)";
const STYLE_BACKUP_DATASET_KEY = "radixPopperMobileFullscreenBackup";

export function useFullscreenRadixPopperOnMobile(open: boolean) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const wrapperRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) return;

    const getWrapper = () => {
      const el = contentRef.current;
      const parent = el?.parentElement;
      return parent?.hasAttribute("data-radix-popper-content-wrapper")
        ? parent
        : null;
    };

    const restoreWrapper = (wrapper: HTMLElement) => {
      const backup = wrapper.dataset[STYLE_BACKUP_DATASET_KEY];
      if (backup !== undefined) {
        wrapper.style.cssText = backup;
        delete wrapper.dataset[STYLE_BACKUP_DATASET_KEY];
      }
    };

    const apply = () => {
      const wrapper = getWrapper();
      if (!wrapper) return;

      wrapperRef.current = wrapper;

      const isMobile = window.matchMedia(MOBILE_MAX_WIDTH_QUERY).matches;
      if (!isMobile) {
        restoreWrapper(wrapper);
        return;
      }

      if (wrapper.dataset[STYLE_BACKUP_DATASET_KEY] === undefined) {
        wrapper.dataset[STYLE_BACKUP_DATASET_KEY] = wrapper.style.cssText;
      }

      Object.assign(wrapper.style, {
        position: "fixed",
        top: "0",
        left: "0",
        right: "0",
        bottom: "0",
        width: "100%",
        height: "100dvh",
        maxWidth: "none",
        minWidth: "0",
        transform: "none",
      });
    };

    apply();

    const mq = window.matchMedia(MOBILE_MAX_WIDTH_QUERY);
    mq.addEventListener("change", apply);

    let frames = 0;
    let raf = 0;
    const settle = () => {
      apply();
      frames += 1;
      if (frames < 8) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);

    return () => {
      mq.removeEventListener("change", apply);
      cancelAnimationFrame(raf);
      const wrapper = wrapperRef.current;
      if (wrapper) restoreWrapper(wrapper);
      wrapperRef.current = null;
    };
  }, [open]);

  return contentRef;
}
