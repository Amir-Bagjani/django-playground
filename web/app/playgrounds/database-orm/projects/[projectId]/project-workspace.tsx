"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Editor, { loader } from "@monaco-editor/react";

import type {
  AcademyProject,
  ErdGraph,
  LabHint,
  ProjectMilestone,
  ProjectProgress,
  ProjectWorkspaceState,
} from "@/lib/academy";

import { Markdown } from "../../../../components/markdown";
import { ErdDesigner } from "../../erd/erd-designer";
import { emptyGraph, parseGraph } from "../../erd/graph";
import { WorkspaceShell } from "../../workspace-shell";
import shellStyles from "../../workspace-shell.module.css";
import styles from "../project.module.css";

loader.config({ paths: { vs: "/monaco/vs" } });

interface EvaluationCheck {
  criterionId: string;
  status: "passed" | "failed" | "needs_manual_review" | "not_evaluated";
  messageFa: string;
  location?: { file?: string; line?: number } | null;
  hintAvailable: boolean;
}

interface EvaluationResult {
  status: "passed" | "failed" | "error" | "timeout" | "system_error";
  outcome: string;
  passed: boolean;
  checks: EvaluationCheck[];
  error: string | null;
  progress?: ProjectProgress;
  checkpointId?: string;
}

const CHECK_MARK: Record<EvaluationCheck["status"], { glyph: string; className: string }> = {
  passed: { glyph: "✓", className: shellStyles.markPass },
  failed: { glyph: "✗", className: shellStyles.markFail },
  needs_manual_review: { glyph: "…", className: shellStyles.markManual },
  not_evaluated: { glyph: "•", className: "" },
};

const STAGE_LABEL: Record<string, string> = { erd: "ERD", sql: "SQL", orm: "Django ORM" };

async function callApi(method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { status: "system_error", error: `پاسخ نامعتبر از سرور (HTTP ${response.status}).` };
  }
}

function starterFor(project: AcademyProject, stage: string): string {
  const milestone = project.milestones.find((item) => item.stage_kind === stage);
  return milestone?.starter[0]?.content ?? "";
}

function initialWorkspace(project: AcademyProject, stored: ProjectWorkspaceState | null): ProjectWorkspaceState {
  return {
    erd: stored?.erd ?? parseGraph(starterFor(project, "erd")) ?? emptyGraph(),
    sql: stored?.sql ?? starterFor(project, "sql"),
    orm: stored?.orm ?? starterFor(project, "orm"),
    notes: stored?.notes ?? "",
  };
}

export function ProjectWorkspace({ project }: { project: AcademyProject }) {
  const executable = useMemo(
    () => project.milestones.filter((milestone) => milestone.executable),
    [project.milestones],
  );

  const [ready, setReady] = useState(false);
  const [state, setState] = useState<ProjectWorkspaceState>(() => initialWorkspace(project, null));
  const [progress, setProgress] = useState<ProjectProgress | null>(null);
  const [currentMilestoneId, setCurrentMilestoneId] = useState<string>(executable[0]?.id ?? "");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [hints, setHints] = useState<Record<string, LabHint[]>>({});

  const savedRef = useRef<string>("");

  const active: ProjectMilestone | undefined = useMemo(
    () => project.milestones.find((milestone) => milestone.id === currentMilestoneId),
    [project.milestones, currentMilestoneId],
  );

  // Load persisted workspace + progress on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await callApi("GET", `/api/academy/v1/projects/${project.id}`);
      if (cancelled) return;
      const workspace = (data.workspace as { state?: ProjectWorkspaceState; currentMilestone?: string } | undefined) ?? {};
      const next = initialWorkspace(project, workspace.state ?? null);
      setState(next);
      savedRef.current = JSON.stringify(next);
      if (workspace.currentMilestone) setCurrentMilestoneId(workspace.currentMilestone);
      if (data.progress) setProgress(data.progress as ProjectProgress);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [project]);

  // Debounced auto-save so a refresh or restart never loses the workspace.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(state);
    if (serialized === savedRef.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      await callApi("PUT", `/api/academy/v1/projects/${project.id}/workspace`, {
        state,
        currentMilestone: currentMilestoneId,
      });
      savedRef.current = serialized;
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(handle);
  }, [state, ready, project.id, currentMilestoneId]);

  const setErd = useCallback((erd: ErdGraph) => setState((prev) => ({ ...prev, erd })), []);
  const setNotes = useCallback((notes: string) => setState((prev) => ({ ...prev, notes })), []);

  const doEvaluate = useCallback(async () => {
    if (!active) return;
    setBusy("evaluate");
    try {
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/milestones/${active.id}/evaluate`,
        { state },
      );
      const payload = data as unknown as EvaluationResult;
      setEvaluation(payload);
      if (payload.progress) setProgress(payload.progress);
      // Persist the just-evaluated content locally too.
      savedRef.current = JSON.stringify(state);
      setSaveState("saved");
    } finally {
      setBusy(null);
    }
  }, [active, project.id, state]);

  const doHint = useCallback(async () => {
    if (!active) return;
    setBusy("hint");
    try {
      const shown = hints[active.id] ?? [];
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/milestones/${active.id}/hints/next`,
        { revealed: shown.length },
      );
      const hint = data.hint as LabHint | null;
      if (hint) setHints((prev) => ({ ...prev, [active.id]: [...(prev[active.id] ?? []), hint] }));
    } finally {
      setBusy(null);
    }
  }, [active, project.id, hints]);

  const doRestoreCheckpoint = useCallback(async () => {
    if (!active) return;
    const checkpointAvailable = progress?.milestones[active.id]?.checkpointAvailable;
    if (!checkpointAvailable) return;
    const ok = window.confirm(
      "Restore the last valid checkpoint for this milestone? This replaces the current workspace and the milestone database with the checkpointed state. Your progress and other milestones are not affected.",
    );
    if (!ok) return;
    setBusy("restore");
    try {
      const data = await callApi(
        "POST",
        `/api/academy/v1/projects/${project.id}/checkpoints/${active.checkpoint_id}/restore`,
      );
      if (data.status === "ok") {
        const workspace = data.workspace as { state?: ProjectWorkspaceState; currentMilestone?: string };
        const next = initialWorkspace(project, workspace.state ?? null);
        setState(next);
        savedRef.current = JSON.stringify(next);
        setEvaluation(null);
      } else {
        setEvaluation({ status: "system_error", outcome: "restore_failed", passed: false, checks: [], error: String(data.detail ?? data.error ?? "بازگردانی ناموفق بود.") });
      }
      const refreshed = await callApi("GET", `/api/academy/v1/projects/${project.id}`);
      if (refreshed.progress) setProgress(refreshed.progress as ProjectProgress);
    } finally {
      setBusy(null);
    }
  }, [active, progress, project]);

  const doReset = useCallback(async () => {
    const ok = window.confirm(
      "Reset the workspace to the starter for this project? This clears your current drafts and the project databases. Earned progress and checkpoints are kept.",
    );
    if (!ok) return;
    setBusy("reset");
    try {
      const data = await callApi("POST", `/api/academy/v1/projects/${project.id}/reset`);
      const workspace = (data.workspace as { state?: ProjectWorkspaceState } | undefined) ?? {};
      const next = initialWorkspace(project, workspace.state ?? null);
      setState(next);
      savedRef.current = JSON.stringify(next);
      setEvaluation(null);
      if (data.progress) setProgress(data.progress as ProjectProgress);
    } finally {
      setBusy(null);
    }
  }, [project]);

  const milestoneState = progress?.milestones ?? {};
  const checkById = new Map(evaluation?.checks.map((check) => [check.criterionId, check]) ?? []);
  const shownHints = active ? hints[active.id] ?? [] : [];
  const erd = state.erd ?? emptyGraph();

  const aside = (
    <>
      <div className={shellStyles.paneHead}>Instructions</div>
      <div className={shellStyles.instructions} dir="rtl" lang="fa">
        {active?.executable ? (
          <Markdown markdown={active.instructions_markdown} />
        ) : (
          <p className={shellStyles.note} dir="rtl" lang="fa">
            این مرحله هنوز قابل‌اجرا نیست و فقط برای نمایش مسیر پروژه است. مرحله‌های اجرایی را از نوار بالا انتخاب کن.
          </p>
        )}
      </div>

      {active && active.criteria.length > 0 ? (
        <div className={shellStyles.criteriaBox}>
          <div className={shellStyles.criteriaTitle}>معیارهای قبولی</div>
          <ul className={shellStyles.criteriaList}>
            {active.criteria.map((criterion) => {
              const check = checkById.get(criterion.id);
              const mark = check ? CHECK_MARK[check.status] : { glyph: "•", className: "" };
              return (
                <li key={criterion.id} className={shellStyles.checkItem} dir="rtl" lang="fa">
                  <span className={shellStyles.criterion}>
                    <span className={`${shellStyles.criterionMark} ${mark.className}`}>{mark.glyph}</span>
                    <span>
                      {criterion.description_fa}
                      {criterion.evaluation === "manual" ? " (بازبینی دستی)" : ""}
                    </span>
                  </span>
                  {check && (check.status === "failed" || check.status === "needs_manual_review") ? (
                    <span className={shellStyles.checkMessage}>{check.messageFa}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {active && active.executable && active.hint_count > 0 ? (
        <div className={shellStyles.hints}>
          <button
            type="button"
            className={shellStyles.hintBtn}
            onClick={doHint}
            disabled={busy !== null || shownHints.length >= active.hint_count}
          >
            Hint ({shownHints.length}/{active.hint_count})
          </button>
          <ul className={shellStyles.hintList} dir="rtl" lang="fa">
            {shownHints.map((hint) => (
              <li key={hint.id}>{hint.text_fa}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <a href="/playgrounds/database-orm">Database &amp; ORM Academy</a>
          <span>/</span>
          <span>Projects</span>
        </nav>

        <header className={styles.header}>
          <h1 className={styles.projectTitle}>{project.title_fa}</h1>
          <p className={styles.projectTitleFa} dir="rtl" lang="fa">
            {project.description_fa}
          </p>
          <div className={styles.summary}>
            <span className={styles.chip}>{project.domain}</span>
            <span className={styles.chip}>
              {progress?.totals.passedMilestones ?? 0}/{progress?.totals.executableMilestones ?? executable.length} milestones
            </span>
            <span className={styles.chip}>{progress?.totals.checkpoints ?? 0} checkpoints</span>
          </div>
        </header>

        <div className={styles.roadmap} role="tablist" aria-label="Milestones">
          {project.milestones.map((milestone, index) => {
            const stateInfo = milestoneState[milestone.id];
            const locked = milestone.executable && stateInfo ? !stateInfo.available && !stateInfo.passed : false;
            const passed = Boolean(stateInfo?.passed);
            return (
              <button
                key={milestone.id}
                type="button"
                role="tab"
                aria-selected={milestone.id === currentMilestoneId}
                disabled={!milestone.executable || locked}
                className={`${styles.step} ${milestone.id === currentMilestoneId ? styles.stepActive : ""} ${
                  passed ? styles.stepPassed : ""
                } ${locked ? styles.stepLocked : ""}`}
                onClick={() => {
                  setCurrentMilestoneId(milestone.id);
                  setEvaluation(null);
                }}
              >
                <span className={styles.stepMeta}>
                  {index + 1}. {milestone.executable ? STAGE_LABEL[milestone.stage_kind] ?? milestone.stage_kind : "planning"}
                  {passed ? " · ✓" : locked ? " · locked" : ""}
                </span>
                <span className={styles.stepTitle} dir="rtl" lang="fa">
                  {milestone.title_fa}
                </span>
              </button>
            );
          })}
        </div>

        <WorkspaceShell
          aside={aside}
          toolbar={
            <span className={shellStyles.saveState}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Auto-save on"}
            </span>
          }
          actions={
            <>
              <button
                type="button"
                className={shellStyles.primary}
                onClick={doEvaluate}
                disabled={busy !== null || !active?.executable}
              >
                {busy === "evaluate" ? "Evaluating…" : "Evaluate milestone"}
              </button>
              <button
                type="button"
                className={shellStyles.secondary}
                onClick={doRestoreCheckpoint}
                disabled={busy !== null || !active || !progress?.milestones[active.id]?.checkpointAvailable}
              >
                {busy === "restore" ? "Restoring…" : "Restore checkpoint"}
              </button>
              <button type="button" className={shellStyles.danger} onClick={doReset} disabled={busy !== null}>
                {busy === "reset" ? "Resetting…" : "Reset workspace"}
              </button>
            </>
          }
          footer={
            <>
              {evaluation ? (
                <div
                  className={`${shellStyles.verdict} ${
                    evaluation.status === "system_error"
                      ? shellStyles.verdictSystem
                      : evaluation.passed
                        ? shellStyles.verdictPass
                        : shellStyles.verdictFail
                  }`}
                  dir={evaluation.status === "system_error" ? "ltr" : "rtl"}
                  lang="fa"
                >
                  {evaluation.status === "system_error"
                    ? evaluation.error ?? "خطای سیستمی رخ داد؛ این مورد به‌عنوان پاسخ غلط ثبت نمی‌شود."
                    : evaluation.passed
                      ? `آفرین! معیارهای خودکار برآورده شدند و یک Checkpoint برای این مرحله ثبت شد.`
                      : evaluation.status === "timeout" || evaluation.outcome === "deadline_exceeded"
                        ? "اجرای کد بیش از حد طول کشید و متوقف شد."
                        : evaluation.outcome === "syntax_error"
                          ? "کد خطا داد؛ خطای واقعی را ببین و اصلاح کن."
                          : "بعضی معیارها برآورده نشد؛ توضیح هر معیار را ببین و اصلاح کن."}
                </div>
              ) : null}

              {active && progress?.milestones[active.id]?.passed ? (
                <p className={shellStyles.note} dir="rtl" lang="fa">
                  این مرحله قبلاً با موفقیت گذرانده شده است؛ آخرین Checkpoint آن قابل بازگردانی است.
                </p>
              ) : null}
            </>
          }
        >
          {active?.executable && active.stage_kind === "erd" ? (
            <ErdDesigner
              key={active.id}
              graph={erd}
              onChange={setErd}
              notes={state.notes ?? ""}
              onNotesChange={setNotes}
            />
          ) : active?.executable && (active.stage_kind === "sql" || active.stage_kind === "orm") ? (
            <div className={styles.editorHost}>
              <Editor
                key={active.id}
                path={`project-${project.id}-${active.id}.${active.stage_kind === "sql" ? "sql" : "py"}`}
                value={active.stage_kind === "sql" ? state.sql ?? "" : state.orm ?? ""}
                language={active.stage_kind === "sql" ? "sql" : "python"}
                theme="vs-dark"
                onChange={(value) =>
                  setState((prev) =>
                    active.stage_kind === "sql" ? { ...prev, sql: value ?? "" } : { ...prev, orm: value ?? "" },
                  )
                }
                options={{
                  fontSize: 13,
                  lineHeight: 21,
                  fontFamily: '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
                  minimap: { enabled: false },
                  tabSize: 2,
                  insertSpaces: true,
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  padding: { top: 10, bottom: 10 },
                }}
                height="clamp(360px, 58vh, 720px)"
                loading={<div className={styles.editorLoading}>Loading editor…</div>}
              />
            </div>
          ) : (
            <p className={shellStyles.note} dir="rtl" lang="fa">
              این مرحله قابل‌اجرا نیست. یکی از مرحله‌های اجرایی را انتخاب کن.
            </p>
          )}
        </WorkspaceShell>
      </div>
    </main>
  );
}
