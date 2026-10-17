import type { Metadata } from "next";
import Link from "next/link";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Dev Playground",
  description: "Choose between the Django backend lab and the Database & ORM Academy.",
};

function DjangoIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 9h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 14.5 10 17l4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AcademyIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7" ry="2.6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 6v11.5c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export default function HubPage() {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <h1 className={styles.title}>Dev Playground</h1>
          <p className={styles.subtitle}>Choose a playground to launch.</p>
        </header>

        <section className={styles.grid} aria-label="Available playgrounds">
          <Link href="/playgrounds/django" className={styles.card}>
            <span className={styles.icon}>
              <DjangoIcon />
            </span>
            <span className={styles.cardBody}>
              <span className={styles.cardTitle}>Django Backend Playground</span>
              <span className={styles.cardText}>
                A freeform local lab: edit and run a Django project, exercise the REST API and
                inspect the SQLite database.
              </span>
            </span>
            <span className={styles.cardFoot}>
              <span className={`${styles.pill} ${styles.pillAvailable}`}>Available</span>
              <span className={styles.cta}>Open →</span>
            </span>
          </Link>

          <Link href="/playgrounds/database-orm" className={styles.card}>
            <span className={styles.icon}>
              <AcademyIcon />
            </span>
            <span className={styles.cardBody}>
              <span className={styles.cardTitle}>Database &amp; ORM Academy</span>
              <span className={styles.cardText}>
                A guided curriculum for relational design, MySQL and the Django ORM — 16 modules,
                176 planned lessons, browsable outline.
              </span>
            </span>
            <span className={styles.cardFoot}>
              <span className={`${styles.pill} ${styles.pillAvailable}`}>Available</span>
              <span className={styles.cta}>Open →</span>
            </span>
          </Link>
        </section>
      </div>
    </main>
  );
}
