"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { ErdGraph, LabExercise, LabHint } from "@/lib/academy";

import { Markdown } from "../../../components/markdown";
import { notifyProgress } from "../progress";
import { WorkspaceShell } from "../workspace-shell";
import { ErdCanvas } from "./erd-canvas";
import { ErdDesigner } from "./erd-designer";
import { emptyGraph, parseGraph } from "./graph";
import shellStyles from "../workspace-shell.module.css";
import styles from "./erd.module.css";

interface EvaluationCheck {
  criterionId: string;
  status: "passed" | "failed" | "needs_manual_review" | "not_evaluated";
  messageFa: string;
  hintAvailable: boolean;
}

interface EvaluationResult {
  exerciseId: string;
  assessmentVersion: number;
  status: "passed" | "failed" | "error" | "timeout" | "system_error";
  outcome: string;
  passed: boolean;
  checks: EvaluationCheck[];
  canRequestNextHint: boolean;
  error: string | null;
}

const CHECK_MARK: Record<EvaluationCheck["status"], { glyph: string; className: string }> = {
  passed: { glyph: "✓", className: shellStyles.markPass },
  failed: { glyph: "✗", className: shellStyles.markFail },
  needs_manual_review: { glyph: "…", className: shellStyles.markManual },
  not_evaluated: { glyph: "•", className: "" },
};

function starterGraph(exercise: LabExercise): ErdGraph {
  const parsed = parseGraph(exercise.starter[0]?.content);
  return parsed ?? emptyGraph();
}

function labelFromRelation(relationship: { fromCardinality: string; toCardinality: string }): string {
  return `${relationship.fromCardinality === "one" ? "1" : "N"}:${
    relationship.toCardinality === "one" ? "1" : "N"
  }`;
}

async function callApi(path: string, method: string, body?: unknown): Promise<Record<string, unknown>> {
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

export function ErdLab({ exercise }: { exercise: LabExercise }) {
  const [graph, setGraph] = useState<ErdGraph>(() => starterGraph(exercise));
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<"designer" | "example">("designer");
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [hints, setHints] = useState<LabHint[]>([]);
  const [hintTotal, setHintTotal] = useState(exercise.hint_count);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  const savedRef = useRef<string>("");
  const example = exercise.example_graph ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/draft`, "GET");
      if (cancelled) return;
      const draft = data.graph as ErdGraph | null | undefined;
      const next = draft && draft.schema_version === 1 ? draft : starterGraph(exercise);
      setGraph(next);
      savedRef.current = JSON.stringify(next);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise]);

  // Debounced auto-save so a Refresh never loses the learner's work.
  useEffect(() => {
    if (!ready) return;
    const serialized = JSON.stringify(graph);
    if (serialized === savedRef.current) return;
    setSaveState("saving");
    const handle = setTimeout(async () => {
      await callApi(`/api/academy/v1/exercises/${exercise.id}/draft`, "PUT", { graph });
      savedRef.current = serialized;
      setSaveState("saved");
    }, 800);
    return () => clearTimeout(handle);
  }, [graph, ready, exercise.id]);

  const doCheck = useCallback(async () => {
    setBusy("check");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/evaluate`, "POST", {
        exerciseId: exercise.id,
        graph,
      });
      setEvaluation(data as unknown as EvaluationResult);
      notifyProgress();
    } finally {
      setBusy(null);
    }
  }, [exercise.id, graph]);

  const doReset = useCallback(async () => {
    setBusy("reset");
    try {
      await callApi(`/api/academy/v1/exercises/${exercise.id}/reset`, "POST");
      const fresh = starterGraph(exercise);
      setGraph(fresh);
      savedRef.current = JSON.stringify(fresh);
      setEvaluation(null);
      setSaveState("idle");
    } finally {
      setBusy(null);
    }
  }, [exercise]);

  const doHint = useCallback(async () => {
    setBusy("hint");
    try {
      const data = await callApi(`/api/academy/v1/exercises/${exercise.id}/hints/next`, "POST", {
        revealed: hints.length,
      });
      const hint = data.hint as LabHint | null;
      if (hint) setHints((prev) => [...prev, hint]);
      if (typeof data.total === "number") setHintTotal(data.total as number);
    } finally {
      setBusy(null);
    }
  }, [exercise.id, hints.length]);

  const checkById = new Map(evaluation?.checks.map((check) => [check.criterionId, check]) ?? []);

  const designerAside = (
    <>
      <div className={shellStyles.paneHead}>Instructions</div>
      <div className={shellStyles.instructions} dir="rtl" lang="fa">
        <Markdown markdown={exercise.instructions_markdown} />
      </div>

      <div className={shellStyles.criteriaBox}>
        <div className={shellStyles.criteriaTitle}>معیارهای قبولی</div>
        <ul className={shellStyles.criteriaList}>
          {exercise.criteria.map((criterion) => {
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

      <div className={shellStyles.hints}>
        <button
          type="button"
          className={shellStyles.hintBtn}
          onClick={doHint}
          disabled={busy !== null || hints.length >= hintTotal}
        >
          Hint ({hints.length}/{hintTotal})
        </button>
        <ul className={shellStyles.hintList} dir="rtl" lang="fa">
          {hints.map((hint) => (
            <li key={hint.id}>{hint.text_fa}</li>
          ))}
        </ul>
      </div>
    </>
  );

  const exampleAside = (
    <>
      <div className={shellStyles.paneHead}>Example diagram</div>
      <p className={styles.exampleCaption} dir="rtl" lang="fa">
        {example?.caption_fa ?? ""}
      </p>
      {example?.relationships.map((relationship) => (
        <div key={relationship.id} className={styles.relationship} dir="rtl" lang="fa">
          <div className={styles.relHead}>{labelFromRelation(relationship)}</div>
          {relationship.note_fa ? <p className={styles.exampleNote}>{relationship.note_fa}</p> : null}
        </div>
      ))}
      {example?.entities.map((entity) => (
        <div key={entity.id} className={styles.relationship} dir="rtl" lang="fa">
          <div className={styles.relHead} dir="ltr">
            {entity.name}
          </div>
          {entity.note_fa ? <p className={styles.exampleNote}>{entity.note_fa}</p> : null}
        </div>
      ))}
      {example?.notes ? (
        <p className={styles.exampleNote} dir="rtl" lang="fa">
          {example.notes}
        </p>
      ) : null}
    </>
  );

  return (
    <div className={styles.lab}>
      <div className={styles.labHead}>
        <h2 className={styles.labTitle}>ERD Designer</h2>
        <span className={styles.labNote} dir="rtl" lang="fa">
          دیاگرام را خودت بساز؛ Check Solution فقط معنای طراحی (کلیدها، رابطه و کارتینالیتی) را می‌سنجد، نه شکل آن.
        </span>
      </div>

      <WorkspaceShell
        asideLabel="Instructions"
        aside={tab === "designer" ? designerAside : exampleAside}
        toolbar={
          <>
            <button
              type="button"
              className={tab === "designer" ? shellStyles.tabActive : shellStyles.tabIdle}
              onClick={() => setTab("designer")}
            >
              Designer
            </button>
            {example ? (
              <button
                type="button"
                className={tab === "example" ? shellStyles.tabActive : shellStyles.tabIdle}
                onClick={() => setTab("example")}
              >
                Example
              </button>
            ) : null}
            <span className={shellStyles.saveState}>
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Auto-save on"}
            </span>
          </>
        }
        actions={
          <>
            <button
              type="button"
              className={shellStyles.secondary}
              onClick={doCheck}
              disabled={busy !== null}
            >
              {busy === "check" ? "Checking…" : "Check Solution"}
            </button>
            <button type="button" className={shellStyles.ghost} onClick={doReset} disabled={busy !== null}>
              {busy === "reset" ? "Resetting…" : "Reset"}
            </button>
          </>
        }
        footer={
          evaluation ? (
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
                ? evaluation.error ?? "خطای سیستمی رخ داد؛ این مورد به‌عنوان طراحی غلط ثبت نمی‌شود."
                : evaluation.outcome === "invalid_graph"
                  ? evaluation.error ?? "دیاگرام نامعتبر است؛ ساختار آن را اصلاح کن."
                  : evaluation.passed
                    ? "آفرین! معیارهای ساختاری طراحی برآورده شد."
                    : "بعضی معیارها برآورده نشد؛ توضیح هر معیار را ببین و دیاگرام را اصلاح کن."}
            </div>
          ) : null
        }
      >
        {tab === "designer" ? (
          <ErdDesigner key={exercise.id} graph={graph} onChange={setGraph} />
        ) : (
          <div className={styles.figureBox}>
            <ErdCanvas graph={example ?? emptyGraph()} mode="view" />
          </div>
        )}
      </WorkspaceShell>
    </div>
  );
}
