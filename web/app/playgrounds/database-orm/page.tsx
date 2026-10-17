import type { Metadata } from "next";
import Link from "next/link";

import { academy, academyModules, authoredLessons, labLessons } from "@/lib/academy";

import { StatusBadge } from "./badge";
import { LessonStatusChip, ProgressProvider, SyllabusProgressSummary } from "./progress";
import styles from "./academy.module.css";

export const metadata: Metadata = {
  title: "Database & ORM Academy",
  description: "Guided curriculum outline: relational design, MySQL and the Django ORM.",
};

export default function AcademySyllabusPage() {
  const { course, totals } = academy;
  const targets = Object.entries(course.framework_targets ?? {});

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Database &amp; ORM Academy</span>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.courseTitle}>{course.title_en}</h1>
          <p className={styles.courseTitleFa} dir="rtl" lang="fa">
            {course.title_fa}
          </p>
          <div className={styles.meta}>
            <span className={styles.chip}>{totals.modules} modules</span>
            <span className={styles.chip}>{totals.lessons} planned lessons</span>
            <span className={styles.chip}>{totals.authored} authored</span>
            <span className={styles.chip}>content v{course.content_version}</span>
            {targets.map(([name, version]) => (
              <span key={name} className={styles.chip}>
                {name} {version}
              </span>
            ))}
          </div>
        </header>

        <div className={styles.legend} aria-label="Lesson status legend">
          <span className={styles.legendItem}>
            <StatusBadge status="planned" /> outline only, not yet authored
          </span>
          <span className={styles.legendItem}>
            <StatusBadge status="draft" /> authored for review, not published
          </span>
          <span className={styles.legendItem}>
            <StatusBadge status="approved" /> published
          </span>
        </div>

        <ProgressProvider>
          <SyllabusProgressSummary modules={academyModules} />

          <section className={styles.moduleList} aria-label="Course modules">
            {academyModules.map((module) => (
              <article key={module.id} className={styles.moduleCard}>
                <div className={styles.moduleHead}>
                  <span className={styles.moduleId}>{module.id}</span>
                  <span className={styles.moduleTitleFa} dir="rtl" lang="fa">
                    {module.title_fa}
                  </span>
                  <span className={styles.moduleCount}>{module.lessons.length} lessons</span>
                </div>
                <div className={styles.lessonList}>
                  {module.lessons.map((lesson) => (
                    <Link
                      key={lesson.id}
                      href={`/playgrounds/database-orm/lessons/${lesson.id}`}
                      className={styles.lessonRow}
                    >
                      <span className={styles.lessonId}>{lesson.id}</span>
                      <span className={styles.lessonMain}>
                        <span className={styles.lessonTitleFa} dir="rtl" lang="fa">
                          {lesson.title_fa}
                        </span>
                        <span className={styles.lessonOutcomeFa} dir="rtl" lang="fa">
                          {lesson.outcome_fa}
                        </span>
                      </span>
                      <span className={styles.lessonAside}>
                        {labLessons[lesson.id] ? <LessonStatusChip lessonId={lesson.id} /> : null}
                        <StatusBadge status={authoredLessons[lesson.id]?.status ?? lesson.status} />
                      </span>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </ProgressProvider>
      </div>
    </main>
  );
}
