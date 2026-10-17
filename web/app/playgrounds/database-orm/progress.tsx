"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  EMPTY_PROGRESS,
  masteryRatio,
  moduleRatio,
  overallRatio,
  type AcademyModule,
  type AcademyProgress,
  type LessonProgressStatus,
  type ProgressRatio,
} from "@/lib/academy";

import styles from "./academy.module.css";

export const PROGRESS_EVENT = "academy:progress";

export function notifyProgress(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROGRESS_EVENT));
  }
}

async function loadProgress(): Promise<AcademyProgress> {
  try {
    const response = await fetch("/api/academy/v1/progress", { cache: "no-store" });
    if (!response.ok) return EMPTY_PROGRESS;
    return (await response.json()) as AcademyProgress;
  } catch {
    // Academy runner unreachable: show an honest empty state, not fake data.
    return EMPTY_PROGRESS;
  }
}

interface ProgressContextValue {
  progress: AcademyProgress;
  loaded: boolean;
  refresh: () => void;
}

const ProgressContext = createContext<ProgressContextValue>({
  progress: EMPTY_PROGRESS,
  loaded: false,
  refresh: () => {},
});

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<AcademyProgress>(EMPTY_PROGRESS);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    void loadProgress().then((next) => {
      setProgress(next);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener(PROGRESS_EVENT, handler);
    return () => window.removeEventListener(PROGRESS_EVENT, handler);
  }, [refresh]);

  const value = useMemo(() => ({ progress, loaded, refresh }), [progress, loaded, refresh]);
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressContextValue {
  return useContext(ProgressContext);
}

const STATUS_LABEL: Record<LessonProgressStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  mastered: "Mastered",
};

const STATUS_CLASS: Record<LessonProgressStatus, string> = {
  pending: styles.progressPending,
  in_progress: styles.progressInProgress,
  completed: styles.progressCompleted,
  mastered: styles.progressMastered,
};

export function ProgressBadge({ status }: { status: LessonProgressStatus }) {
  return (
    <span className={`${styles.progressBadge} ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function ProgressBar({ label, ratio }: { label: string; ratio: ProgressRatio }) {
  const percent = ratio.percent ?? 0;
  return (
    <div className={styles.progressBarRow}>
      <span>{label}</span>
      <span className={styles.progressBarTrack} aria-hidden="true">
        <span className={styles.progressBarFill} style={{ width: `${percent}%` }} />
      </span>
      <span className={styles.progressBarValue}>
        {ratio.completed}/{ratio.active} · {ratio.percent === null ? "—" : `${ratio.percent}%`}
      </span>
    </div>
  );
}

export function SyllabusProgressSummary({ modules }: { modules: AcademyModule[] }) {
  const { progress, loaded } = useProgress();
  const overall = overallRatio(progress);
  const mastery = masteryRatio(progress);
  const moduleRows = modules
    .map((module) => ({ module, ratio: moduleRatio(progress, module) }))
    .filter((row) => row.ratio.active > 0);

  return (
    <section className={styles.progressSummary} aria-label="Your progress">
      <div className={styles.progressHead}>
        <span className={styles.progressHeadTitle}>Your progress</span>
        <span className={styles.progressHint}>
          {!loaded
            ? "Loading…"
            : overall.active === 0
              ? "No runnable lessons yet"
              : `${overall.completed} of ${overall.active} runnable lessons completed`}
        </span>
      </div>
      <div className={styles.progressBars}>
        <ProgressBar label="Completed" ratio={overall} />
        <ProgressBar label="Mastered" ratio={mastery} />
      </div>
      {moduleRows.length > 0 ? (
        <ul className={styles.progressModules}>
          {moduleRows.map(({ module, ratio }) => (
            <li key={module.id} className={styles.progressModuleItem}>
              <span className={styles.progressModuleCode}>{module.id}</span>
              <span>
                {ratio.completed}/{ratio.active}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Per-row status chip for a syllabus lesson. Renders nothing unless the
 *  lesson has runnable exercises, so planned lessons stay honest. */
export function LessonStatusChip({ lessonId }: { lessonId: string }) {
  const { progress, loaded } = useProgress();
  const state = progress.lessons[lessonId];
  if (!loaded) return null;
  return <ProgressBadge status={state?.status ?? "pending"} />;
}

export function LessonProgressPanel({ lessonId }: { lessonId: string }) {
  const { progress, loaded } = useProgress();
  const state = progress.lessons[lessonId];

  return (
    <section className={styles.progressPanel} aria-label="Lesson progress">
      <div className={styles.progressPanelHead}>
        <span className={styles.progressPanelTitle}>Lesson progress</span>
        {loaded ? <ProgressBadge status={state?.status ?? "pending"} /> : null}
      </div>
      {!loaded ? (
        <p className={styles.progressMuted}>Loading progress…</p>
      ) : !state ? (
        <p className={styles.progressMuted}>
          No attempts yet. Pass the required exercises with <em>Check Solution</em> to complete
          this lesson.
        </p>
      ) : (
        <>
          <p className={styles.progressMuted}>
            Required: {state.requiredPassed}/{state.requiredTotal} passed
            {state.masteryTotal > 0
              ? ` · Mastery: ${state.masteryPassed}/${state.masteryTotal}`
              : ""}
          </p>
          <ul className={styles.progressExerciseList}>
            {Object.entries(state.exercises).map(([exerciseId, exercise]) => (
              <li key={exerciseId} className={styles.progressExercise}>
                <span className={styles.progressExerciseName}>{exerciseId}</span>
                <span>
                  {exercise.passed ? "✓ passed" : exercise.attempts > 0 ? "not passed yet" : "not attempted"}
                </span>
                {exercise.legacy ? (
                  <span className={styles.progressLegacy}>· earlier assessment version</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
