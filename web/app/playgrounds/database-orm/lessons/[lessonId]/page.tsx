import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Markdown } from "../../../../components/markdown";
import { ThemeToggle } from "../../../../components/theme-toggle";
import {
  academyModules,
  getLabExercises,
  getLessonLocation,
  isAuthored,
  type AcademyLesson,
} from "@/lib/academy";

import { ErdLab } from "../../erd/erd-lab";
import { LessonLab } from "../../lab/lesson-lab";
import { SearchButton } from "../../command-palette";
import { StatusBadge } from "../../badge";
import { LessonProgressPanel, ProgressProvider } from "../../progress";
import styles from "../../academy.module.css";

interface PageProps {
  params: Promise<{ lessonId: string }>;
}

const flatLessons: AcademyLesson[] = academyModules.flatMap((module) => module.lessons);
const flatIndex = new Map(flatLessons.map((lesson, index) => [lesson.id, index]));

export function generateStaticParams() {
  return flatLessons.map((lesson) => ({ lessonId: lesson.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lessonId } = await params;
  const location = getLessonLocation(lessonId);
  if (!location) {
    return { title: "Lesson not found" };
  }
  return { title: `${location.lesson.id} — Database & ORM Academy` };
}

export default async function LessonPage({ params }: PageProps) {
  const { lessonId } = await params;
  const location = getLessonLocation(lessonId);

  if (!location) {
    notFound();
  }

  const { lesson, module, authored } = location;
  const authoredContent = isAuthored(location) ? authored : undefined;
  const status = authoredContent?.status ?? lesson.status;
  const allLabExercises = getLabExercises(lesson.id) ?? [];
  const labExercises = allLabExercises.filter((item) => item.kind !== "erd");
  const erdExercises = allLabExercises.filter((item) => item.kind === "erd");

  const index = flatIndex.get(lesson.id) ?? 0;
  const prev = index > 0 ? flatLessons[index - 1] : undefined;
  const next = index < flatLessons.length - 1 ? flatLessons[index + 1] : undefined;

  const isDraft = status === "draft";
  const wide = erdExercises.length > 0;

  return (
    <main className={styles.page}>
      <div className={`${styles.container} ${wide ? styles.containerWide : ""}`}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <Link href="/playgrounds/database-orm">Database &amp; ORM Academy</Link>
          <span className={styles.breadcrumbSep}>/</span>
          <span>{lesson.id}</span>
          <span className={styles.topActions}>
            <SearchButton />
            <ThemeToggle />
          </span>
        </nav>

        <div className={styles.lessonNav}>
          {prev ? (
            <Link href={`/playgrounds/database-orm/lessons/${prev.id}`}>
              ← {prev.id}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={`/playgrounds/database-orm/lessons/${next.id}`}>{next.id} →</Link>
          ) : (
            <span />
          )}
        </div>

        <header className={styles.lessonHeader}>
          <div className={styles.lessonEyebrow}>
            <span>{lesson.id}</span>
            <span className={styles.breadcrumbSep}>·</span>
            <span>{module.id}</span>
            <StatusBadge status={status} />
          </div>
          <h1 className={styles.lessonTitleFa} dir="rtl" lang="fa">
            {authoredContent?.title_fa || lesson.title_fa}
          </h1>
          <p className={styles.lessonOutcomeFa} dir="rtl" lang="fa">
            {lesson.outcome_fa}
          </p>
        </header>

        {authoredContent ? (
          <>
            {isDraft ? (
              <div className={`${styles.notice} ${styles.noticeDraft}`} dir="rtl" lang="fa">
                این درس یک نمونه‌ی <strong>پیش‌نویس</strong> برای نمایش فنی است و محتوای نهایی منتشرشده
                نیست. تا پس از بازبینی مستقل و تأیید اجرا، در وضعیت «منتشر‌نشده» باقی می‌ماند.
              </div>
            ) : null}
            <div className={`${styles.lessonBody} ${wide ? styles.lessonBodyWide : ""}`} dir="rtl" lang="fa">
              {authoredContent.objectives.length > 0 ? (
                <div className={styles.refs} style={{ marginTop: 0, borderTop: "none", paddingTop: 0 }}>
                  <div className={styles.refsTitle}>اهداف یادگیری</div>
                  <ul>
                    {authoredContent.objectives.map((objective, i) => (
                      <li key={i}>{objective}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Markdown markdown={authoredContent.markdown} />
            </div>
            {authoredContent.references.length > 0 ? (
              <div className={styles.refs}>
                <div className={styles.refsTitle}>References</div>
                <ul>
                  {authoredContent.references.map((reference, i) => (
                    <li key={i}>
                      <a href={reference.url} target="_blank" rel="noopener noreferrer">
                        {reference.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <div className={styles.notice} dir="rtl" lang="fa">
            این درس هنوز نوشته نشده است. محتوای آن در برنامه‌ی آموزشی ثبت شده (وضعیت «برنامه‌ریزی‌شده»)
            ولی متن، مثال و تمرین‌های آن پس از تألیف و بازبینی اضافه می‌شوند. هیچ محتوای ساختگی نمایش
            داده نمی‌شود.
          </div>
        )}

        {labExercises.length > 0 || erdExercises.length > 0 ? (
          <ProgressProvider>
            <LessonProgressPanel lessonId={lesson.id} />
            {labExercises.length > 0 ? <LessonLab exercises={labExercises} /> : null}
            {erdExercises.map((exercise) => (
              <ErdLab key={exercise.id} exercise={exercise} />
            ))}
          </ProgressProvider>
        ) : null}
      </div>
    </main>
  );
}
