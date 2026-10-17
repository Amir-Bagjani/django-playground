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
  evaluation: "auto" | "manual";
  rubric_fa?: string | null;
}

export interface LabHint {
  id: string;
  text_fa: string;
}

export type ErdCardinality = "one" | "many";
export type ErdOptionality = "mandatory" | "optional";

export interface ErdAttribute {
  id: string;
  name: string;
  type: string;
  nullable: boolean;
  primaryKey: boolean;
  unique: boolean;
}

export interface ErdEntity {
  id: string;
  name: string;
  attributes: ErdAttribute[];
  position?: { x: number; y: number };
  note_fa?: string;
}

export interface ErdRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  fromCardinality: ErdCardinality;
  toCardinality: ErdCardinality;
  optionality: ErdOptionality;
  foreignKeyAttributeId?: string | null;
  note_fa?: string;
}

export interface ErdGraph {
  schema_version: 1;
  entities: ErdEntity[];
  relationships: ErdRelationship[];
  notes?: string;
  caption_fa?: string;
}

export interface LabExercise {
  id: string;
  lesson_id: string;
  level: LabLevel;
  kind: LabKind;
  required_for_completion: boolean;
  assessment_version: number;
  title_fa: string;
  instructions_markdown: string;
  starter: LabStarterFile[];
  example_graph?: ErdGraph | null;
  criteria: LabCriterion[];
  hint_count: number;
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

export type ProjectStageKind = "erd" | "sql" | "orm" | "";

export interface ProjectMilestone {
  id: string;
  title_fa: string;
  description_fa: string;
  objectives_fa: string[];
  acceptance_criteria_fa: string[];
  depends_on: string[];
  checkpoint_id: string;
  stage_kind: ProjectStageKind;
  executable: boolean;
  assessment_version: number;
  criteria: LabCriterion[];
  hint_count: number;
  instructions_markdown: string;
  title: string;
  starter: LabStarterFile[];
  example_graph?: ErdGraph | null;
}

export interface AcademyProject {
  id: string;
  title_fa: string;
  status: LessonStatus;
  domain: string;
  detail_level: string;
  description_fa: string;
  milestones: ProjectMilestone[];
  executable_milestones: string[];
}

export interface ProjectWorkspaceState {
  erd?: ErdGraph | null;
  sql?: string;
  orm?: string;
  notes?: string;
}

export interface ProjectMilestoneProgress {
  milestoneId: string;
  passed: boolean;
  passedAssessmentVersion: number | null;
  currentAssessmentVersion: number;
  legacy: boolean;
  available: boolean;
  dependencies: string[];
  checkpointId: string;
  checkpointAvailable: boolean;
}

export interface ProjectProgress {
  projectId: string;
  milestones: Record<string, ProjectMilestoneProgress>;
  totals: {
    executableMilestones: number;
    passedMilestones: number;
    checkpoints: number;
  };
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
  projects?: AcademyProject[];
  totals: { modules: number; lessons: number; authored: number; projects?: number };
}

export const academy = content as AcademyContent;
export const academyModules = academy.modules;
export const authoredLessons = academy.authored_lessons;
export const labLessons = academy.lab_lessons;
export const academyProjects: AcademyProject[] = academy.projects ?? [];

export function getProject(projectId: string): AcademyProject | undefined {
  return academyProjects.find((project) => project.id === projectId);
}

export function getMilestone(
  project: AcademyProject,
  milestoneId: string
): ProjectMilestone | undefined {
  return project.milestones.find((milestone) => milestone.id === milestoneId);
}

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

export type LessonProgressStatus = "pending" | "in_progress" | "completed" | "mastered";

export interface ExerciseProgress {
  level: LabLevel;
  required: boolean;
  passed: boolean;
  passedAssessmentVersion: number | null;
  currentAssessmentVersion: number;
  legacy: boolean;
  lastStatus: string | null;
  lastOutcome: string | null;
  attempts: number;
}

export interface LessonProgress {
  lessonId: string;
  status: LessonProgressStatus;
  completed: boolean;
  mastered: boolean;
  legacy: boolean;
  requiredTotal: number;
  requiredPassed: number;
  masteryTotal: number;
  masteryPassed: number;
  exercises: Record<string, ExerciseProgress>;
}

export interface AcademyProgress {
  schemaVersion: number;
  lessons: Record<string, LessonProgress>;
  totals: {
    trackedLessons: number;
    completed: number;
    mastered: number;
    attempts: number;
    passes: number;
  };
}

export const EMPTY_PROGRESS: AcademyProgress = {
  schemaVersion: 0,
  lessons: {},
  totals: { trackedLessons: 0, completed: 0, mastered: 0, attempts: 0, passes: 0 },
};

/** Lessons that have at least one runnable exercise ("active" for progress). */
export function activeLabLessonIds(): string[] {
  return Object.keys(labLessons);
}

export interface ProgressRatio {
  completed: number;
  active: number;
  percent: number | null;
}

function ratio(progress: AcademyProgress, ids: string[], pick: (p: LessonProgress) => boolean): ProgressRatio {
  const active = ids.filter((id) => id in labLessons);
  const completed = active.filter((id) => {
    const state = progress.lessons[id];
    return state ? pick(state) : false;
  }).length;
  return {
    completed,
    active: active.length,
    percent: active.length ? Math.round((completed / active.length) * 100) : null,
  };
}

/** Numerator/denominator are explicit; no hidden rounding assumptions. */
export function overallRatio(progress: AcademyProgress): ProgressRatio {
  return ratio(progress, activeLabLessonIds(), (state) => state.completed);
}

export function masteryRatio(progress: AcademyProgress): ProgressRatio {
  return ratio(progress, activeLabLessonIds(), (state) => state.mastered);
}

export function moduleRatio(progress: AcademyProgress, module: AcademyModule): ProgressRatio {
  return ratio(progress, module.lessons.map((lesson) => lesson.id), (state) => state.completed);
}
