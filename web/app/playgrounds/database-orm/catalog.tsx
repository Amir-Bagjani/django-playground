"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";

import { StatusBadge } from "./badge";
import { LessonStatusChip } from "./progress";
import styles from "./catalog.module.css";

export interface CatalogLesson {
  id: string;
  titleFa: string;
  outcomeFa: string;
  status: string;
  runnable: boolean;
}

export interface CatalogModule {
  id: string;
  titleFa: string;
  focus: string;
  lessons: CatalogLesson[];
}

const STATUS_RANK: Record<string, number> = {
  planned: 0,
  draft: 1,
  "in-review": 2,
  approved: 3,
};

const STATUS_OPTIONS = [
  { value: "all", label: "all" },
  { value: "approved", label: "approved" },
  { value: "in-review", label: "in-review" },
  { value: "draft", label: "draft" },
  { value: "planned", label: "planned" },
];

type SortKey = "id" | "status";

function sortMark(active: boolean, dir: "asc" | "desc"): string {
  if (!active) return "↕";
  return dir === "asc" ? "▲" : "▼";
}

export function CourseCatalog({ modules }: { modules: CatalogModule[] }) {
  const router = useRouter();
  const [moduleId, setModuleId] = useState("all");
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "id",
    dir: "asc",
  });

  // Debounce the title filter so typing doesn't re-render the 176-row grid
  // (and rewrite the query) on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(id);
  }, [searchInput]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, planned: 0, draft: 0, "in-review": 0, approved: 0 };
    for (const module of modules) {
      for (const lesson of module.lessons) {
        counts.all += 1;
        counts[lesson.status] = (counts[lesson.status] ?? 0) + 1;
      }
    }
    return counts;
  }, [modules]);

  const query = search.trim().toLowerCase();

  const groups = useMemo(() => {
    return modules
      .filter((module) => moduleId === "all" || module.id === moduleId)
      .map((module) => {
        const lessons = module.lessons
          .filter((lesson) => status === "all" || lesson.status === status)
          .filter(
            (lesson) =>
              !query ||
              lesson.id.toLowerCase().includes(query) ||
              lesson.titleFa.toLowerCase().includes(query) ||
              lesson.outcomeFa.toLowerCase().includes(query),
          )
          .slice()
          .sort((a, b) => {
            const cmp =
              sort.key === "id"
                ? a.id.localeCompare(b.id)
                : (STATUS_RANK[a.status] ?? 0) - (STATUS_RANK[b.status] ?? 0);
            return sort.dir === "asc" ? cmp : -cmp;
          });
        return { module, lessons };
      })
      .filter((group) => group.lessons.length > 0);
  }, [modules, moduleId, status, query, sort]);

  const rowCount = groups.reduce((total, group) => total + group.lessons.length, 0);
  const conditionCount =
    (moduleId !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0) + (query ? 1 : 0);
  const hasFilters = conditionCount > 0;
  const canReset = moduleId !== "all" || status !== "all" || searchInput.trim() !== "";

  const reset = () => {
    setModuleId("all");
    setStatus("all");
    setSearchInput("");
    setSearch("");
  };

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  };

  const conditions: ReactNode[] = [];
  if (moduleId !== "all") {
    conditions.push(
      <Fragment key="module">
        <span className={styles.ident}>module_id</span> <span className={styles.op}>=</span>{" "}
        <span className={styles.str}>&apos;{moduleId}&apos;</span>
      </Fragment>,
    );
  }
  if (status !== "all") {
    conditions.push(
      <Fragment key="status">
        <span className={styles.ident}>status</span> <span className={styles.op}>=</span>{" "}
        <span className={styles.str}>&apos;{status}&apos;</span>
      </Fragment>,
    );
  }
  if (query) {
    conditions.push(
      <Fragment key="title">
        <span className={styles.ident}>title</span> <span className={styles.op}>LIKE</span>{" "}
        <span className={styles.str}>&apos;%{search.trim()}%&apos;</span>
      </Fragment>,
    );
  }

  return (
    <>
      <section className={styles.console} aria-label="Catalog query">
        <div className={styles.consoleBar}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.consoleTitle}>academy.lessons</span>
          <span className={styles.consoleTag}>live query</span>
        </div>
        <pre className={styles.query}>
          <span className={styles.kw}>SELECT</span>
          {" lesson_id, title_fa, status,\n       outcome_fa\n"}
          <span className={styles.kw}>FROM</span>{" "}
          <span className={styles.ident}>academy.lessons</span>
          {conditions.length > 0 ? (
            <>
              {"\n"}
              <span className={styles.kw}>WHERE</span> {conditions[0]}
              {conditions.slice(1).map((node, index) => (
                <span key={index}>
                  {"\n      "}
                  <span className={styles.kw}>AND</span> {node}
                </span>
              ))}
            </>
          ) : null}
          {"\n"}
          <span className={styles.kw}>ORDER BY</span>{" "}
          <span className={styles.ident}>{sort.key === "id" ? "lesson_id" : "status"}</span>{" "}
          <span className={styles.op}>{sort.dir === "asc" ? "ASC" : "DESC"}</span>
          <span className={styles.caret} aria-hidden="true" />
        </pre>
        <div className={styles.consoleResult}>
          <span className={styles.resultArrow} aria-hidden="true">
            ▸
          </span>
          <span>
            <b>{rowCount}</b> rows
          </span>
          {hasFilters ? (
            <span>
              · {conditionCount} condition{conditionCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </section>

      <div className={styles.whereBar}>
        <span className={styles.whereLabel}>WHERE</span>

        <label className={styles.field}>
          <span className={styles.fieldCol}>module_id</span>
          <select
            className={styles.select}
            value={moduleId}
            onChange={(event) => setModuleId(event.target.value)}
          >
            <option value="all">all ({statusCounts.all})</option>
            {modules.map((module) => (
              <option key={module.id} value={module.id}>
                {module.id}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldCol}>status</span>
          <select
            className={styles.select}
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} ({statusCounts[option.value] ?? 0})
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldCol}>title LIKE</span>
          <input
            className={styles.input}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="'%…%'"
            aria-label="Filter lessons by title"
          />
        </label>

        <button type="button" className={styles.reset} onClick={reset} disabled={!canReset}>
          reset
        </button>
      </div>

      <div className={styles.resultHead}>
        <span className={styles.resultCount}>
          <b>{rowCount}</b> rows
        </span>
        <span className={styles.resultNote}>
          {hasFilters ? `${conditionCount} condition${conditionCount === 1 ? "" : "s"}` : "full catalog"}
        </span>
      </div>

      {rowCount > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <colgroup>
              <col style={{ width: "108px" }} />
              <col style={{ width: "30%" }} />
              <col />
              <col style={{ width: "170px" }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-sort={
                    sort.key === "id" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"
                  }
                >
                  <button type="button" onClick={() => toggleSort("id")}>
                    lesson_id
                    <span className={styles.pk} aria-hidden="true">
                      PK
                    </span>
                    <span
                      className={sort.key === "id" ? styles.sortMark : ""}
                      aria-hidden="true"
                    >
                      {sortMark(sort.key === "id", sort.dir)}
                    </span>
                  </button>
                </th>
                <th scope="col">title</th>
                <th scope="col">outcome</th>
                <th
                  scope="col"
                  aria-sort={
                    sort.key === "status"
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button type="button" onClick={() => toggleSort("status")}>
                    status
                    <span
                      className={sort.key === "status" ? styles.sortMark : ""}
                      aria-hidden="true"
                    >
                      {sortMark(sort.key === "status", sort.dir)}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            {groups.map(({ module, lessons }) => (
              <tbody key={module.id}>
                <tr className={styles.groupRow}>
                  <th scope="colgroup" colSpan={4}>
                    <span className={styles.groupId}>{module.id}</span>
                    <span className={styles.groupTitle} dir="rtl" lang="fa">
                      {module.titleFa}
                    </span>
                    {module.focus ? <span className={styles.groupFocus}>{module.focus}</span> : null}
                    <span className={styles.groupCount}>{lessons.length} rows</span>
                  </th>
                </tr>
                {lessons.map((lesson) => {
                  const href = `/playgrounds/database-orm/lessons/${lesson.id}`;
                  return (
                    <tr
                      key={lesson.id}
                      className={styles.row}
                      onClick={() => router.push(href)}
                    >
                      <td className={`${styles.cell} ${styles.cellId}`}>
                        <Link href={href} onClick={(event) => event.stopPropagation()}>
                          {lesson.id}
                        </Link>
                      </td>
                      <td className={`${styles.cell} ${styles.cellTitle}`} dir="rtl" lang="fa">
                        <Link href={href} onClick={(event) => event.stopPropagation()}>
                          {lesson.titleFa}
                        </Link>
                      </td>
                      <td className={`${styles.cell} ${styles.cellOutcome}`} dir="rtl" lang="fa">
                        {lesson.outcomeFa}
                      </td>
                      <td className={`${styles.cell} ${styles.cellStatus}`}>
                        {lesson.runnable ? <LessonStatusChip lessonId={lesson.id} /> : null}
                        <StatusBadge status={lesson.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      ) : (
        <div className={styles.empty}>
          -- 0 rows returned.
          <br />
          No lesson matches these filters — adjust the WHERE clause above.
        </div>
      )}
    </>
  );
}
