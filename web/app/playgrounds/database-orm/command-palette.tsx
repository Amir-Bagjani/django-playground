"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "./command-palette.module.css";

export interface PaletteItem {
  id: string;
  kind: string;
  /** Display title (may be Persian). */
  title: string;
  /** Small secondary label (module code, group, …), always LTR. */
  subtitle: string;
  href: string;
  /** Pre-lowercased text to match against (built on the server). */
  keywords: string;
}

interface PaletteContextValue {
  open: () => void;
}

const PaletteContext = createContext<PaletteContextValue>({ open: () => {} });

export function useCommandPalette(): PaletteContextValue {
  return useContext(PaletteContext);
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function SearchButton({ className }: { className?: string }) {
  const { open } = useCommandPalette();
  return (
    <button
      type="button"
      className={`${styles.searchBtn} ${className ?? ""}`}
      onClick={open}
      aria-label="Search lessons, modules and pages"
    >
      <span className={styles.searchIcon} aria-hidden="true">
        <SearchIcon />
      </span>
      <span>Search</span>
      <kbd className={styles.kbd}>⌘K</kbd>
    </button>
  );
}

function Palette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 40);
    const tokens = q.split(/\s+/);
    return items
      .filter((item) => tokens.every((token) => item.keywords.includes(token)))
      .slice(0, 60);
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item: PaletteItem) => {
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[active];
      if (item) choose(item);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className={styles.overlay} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search lessons, modules and pages"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          autoFocus
          className={styles.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search lessons, modules, projects…"
          aria-label="Search"
        />
        {results.length > 0 ? (
          <ul className={styles.list} ref={listRef} role="listbox">
            {results.map((item, index) => (
              <li key={`${item.kind}-${item.id}`} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={`${styles.option} ${index === active ? styles.optionActive : ""}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  <span className={styles.optionTitle} dir="auto">
                    {item.title}
                  </span>
                  <span className={styles.optionMeta}>
                    <span className={styles.kind}>{item.kind}</span>
                    <span className={styles.optionSubtitle}>{item.subtitle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No matches for “{query}”.</p>
        )}
        <div className={styles.foot}>
          <span>
            <kbd className={styles.kbd}>↑</kbd> <kbd className={styles.kbd}>↓</kbd> navigate
          </span>
          <span>
            <kbd className={styles.kbd}>↵</kbd> open
          </span>
          <span>
            <kbd className={styles.kbd}>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteProvider({
  items,
  children,
}: {
  items: PaletteItem[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openPalette = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <PaletteContext.Provider value={{ open: openPalette }}>
      {children}
      {open ? <Palette items={items} onClose={() => setOpen(false)} /> : null}
    </PaletteContext.Provider>
  );
}
