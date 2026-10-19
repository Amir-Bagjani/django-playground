import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/app/components/theme-toggle";
import { academy, academyModules, academyProjects, authoredLessons, labLessons } from "@/lib/academy";

import { StatusBadge } from "./badge";
import { SearchButton } from "./command-palette";
import { LessonStatusChip, ProgressProvider, SyllabusProgressSummary } from "./progress";
import styles from "./academy.module.css";

export const metadata: Metadata = {
  title: "Database & ORM Academy",
  description: "Guided curriculum outline: relational design, MySQL and the Django ORM.",
};

export default function AcademySyllabusPage() {
  const { course, totals } = academy;
  const targets = Object.entries(course.framework_targets ?? {});

  const specs = [
    { value: String(totals.modules), label: "modules" },
    { value: String(totals.lessons), label: "planned lessons" },
    { value: String(totals.authored), label: "authored" },
    ...targets.map(([name, version]) => ({ value: String(version), label: name })),
  ];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>Database &amp; ORM Academy</span>
          <span className={styles.topActions}>
            <SearchButton />
            <ThemeToggle />
          </span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.heroInner}>
            <p className={styles.eyebrow}>
              Database &amp; ORM · content v{course.content_version}
            </p>
            <h1 className={styles.heroTitle}>{course.title_en}</h1>
            <p className={styles.heroTitleFa} dir="rtl" lang="fa">
              {course.title_fa}
            </p>
            <p className={styles.heroLead}>
              A guided path from relational thinking to real MySQL schemas and the Django ORM —
              lesson by lesson, with graded practice you write yourself.
            </p>
            <dl className={styles.specs}>
              {specs.map((spec) => (
                <div key={spec.label} className={styles.spec}>
                  <dt className={styles.specLabel}>{spec.label}</dt>
                  <dd className={styles.specValue}>{spec.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        <div className={styles.legendBar} aria-label="Lesson status key">
          <span className={styles.legendTitle}>Status</span>
          <span className={styles.legendItem}>
            <StatusBadge status="planned" /> not authored yet
          </span>
          <span className={styles.legendItem}>
            <StatusBadge status="draft" /> authored, pre-publish
          </span>
          <span className={styles.legendItem}>
            <StatusBadge status="in-review" /> under review
          </span>
          <span className={styles.legendItem}>
            <StatusBadge status="approved" /> published
          </span>
        </div>

        <ProgressProvider>
          <SyllabusProgressSummary modules={academyModules} />

          {academyProjects.length > 0 ? (
            <section className={styles.projectsSection} aria-label="Progressive projects">
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Progressive projects</h2>
                <span className={styles.sectionMeta}>
                  {academyProjects.length} project{academyProjects.length === 1 ? "" : "s"}
                </span>
              </div>
              {academyProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/playgrounds/database-orm/projects/${project.id}`}
                  className={styles.projectCard}
                >
                  <div className={styles.projectEyebrow}>
                    <span className={styles.projectTag}>Project</span>
                    <span className={styles.projectId}>{project.id}</span>
                    <StatusBadge status={project.status} />
                  </div>
                  <h3 className={styles.projectTitleFa} dir="rtl" lang="fa">
                    {project.title_fa}
                  </h3>
                  <p className={styles.projectDescFa} dir="rtl" lang="fa">
                    {project.description_fa}
                  </p>
                  <div className={styles.projectFoot}>
                    <span className={styles.projectMetric}>
                      <b>{project.executable_milestones.length}</b> runnable milestones
                    </span>
                    <span className={styles.projectMetric}>
                      <b>{project.milestones.length}</b> total
                    </span>
                    <span className={styles.projectCta}>Open project →</span>
                  </div>
                </Link>
              ))}
            </section>
          ) : null}

          <section className={styles.pathSection} aria-label="Course modules">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Curriculum</h2>
              <span className={styles.sectionMeta}>
                {totals.modules} modules · {totals.lessons} lessons
              </span>
            </div>
            <ol className={styles.pathList}>
              {academyModules.map((module) => {
                const authoredInModule = module.lessons.filter(
                  (lesson) => authoredLessons[lesson.id]
                ).length;
                return (
                  <li key={module.id} className={styles.pathItem}>
                    <span className={styles.pathNode} aria-hidden="true" />
                    <article className={styles.moduleCard}>
                      <header className={styles.moduleHead}>
                        <span className={styles.moduleId}>{module.id}</span>
                        <h3 className={styles.moduleTitleFa} dir="rtl" lang="fa">
                          {module.title_fa}
                        </h3>
                        {module.focus ? (
                          <span className={styles.moduleFocus}>{module.focus}</span>
                        ) : null}
                        <span className={styles.moduleCount}>
                          {authoredInModule > 0 ? (
                            <em className={styles.moduleAuthored}>{authoredInModule} authored · </em>
                          ) : null}
                          <b>{module.lessons.length}</b> lessons
                        </span>
                      </header>
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
                  </li>
                );
              })}
            </ol>
          </section>
        </ProgressProvider>
      </div>
    </main>
  );
}
