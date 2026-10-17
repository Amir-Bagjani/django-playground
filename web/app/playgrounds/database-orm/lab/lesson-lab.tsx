"use client";

import { useCallback, useMemo, useState } from "react";

import Editor, { loader } from "@monaco-editor/react";

import type { LabExercise } from "@/lib/academy";

import { Markdown } from "../../../components/markdown";
import styles from "./lab.module.css";

loader.config({ paths: { vs: "/monaco/vs" } });

type RunStatus = "ok" | "error" | "timeout" | "system_error";

interface RuntimeResult {
  status: RunStatus;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  rowCount: number;
  truncated?: boolean;
  durationMs?: number;
  error?: string | null;
  traceback?: string | null;
}

interface CriterionResult {
  id: string;
  description_fa: string;
  passed: boolean;
}

interface CheckResult extends RuntimeResult {
  passed: boolean | null;
  criteria: CriterionResult[];
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

const STATUS_CLASS: Record<RunStatus, string> = {
  ok: styles.statusOk,
  error: styles.statusError,
  timeout: styles.statusTimeout,
  system_error: styles.statusSystem,
};

const STATUS_LABEL: Record<RunStatus, string> = {
  ok: "OK",
  error: "Error",
  timeout: "Timeout",
  system_error: "System error",
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

export function LessonLab({ exercises }: { exercises: LabExercise[] }) {
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
  const [checks, setChecks] = useState<Record<string, CheckResult | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState<Record<string, number>>({});
  const [schemas, setSchemas] = useState<Record<string, SchemaPreview | null>>({});

  const source = sources[activeId] ?? "";
  const result = results[activeId] ?? null;
  const check = checks[activeId] ?? null;
  const schema = schemas[activeId] ?? null;
  const shownHints = hintsShown[activeId] ?? 0;

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
      setChecks((prev) => ({ ...prev, [active.id]: null }));
    } finally {
      setBusy(null);
    }
  }, [active, source]);

  const doCheck = useCallback(async () => {
    if (!active) return;
    setBusy("check");
    try {
      const data = await callApi(`/api/academy/v1/runtime/${runtimePath(active)}/check`, {
        exerciseId: active.id,
        source,
      });
      const payload = data as unknown as CheckResult;
      setChecks((prev) => ({ ...prev, [active.id]: payload }));
      setResults((prev) => ({ ...prev, [active.id]: payload }));
    } finally {
      setBusy(null);
    }
  }, [active, source]);

  const doReset = useCallback(async () => {
    if (!active) return;
    setBusy("reset");
    try {
      await callApi(`/api/academy/v1/exercises/${active.id}/reset`);
      setSources((prev) => ({ ...prev, [active.id]: starterSource(active) }));
      setResults((prev) => ({ ...prev, [active.id]: null }));
      setChecks((prev) => ({ ...prev, [active.id]: null }));
      setSchemas((prev) => ({ ...prev, [active.id]: null }));
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

  return (
    <div className={styles.lab}>
      <div className={styles.labHead}>
        <h2 className={styles.labTitle}>Lab — {KIND_LABEL[active.kind] ?? active.kind}</h2>
        <span className={styles.labNote} dir="rtl" lang="fa">
          کد خودت را بنویس؛ Execute نتیجه‌ی خام و Check Solution معیارها را می‌سنجد.
        </span>
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Exercises">
        {exercises.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            role="tab"
            aria-selected={exercise.id === activeId}
            className={`${styles.tab} ${exercise.id === activeId ? styles.tabActive : ""}`}
            onClick={() => setActiveId(exercise.id)}
          >
            <span className={styles.tabLevel}>{LEVEL_LABEL[exercise.level] ?? exercise.level}</span>
            <span className={styles.tabTitle} dir="rtl" lang="fa">
              {exercise.title_fa}
            </span>
          </button>
        ))}
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
              {(check?.criteria ?? active.criteria).map((criterion) => {
                const passed = check ? check.criteria.find((c) => c.id === criterion.id)?.passed : undefined;
                return (
                  <li key={criterion.id} className={styles.criterion} dir="rtl" lang="fa">
                    <span
                      className={`${styles.criterionMark} ${
                        passed === undefined ? "" : passed ? styles.markPass : styles.markFail
                      }`}
                    >
                      {passed === undefined ? "•" : passed ? "✓" : "✗"}
                    </span>
                    {criterion.description_fa}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className={styles.hints}>
            <button
              type="button"
              className={styles.hintBtn}
              onClick={() =>
                setHintsShown((prev) => ({
                  ...prev,
                  [active.id]: Math.min((prev[active.id] ?? 0) + 1, active.hints.length),
                }))
              }
              disabled={shownHints >= active.hints.length}
            >
              Hint ({Math.min(shownHints, active.hints.length)}/{active.hints.length})
            </button>
            <ul className={styles.hintList} dir="rtl" lang="fa">
              {active.hints.slice(0, shownHints).map((hint) => (
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
              theme="vs-dark"
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

          {check ? (
            <div
              className={`${styles.verdict} ${
                check.status === "system_error"
                  ? styles.verdictSystem
                  : check.passed
                    ? styles.verdictPass
                    : styles.verdictFail
              }`}
              dir={check.status === "system_error" ? "ltr" : "rtl"}
              lang="fa"
            >
              {check.status === "system_error"
                ? check.error
                : check.passed
                  ? "آفرین! همه‌ی معیارها برآورده شد."
                  : check.status === "error" || check.status === "timeout"
                    ? "کد خطا داد؛ همان خطای واقعی را ببین و اصلاح کن."
                    : "بعضی معیارها برآورده نشد؛ نتیجه را با صورت مسئله مقایسه کن."}
            </div>
          ) : null}

          {result ? (
            <div className={styles.resultBox}>
              <div className={styles.resultMeta}>
                <span className={`${styles.chip} ${STATUS_CLASS[result.status] ?? ""}`}>
                  {STATUS_LABEL[result.status] ?? result.status}
                </span>
                <span className={styles.metaItem}>{result.rowCount} rows</span>
                {typeof result.durationMs === "number" ? (
                  <span className={styles.metaItem}>{result.durationMs} ms</span>
                ) : null}
                {result.truncated ? (
                  <span className={styles.metaWarn}>result truncated</span>
                ) : null}
              </div>

              {result.error ? (
                <pre className={styles.error} dir="ltr">
                  {result.error}
                </pre>
              ) : null}

              {result.traceback ? (
                <details className={styles.traceback}>
                  <summary>Traceback</summary>
                  <pre dir="ltr">{result.traceback}</pre>
                </details>
              ) : null}

              {result.status === "ok" && result.columns.length > 0 ? (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        {result.columns.map((column, i) => (
                          <th key={i} dir="ltr">
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 100).map((row, ri) => (
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

              {result.status === "ok" && result.columns.length === 0 && !result.error ? (
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
