import content from "./academy-content.json";

export type LessonStatus = "planned" | "draft" | "approved";
export type Parity = "equivalent" | "related" | "sql-only" | "orm-only";

export interface AcademyLesson {
  id: string;
  slug: string;
  title_fa: string;
  outcome_fa: string;
  status: LessonStatus;
  parity?: Parity | null;
  tracks: string[];
}

export interface AcademyModule {
  id: string;
  slug: string;
  title_fa: string;
  status: LessonStatus;
  focus?: string | null;
  lessons: AcademyLesson[];
}

export interface AcademyReference {
  label: string;
  url: string;
}

export type LabLevel = "practice" | "problem-solving" | "mastery";
export type LabKind = "sql" | "django-orm" | "erd" | "combined";

export interface LabStarterFile {
  name: string;
  language: string;
  content: string;
}

export interface LabCriterion {
  id: string;
  description_fa: string;
  visibility: "public" | "hidden";
}

export interface LabHint {
  id: string;
  text_fa: string;
}

export interface LabExercise {
  id: string;
  lesson_id: string;
  level: LabLevel;
  kind: LabKind;
  title_fa: string;
  instructions_markdown: string;
  starter: LabStarterFile[];
  criteria: LabCriterion[];
  hints: LabHint[];
  time_limit_seconds?: number | null;
}

export interface AuthoredLesson {
  id: string;
  slug: string;
  title_fa: string;
  status: LessonStatus;
  objectives: string[];
  references: AcademyReference[];
  estimated_minutes?: number | null;
  markdown: string;
}

interface AcademyContent {
  source: string;
  course: {
    id: string;
    title_en: string;
    title_fa: string;
    locale: string;
    ui_locale: string;
    content_version: string;
    framework_targets: Record<string, string>;
    access_policy: string;
  };
  modules: AcademyModule[];
  authored_lessons: Record<string, AuthoredLesson>;
  lab_lessons: Record<string, LabExercise[]>;
  totals: { modules: number; lessons: number; authored: number };
}

export const academy = content as AcademyContent;
export const academyModules = academy.modules;
export const authoredLessons = academy.authored_lessons;
export const labLessons = academy.lab_lessons;

export function getLabExercises(lessonId: string): LabExercise[] | undefined {
  return labLessons[lessonId];
}

export interface LessonLocation {
  lesson: AcademyLesson;
  module: AcademyModule;
  authored?: AuthoredLesson;
}

const lessonIndex = new Map<string, LessonLocation>();
for (const module of academyModules) {
  for (const lesson of module.lessons) {
    lessonIndex.set(lesson.id, {
      lesson,
      module,
      authored: authoredLessons[lesson.id],
    });
  }
}

export function getLessonLocation(id: string): LessonLocation | undefined {
  return lessonIndex.get(id);
}

export function isAuthored(location: LessonLocation): boolean {
  return Boolean(location.authored && location.authored.markdown.trim().length > 0);
}
