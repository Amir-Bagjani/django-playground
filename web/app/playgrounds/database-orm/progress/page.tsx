import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/app/components/theme-toggle";
import { academyModules } from "@/lib/academy";

import { SearchButton } from "../command-palette";
import { ProgressDashboard, ProgressProvider } from "../progress";
import styles from "../academy.module.css";

export const metadata: Metadata = {
  title: "Progress · Database & ORM Academy",
  description: "Your completion and mastery progress across the Academy.",
};

export default function AcademyProgressPage() {
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href="/playgrounds/database-orm">Database &amp; ORM Academy</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Progress</span>
          <span className={styles.topActions}>
            <SearchButton />
            <ThemeToggle />
          </span>
        </nav>

        <header>
          <h1 className={styles.dashPageTitle}>Progress</h1>
          <p className={styles.dashPageLead}>
            Completion and mastery across every runnable lesson you have attempted. Mastery means
            passing a lesson&rsquo;s exercises with at most one hint.
          </p>
        </header>

        <ProgressProvider>
          <ProgressDashboard modules={academyModules} />
        </ProgressProvider>
      </div>
    </main>
  );
}
