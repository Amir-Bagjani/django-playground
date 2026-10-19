"use client";

import { useEffect, useState } from "react";

export type AppTheme = "dark" | "light";

/**
 * Tracks the active app theme (`data-theme` on <html>), so canvas-ish widgets
 * like the Monaco editor can follow the theme toggle without extra plumbing.
 */
export function useAppTheme(): AppTheme {
  const [theme, setTheme] = useState<AppTheme>("dark");

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}
