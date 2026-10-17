"use client";

import { useState, type ReactNode } from "react";

import styles from "./workspace-shell.module.css";

export interface WorkspaceShellProps {
  /** Side-panel heading, e.g. "Instructions". */
  asideTitle?: string;
  /** Label for the toggle button that shows/hides the side panel. */
  asideLabel?: string;
  aside: ReactNode;
  /** Left-hand toolbar content (tabs, save state, …). */
  toolbar?: ReactNode;
  /** Right-hand action buttons (Evaluate / Check / Reset / …). */
  actions?: ReactNode;
  /** Rendered under the workspace (verdicts, notes). */
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Shared layout for the ERD / SQL / ORM workspaces: an optional collapsible
 * side panel (instructions, criteria, hints) beside a dominant main region
 * (the canvas or the code editor). Kept deliberately small — it is pure layout
 * and owns no domain logic, so lessons and projects share the same chrome.
 */
export function WorkspaceShell({
  asideTitle = "Instructions",
  asideLabel = "Instructions",
  aside,
  toolbar,
  actions,
  footer,
  children,
}: WorkspaceShellProps) {
  const [asideOpen, setAsideOpen] = useState(true);

  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => setAsideOpen((value) => !value)}
          aria-pressed={asideOpen}
        >
          {asideOpen ? "◂" : "▸"} {asideLabel}
        </button>
        {toolbar ? <div className={styles.barGroup}>{toolbar}</div> : null}
        <span className={styles.spacer} />
        {actions ? <div className={styles.barGroup}>{actions}</div> : null}
      </div>

      <div className={`${styles.body} ${asideOpen ? "" : styles.bodyNoAside}`}>
        {asideOpen ? (
          <aside className={styles.aside} aria-label={asideTitle}>
            {aside}
          </aside>
        ) : null}
        <div className={styles.main}>{children}</div>
      </div>

      {footer}
    </div>
  );
}
