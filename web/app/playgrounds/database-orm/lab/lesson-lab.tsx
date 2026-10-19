"use client";

import { useCallback, useMemo, useState } from "react";

import Editor, { loader } from "@monaco-editor/react";

import type { LabExercise, LabHint } from "@/lib/academy";

import { Markdown } from "../../../components/markdown";
import { useAppTheme } from "../../../components/use-app-theme";
import { notifyProgress } from "../progress";
import styles from "./lab.module.css";

loader.config({ paths: { vs: "/monaco/vs" } });

interface RawResult {
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  truncated?: boolean;
  durationMs?: number;
}

interface RuntimeResult extends RawResult {
  status: string;
  error?: string | null;
  traceback?: string | null;
}

interface EvaluationCheck {
  criterionId: string;
  status: "passed" | "failed" | "needs_manual_review" | "not_evaluated";
  messageFa: string;
  location?: { file?: string; line?: number } | null;
  hintAvailable: boolean;
}

interface EvaluationResult {
  exerciseId: string;
  assessmentVersion: number;
  status: "passed" | "failed" | "error" | "timeout" | "system_error";
  outcome: string;
  passed: boolean;
  checks: EvaluationCheck[];
  result: RawResult;
  canRequestNextHint: boolean;
  error: string | null;
  traceback: string | null;
}

interface SchemaPreview {
  schema: string;
  charset: string;
  collation: string;
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean; key: string }>;
  }>;
}

const KIND_LABEL: Record<string, string> = { sql: "SQL", "django-orm": "Django ORM" };
const LEVEL_LABEL: Record<string, string> = {
  practice: "Practice",
  "problem-solving": "Problem Solving",
  mastery: "Mastery",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "OK",
  passed: "Passed",
  failed: "Not passed",
  error: "Error",
  timeout: "Timeout",
  system_error: "System error",
};

const STATUS_CLASS: Record<string, string> = {
  ok: styles.statusOk,
  passed: styles.statusOk,
  failed: styles.statusError,
  error: styles.statusError,
  timeout: styles.statusTimeout,
  system_error: styles.statusSystem,
};

const CHECK_MARK: Record<EvaluationCheck["status"], { glyph: string; className: string }> = {
  passed: { glyph: "✓", className: styles.markPass },
  failed: { glyph: "✗", className: styles.markFail },
  needs_manual_review: { glyph: "…", className: styles.markManual },
  not_evaluated: { glyph: "•", className: "" },
};

function editorLanguage(exercise: LabExercise): string {
  return exercise.kind === "sql" ? "sql" : "python";
}

function runtimePath(exercise: LabExercise): "sql" | "orm" {
  return exercise.kind === "sql" ? "sql" : "orm";
}

function starterSource(exercise: LabExercise): string {
  return exercise.starter[0]?.content ?? "";
}

async function callApi(path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    cache: "no-store",
  });
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { status: "system_error", error: `پاسخ نامعتبر از سرور (HTTP ${response.status}).` };
  }
}

function verdictMessage(evaluation: EvaluationResult): string {
  if (evaluation.status === "system_error") {
    return evaluation.error ?? "خطای سیستمی رخ داد؛ این مورد بهعنوان پاسخ غلط ثبت نمیشود.";
  }
  if (evaluation.status === "timeout" || evaluation.outcome === "deadline_exceeded") {
    return "اجرای کد بیش از حد طول کشید و متوقف شد؛ آن را سادهتر یا سریعتر کن.";
  }
  if (evaluation.outcome === "syntax_error") {
    return "کد خطا داد؛ همان خطای واقعی را ببین و اصلاح کن.";
  }
  if (evaluation.passed) {
    return "آفرین! معیارهای خودکار برآورده شدند.";
  }
  return "بعضی معیارها برآورده نشد؛ نتیجه و توضیح معیارها را با صورت مسئله مقایسه کن.";
}

export function LessonLab({ exercises }: { exercises: LabExercise[] }) {
  const appTheme = useAppTheme();
  const [activeId, setActiveId] = useState(exercises[0]?.id ?? "");
  const active = useMemo(
    () => exercises.find((exercise) => exercise.id === activeId) ?? exercises[0],
    [exercises, activeId],
  );
  const [sources, setSources] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const exercise of exercises) initial[exercise.id] = starterSource(exercise);
    return initial;
  });
  const [results, setResults] = useState<Record<string, RuntimeResult | null>>({});
  const [evaluations, setEvaluations] = useState<Record<string, EvaluationResult | null>>({});
  const [revealed, setRevealed] = useState<Record<string, LabHint[]>>({});
  const [hintTotals, setHintTotals] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const exercise of exercises) initial[exercise.id] = exercise.hint_count;
    return initial;
  });
  const [schemas, setSchemas] = useState<Record<string, SchemaPreview | null>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const source = sources[activeId] ?? "";
  const result = results[activeId] ?? null;
  const evaluation = evaluations[activeId] ?? null;
  const schema = schemas[activeId] ?? null;
  const shownHints = revealed[activeId] ?? [];
  const hintTotal = hintTotals[activeId] ?? 0;

  const display: RuntimeResult | null = evaluation
    ? {
        status: evaluation.status,
        columns: evaluation.result.columns,
        rows: evaluation.result.rows,
        rowCount: evaluation.result.rowCount,
        truncated: evaluation.result.truncated,
        durationMs: evaluation.result.durationMs,
        error: evaluation.error,
        traceback: evaluation.traceback,
      }
    : result;

  const updateSource = useCallback(
    (value: string) => setSources((prev) => ({ ...prev, [activeId]: value })),
    [activeId],
  );

  const doExecute = useCallback(async () => {
    if (!active) return;
    setBusy("execute");
    try {
      const data = await callApi(`/api/academy/v1/runtime/${runtimePath(active)}/execute`, {
        exerciseId: active.id,
        source,
      });
      setResults((prev) => ({ ...prev, [active.id]: data as unknown as RuntimeResult }));
      setEvaluations((prev) => ({ ...prev, [active.id]: null }));
    } finally {
      setBusy(null);
    }
  }, [active, source]);

  const doCheck = useCallback(async () => {
    if (!active) return;
    setBusy("check");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${active.id}/evaluate`, {
        exerciseId: active.id,
        source,
      });
      const payload = data as unknown as EvaluationResult;
      setEvaluations((prev) => ({ ...prev, [active.id]: payload }));
      setResults((prev) => ({ ...prev, [active.id]: null }));
      // Evaluation is what records attempts/passes; refresh progress views.
      notifyProgress();
    } finally {
      setBusy(null);
    }
  }, [active, source]);

  const doHint = useCallback(async () => {
    if (!active) return;
    setBusy("hint");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${active.id}/hints/next`, {
        revealed: shownHints.length,
      });
      const hint = data.hint as LabHint | null;
      if (hint) {
        setRevealed((prev) => ({ ...prev, [active.id]: [...(prev[active.id] ?? []), hint] }));
      }
      if (typeof data.total === "number") {
        setHintTotals((prev) => ({ ...prev, [active.id]: data.total as number }));
      }
    } finally {
      setBusy(null);
    }
  }, [active, shownHints.length]);

  const doReset = useCallback(async () => {
    if (!active) return;
    setBusy("reset");
    try {
      await callApi(`/api/academy/v1/exercises/${active.id}/reset`);
      setSources((prev) => ({ ...prev, [active.id]: starterSource(active) }));
      setResults((prev) => ({ ...prev, [active.id]: null }));
      setEvaluations((prev) => ({ ...prev, [active.id]: null }));
      setSchemas((prev) => ({ ...prev, [active.id]: null }));
      // Reset restores exercise data but never earned progress or given hints.
    } finally {
      setBusy(null);
    }
  }, [active]);

  const doSchema = useCallback(async () => {
    if (!active) return;
    setBusy("schema");
    try {
      const response = await fetch(`/api/academy/v1/exercises/${active.id}/schema`, {
        cache: "no-store",
      });
      const data = (await response.json()) as SchemaPreview;
      setSchemas((prev) => ({ ...prev, [active.id]: data }));
    } finally {
      setBusy(null);
    }
  }, [active]);

  if (!active) {
    return null;
  }

  const checkById = new Map(evaluation?.checks.map((check) => [check.criterionId, check]) ?? []);

  return (
    <div className={styles.lab}>
      <div className={styles.labHead}>
        <h2 className={styles.labTitle}>Lab — {KIND_LABEL[active.kind] ?? active.kind}</h2>
        <span className={styles.labNote} dir="rtl" lang="fa">
          کد خودت را بنویس؛ Execute نتیجه‌ی خام و Check Solution معیارها را می‌سنجد.
        </span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Exercises">
        {exercises.map((exercise) => {
          const passed = evaluations[exercise.id]?.passed;
          return (
            <button
              key={exercise.id}
              type="button"
              role="tab"
              aria-selected={exercise.id === activeId}
              className={`${styles.tab} ${exercise.id === activeId ? styles.tabActive : ""}`}
              onClick={() => setActiveId(exercise.id)}
            >
              <span className={styles.tabLevel}>
                {LEVEL_LABEL[exercise.level] ?? exercise.level}
                {exercise.required_for_completion ? "" : " · optional"}
              </span>
              <span className={styles.tabTitle} dir="rtl" lang="fa">
                {exercise.title_fa}
              </span>
              {passed ? <span className={styles.tabPass}>✓ passed</span> : null}
            </button>
          );
        })}
      </div>

      <div className={styles.grid}>
        <div className={styles.pane}>
          <div className={styles.paneHead}>Instructions</div>
          <div className={styles.instructions} dir="rtl" lang="fa">
            <Markdown markdown={active.instructions_markdown} />
          </div>

          <div className={styles.criteriaBox}>
            <div className={styles.criteriaTitle}>معیارهای قبولی</div>
            <ul className={styles.criteriaList}>
              {active.criteria.map((criterion) => {
                const check = checkById.get(criterion.id);
                const mark = check
                  ? CHECK_MARK[check.status]
                  : { glyph: "•", className: "" };
                return (
                  <li key={criterion.id} className={styles.checkItem} dir="rtl" lang="fa">
                    <span className={styles.criterion}>
                      <span className={`${styles.criterionMark} ${mark.className}`}>
                        {mark.glyph}
                      </span>
                      <span>
                        {criterion.description_fa}
                        {criterion.evaluation === "manual" ? " (بازبینی دستی)" : ""}
                      </span>
                    </span>
                    {check && (check.status === "failed" || check.status === "needs_manual_review") ? (
                      <span className={styles.checkMessage}>{check.messageFa}</span>
                    ) : null}
                    {check?.location?.line ? (
                      <span className={styles.checkMessage} dir="ltr">
                        {check.location.file}:{check.location.line}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.hints}>
            <button
              type="button"
              className={styles.hintBtn}
              onClick={doHint}
              disabled={busy !== null || shownHints.length >= hintTotal}
            >
              Hint ({shownHints.length}/{hintTotal})
            </button>
            <ul className={styles.hintList} dir="rtl" lang="fa">
              {shownHints.map((hint) => (
                <li key={hint.id}>{hint.text_fa}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.pane}>
          <div className={styles.editorHost}>
            <Editor
              key={active.id}
              path={`academy-${active.id}.${active.kind === "sql" ? "sql" : "py"}`}
              defaultValue={source}
              language={editorLanguage(active)}
              theme={appTheme === "light" ? "vs" : "vs-dark"}
              onChange={(value) => updateSource(value ?? "")}
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
              height="240px"
              loading={<div className={styles.editorLoading}>Loading editor…</div>}
            />
          </div>

          <div className={styles.toolbar}>
            <button type="button" className={styles.primary} onClick={doExecute} disabled={busy !== null}>
              {busy === "execute" ? "Running…" : "Execute"}
            </button>
            <button type="button" className={styles.secondary} onClick={doCheck} disabled={busy !== null}>
              {busy === "check" ? "Checking…" : "Check Solution"}
            </button>
            <button type="button" className={styles.ghost} onClick={doReset} disabled={busy !== null}>
              {busy === "reset" ? "Resetting…" : "Reset"}
            </button>
            <button type="button" className={styles.ghost} onClick={doSchema} disabled={busy !== null}>
              {busy === "schema" ? "Loading…" : "Show schema"}
            </button>
          </div>

          {evaluation ? (
            <div
              className={`${styles.verdict} ${
                evaluation.status === "system_error"
                  ? styles.verdictSystem
                  : evaluation.passed
                    ? styles.verdictPass
                    : styles.verdictFail
              }`}
              dir={evaluation.status === "system_error" ? "ltr" : "rtl"}
              lang="fa"
            >
              {verdictMessage(evaluation)}
            </div>
          ) : null}

          {display ? (
            <div className={styles.resultBox}>
              <div className={styles.resultMeta}>
                <span className={`${styles.chip} ${STATUS_CLASS[display.status] ?? ""}`}>
                  {STATUS_LABEL[display.status] ?? display.status}
                </span>
                <span className={styles.metaItem}>{display.rowCount} rows</span>
                {typeof display.durationMs === "number" ? (
                  <span className={styles.metaItem}>{display.durationMs} ms</span>
                ) : null}
                {display.truncated ? (
                  <span className={styles.metaWarn}>result truncated</span>
                ) : null}
              </div>

              {display.error ? (
                <pre className={styles.error} dir="ltr">
                  {display.error}
                </pre>
              ) : null}

              {display.traceback ? (
                <details className={styles.traceback}>
                  <summary>Traceback</summary>
                  <pre dir="ltr">{display.traceback}</pre>
                </details>
              ) : null}

              {display.columns.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {display.columns.map((column, i) => (
                          <th key={i} dir="ltr">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {display.rows.slice(0, 100).map((row, ri) => (
                        <tr key={ri}>
                          {row.map((cell, ci) => (
                            <td key={ci} dir="ltr">
                              {cell === null ? <span className={styles.null}>NULL</span> : String(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {display.columns.length === 0 && !display.error && display.status !== "failed" ? (
                <div className={styles.empty}>دستور اجرا شد اما نتیجه‌ی جدولی برنگرداند.</div>
              ) : null}
            </div>
          ) : null}

          {schema ? (
            <div className={styles.schemaBox}>
              <div className={styles.schemaMeta}>
                {schema.schema} · {schema.charset} / {schema.collation}
              </div>
              {schema.tables.map((table) => (
                <div key={table.name} className={styles.schemaTable}>
                  <div className={styles.schemaTableName}>{table.name}</div>
                  <ul>
                    {table.columns.map((column) => (
                      <li key={column.name} dir="ltr">
                        <code>{column.name}</code> {column.type}
                        {column.nullable ? "" : " NOT NULL"}
                        {column.key === "PRI" ? " PK" : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
