import type { Metadata } from "next";
import Link from "next/link";

import { ThemeToggle } from "@/app/components/theme-toggle";
import { academy, academyModules, academyProjects, authoredLessons, labLessons } from "@/lib/academy";

import { StatusBadge } from "./badge";
import { CourseCatalog, type CatalogModule } from "./catalog";
import { SearchButton } from "./command-palette";
import { ProgressProvider, SyllabusProgressSummary } from "./progress";
import academyStyles from "./academy.module.css";
import catalogStyles from "./catalog.module.css";

export const metadata: Metadata = {
  title: "Database & ORM Academy",
  description: "The curriculum as a queryable catalog: relational design, MySQL and the Django ORM.",
};

export default function AcademySyllabusPage() {
  const { course, totals } = academy;
  const targets = Object.entries(course.framework_targets ?? {});

  const schema: Array<[string, string]> = [
    ["modules", String(totals.modules)],
    ["lessons", String(totals.lessons)],
    ["authored", String(totals.authored)],
    ...targets.map(([name, version]) => [name.toLowerCase(), String(version)] as [string, string]),
  ];

  const catalogModules: CatalogModule[] = academyModules.map((module) => ({
    id: module.id,
    titleFa: module.title_fa,
    focus: module.focus ?? "",
    lessons: module.lessons.map((lesson) => ({
      id: lesson.id,
      titleFa: authoredLessons[lesson.id]?.title_fa || lesson.title_fa,
      outcomeFa: lesson.outcome_fa,
      status: authoredLessons[lesson.id]?.status ?? lesson.status,
      runnable: Boolean(labLessons[lesson.id]),
    })),
  }));

  return (
    <main className={academyStyles.page}>
      <div className={academyStyles.container}>
        <nav className={academyStyles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={academyStyles.breadcrumbSep}>/</span>
          <span>Database &amp; ORM Academy</span>
          <span className={academyStyles.topActions}>
            <SearchButton />
            <ThemeToggle />
          </span>
        </nav>

        <header className={catalogStyles.head}>
          <p className={catalogStyles.eyebrow}>
            Database &amp; ORM · content v{course.content_version}
          </p>
          <div className={catalogStyles.titleRow}>
            <h1 className={catalogStyles.title}>{course.title_en}</h1>
            <p className={catalogStyles.titleFa} dir="rtl" lang="fa">
              {course.title_fa}
            </p>
          </div>
          <p className={catalogStyles.lead}>
            The whole curriculum as a queryable catalog. Filter by module, status or title, then
            open any lesson — authored lessons include graded SQL and ORM practice you write
            yourself.
          </p>
          <dl className={catalogStyles.schema}>
            {schema.map(([key, value]) => (
              <div key={key} className={catalogStyles.schemaCell}>
                <dt className={catalogStyles.schemaKey}>{key}</dt>
                <dd className={catalogStyles.schemaVal}>{value}</dd>
              </div>
            ))}
          </dl>
        </header>

        <ProgressProvider>
          <CourseCatalog modules={catalogModules} />

          {academyProjects.length > 0 ? (
            <section className={catalogStyles.projects} aria-label="Progressive projects">
              <h2 className={catalogStyles.sectionLabel}>projects</h2>
              {academyProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/playgrounds/database-orm/projects/${project.id}`}
                  className={catalogStyles.projectRow}
                >
                  <span className={catalogStyles.projectTop}>
                    <span className={catalogStyles.projectId}>{project.id}</span>
                    <span className={catalogStyles.projectTitle} dir="rtl" lang="fa">
                      {project.title_fa}
                    </span>
                    <StatusBadge status={project.status} />
                  </span>
                  <p className={catalogStyles.projectDesc} dir="rtl" lang="fa">
                    {project.description_fa}
                  </p>
                  <span className={catalogStyles.projectFoot}>
                    <span className={catalogStyles.projectMeta}>
                      {project.executable_milestones.length} runnable · {project.milestones.length}{" "}
                      milestones
                    </span>
                    <span className={catalogStyles.projectCta}>open →</span>
                  </span>
                </Link>
              ))}
            </section>
          ) : null}

          <div className={catalogStyles.summarySlot}>
            <SyllabusProgressSummary modules={academyModules} />
          </div>
        </ProgressProvider>
      </div>
    </main>
  );
}
