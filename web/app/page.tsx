"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RuntimeState = "stopped" | "starting" | "running" | "error";

interface RuntimeStatus {
  state: RuntimeState;
  exitCode: number | null;
  error: string | null;
  pid: number | null;
}

interface ExampleMeta {
  id: string;
  name: string;
  description: string;
  readOnly: boolean;
  sourceTemplateId?: string;
  defaultRequestPath?: string;
  createdAt?: string;
  updatedAt?: string;
  active?: boolean;
}

interface ExamplesResponse {
  builtIn: ExampleMeta[];
  personal: ExampleMeta[];
  templates: ExampleMeta[];
  activeExampleId: string | null;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
  readOnly: boolean;
  defaultOpenFile: string;
  defaultRequestPath: string;
  runtime: RuntimeStatus;
}

interface FileEntry {
  path: string;
  editable: boolean;
}

interface HttpResult {
  status: number;
  durationMs: number;
  headers: Record<string, string>;
  contentType: string;
  body: string;
  truncated?: boolean;
}

interface HeaderRow {
  key: string;
  value: string;
}

interface SavedRequest {
  id: string;
  name: string;
  method: string;
  path: string;
  headers: HeaderRow[];
  body: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
}

interface ColumnInfo {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  default: string | null;
}

interface ForeignKey {
  column: string;
  referencesTable: string;
  referencesColumn: string;
}

interface TableDetail {
  name: string;
  rowCount: number;
  columns: ColumnInfo[];
  foreignKeys: ForeignKey[];
}

interface RowsPage {
  name: string;
  columns: string[];
  rows: (string | number | null)[][];
  total: number;
  limit: number;
  offset: number;
}

interface MigrationStep {
  command: string;
  returnCode: number;
  output: string;
  success: boolean;
}

interface MigrationResult {
  success: boolean;
  steps: MigrationStep[];
  restarted: boolean;
}

type Tab = "api" | "database" | "log";

type PendingAction =
  | { type: "openPersonal"; id: string }
  | { type: "openBuiltin"; id: string }
  | { type: "openFile"; path: string }
  | { type: "run" }
  | null;

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DB_PAGE_SIZE = 50;

const STATE_LABEL: Record<RuntimeState, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  error: "Error",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/runner${path}`, { cache: "no-store", ...init });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    let detail = "Unknown error";
    if (data && typeof data === "object" && "detail" in data) {
      detail = String((data as { detail: unknown }).detail);
    } else if (data && typeof data === "object" && "error" in data) {
      detail = String((data as { error: unknown }).error);
    }
    throw new Error(detail);
  }
  return data as T;
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function headersToObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key) out[key] = row.value;
  }
  return out;
}

function prettyBody(body: string, contentType: string): string {
  const looksJson =
    contentType.includes("json") || body.trim().startsWith("{") || body.trim().startsWith("[");
  if (!looksJson) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

function statusClass(status: number): string {
  if (status >= 500) return "status-5xx";
  if (status >= 400) return "status-4xx";
  if (status >= 300) return "status-3xx";
  if (status >= 200) return "status-2xx";
  return "status-1xx";
}

export default function Page() {
  const [examples, setExamples] = useState<ExamplesResponse>({
    builtIn: [],
    personal: [],
    templates: [],
    activeExampleId: null,
  });
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<RuntimeStatus>({
    state: "stopped",
    exitCode: null,
    error: null,
    pid: null,
  });
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [savedContent, setSavedContent] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [booting, setBooting] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [runnerDown, setRunnerDown] = useState<boolean>(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [tab, setTab] = useState<Tab>("api");

  // API tester state
  const [reqMethod, setReqMethod] = useState<string>("GET");
  const [reqPath, setReqPath] = useState<string>("");
  const [reqHeaders, setReqHeaders] = useState<HeaderRow[]>([]);
  const [reqBody, setReqBody] = useState<string>("");
  const [result, setResult] = useState<HttpResult | null>(null);
  const [showResultHeaders, setShowResultHeaders] = useState<boolean>(false);
  const [showRequestHeaders, setShowRequestHeaders] = useState<boolean>(false);
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([]);
  const [loadedRequestId, setLoadedRequestId] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState<boolean>(false);
  const [saveName, setSaveName] = useState<string>("");
  const [renameOpen, setRenameOpen] = useState<boolean>(false);
  const [renameName, setRenameName] = useState<string>("");

  // Database explorer state
  const [dbAvailable, setDbAvailable] = useState<boolean>(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableDetail, setTableDetail] = useState<TableDetail | null>(null);
  const [rowsPage, setRowsPage] = useState<RowsPage | null>(null);
  const [dbBusy, setDbBusy] = useState<boolean>(false);
  const [migration, setMigration] = useState<MigrationResult | null>(null);

  // Example management state
  const [newOpen, setNewOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [newTemplate, setNewTemplate] = useState<string>("scratch");
  const [renameTarget, setRenameTarget] = useState<ExampleMeta | null>(null);
  const [renameDesc, setRenameDesc] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<ExampleMeta | null>(null);

  const dirty = content !== savedContent;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const previewExample = previewId
    ? examples.builtIn.find((item) => item.id === previewId) ?? null
    : null;
  const loadedRequest = savedRequests.find((item) => item.id === loadedRequestId) ?? null;

  const refreshStatus = useCallback(async () => {
    try {
      const next = await api<RuntimeStatus>("/v1/runtime/status");
      setStatus(next);
      setRunnerDown(false);
    } catch {
      setRunnerDown(true);
    }
  }, []);

  const refreshLogs = useCallback(async () => {
    try {
      const data = await api<{ lines: string[] }>("/v1/runtime/logs?limit=300");
      setLogs(data.lines);
    } catch {
      /* status poll already surfaces runner outages */
    }
  }, []);

  const refreshExamples = useCallback(async () => {
    const data = await api<ExamplesResponse>("/v1/examples");
    setExamples(data);
    return data;
  }, []);

  const loadSavedRequests = useCallback(async () => {
    try {
      const data = await api<{ requests: SavedRequest[] }>("/v1/requests");
      setSavedRequests(data.requests);
    } catch {
      setSavedRequests([]);
    }
  }, []);

  const resetApiAndDb = useCallback((ws: Workspace) => {
    setReqMethod("GET");
    setReqPath(ws.defaultRequestPath);
    setReqHeaders([]);
    setReqBody("");
    setLoadedRequestId(null);
    setResult(null);
    setDbAvailable(false);
    setTables([]);
    setSelectedTable(null);
    setTableDetail(null);
    setRowsPage(null);
    setMigration(null);
  }, []);

  const openFile = useCallback(async (path: string, exampleId?: string | null) => {
    const suffix = exampleId ? `&exampleId=${encodeURIComponent(exampleId)}` : "";
    const data = await api<{ content: string; path: string }>(
      `/v1/files/content?path=${encodeURIComponent(path)}${suffix}`,
    );
    setCurrentPath(data.path);
    setContent(data.content);
    setSavedContent(data.content);
  }, []);

  const loadWorkspace = useCallback(async () => {
    const ws = await api<Workspace>("/v1/workspace");
    setWorkspace(ws);
    setStatus(ws.runtime);
    resetApiAndDb(ws);
    await loadSavedRequests();
    const list = await api<{ files: FileEntry[] }>("/v1/files");
    setFiles(list.files);
    const target =
      list.files.find((f) => f.path === ws.defaultOpenFile && f.editable)?.path ??
      list.files.find((f) => f.editable)?.path;
    if (target) {
      await openFile(target);
    }
    await refreshLogs();
  }, [loadSavedRequests, openFile, refreshLogs, resetApiAndDb]);

  const loadPreview = useCallback(
    async (id: string) => {
      const list = await api<{ files: FileEntry[] }>(
        `/v1/files?exampleId=${encodeURIComponent(id)}`,
      );
      setFiles(list.files);
      setPreviewId(id);
      const target =
        list.files.find((f) => f.path === "demo/views.py")?.path ??
        list.files.find((f) => f.editable)?.path ??
        list.files[0]?.path;
      if (target) {
        await openFile(target, id);
      }
    },
    [openFile],
  );

  const bootstrap = useCallback(async () => {
    setBooting(true);
    setError("");
    try {
      await refreshExamples();
      await loadWorkspace();
      setPreviewId(null);
      setRunnerDown(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunnerDown(true);
    } finally {
      setBooting(false);
    }
  }, [loadWorkspace, refreshExamples]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refreshStatus();
      void refreshLogs();
    }, 2000);
    return () => clearInterval(timer);
  }, [refreshStatus, refreshLogs]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // -- file editor --------------------------------------------------------
  const save = useCallback(async (): Promise<boolean> => {
    if (!currentPath || previewId) return false;
    setBusy(true);
    setError("");
    try {
      await api("/v1/files/content", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: currentPath, content }),
      });
      setSavedContent(content);
      setMessage("Saved.");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, [content, currentPath, previewId]);

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await api<RuntimeStatus>("/v1/runtime/start", { method: "POST" });
      setStatus(next);
      await refreshLogs();
      if (next.state === "error") {
        setError(next.error ?? "Django failed to start.");
      } else if (next.state === "running") {
        setMessage("Django is running.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshLogs]);

  const stop = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const next = await api<RuntimeStatus>("/v1/runtime/stop", { method: "POST" });
      setStatus(next);
      await refreshLogs();
      setMessage("Django stopped.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshLogs]);

  // -- API tester ---------------------------------------------------------
  const refreshTables = useCallback(async (): Promise<TableInfo[]> => {
    try {
      const data = await api<{ available: boolean; tables: TableInfo[] }>(
        "/v1/database/tables",
      );
      setDbAvailable(data.available);
      setTables(data.tables);
      return data.tables;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }, []);

  const sendRequest = useCallback(async () => {
    if (!reqPath.trim()) {
      setError("Enter a request path, for example /api/hello/.");
      return;
    }
    if (BODY_METHODS.has(reqMethod) && reqBody.trim()) {
      try {
        JSON.parse(reqBody);
      } catch {
        setError("Request body is not valid JSON.");
        return;
      }
    }
    setBusy(true);
    setError("");
    setMessage("");
    setResult(null);
    try {
      const data = await api<HttpResult>(
        "/v1/runtime/request",
        jsonPost({
          method: reqMethod,
          path: reqPath.trim(),
          headers: headersToObject(reqHeaders),
          body: BODY_METHODS.has(reqMethod) && reqBody.trim() ? reqBody : undefined,
        }),
      );
      setResult(data);
      if (tables.length > 0) void refreshTables();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [reqBody, reqHeaders, reqMethod, reqPath, refreshTables, tables.length]);

  const loadSaved = useCallback((request: SavedRequest) => {
    setReqMethod(request.method);
    setReqPath(request.path);
    setReqHeaders(request.headers.map((header) => ({ ...header })));
    setReqBody(request.body ?? "");
    setLoadedRequestId(request.id);
    setTab("api");
  }, []);

  const createSaved = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const created = await api<SavedRequest>(
        "/v1/requests",
        jsonPost({
          name: saveName,
          method: reqMethod,
          path: reqPath.trim(),
          headers: reqHeaders,
          body: reqBody,
        }),
      );
      setSaveOpen(false);
      setSaveName("");
      await loadSavedRequests();
      setLoadedRequestId(created.id);
      setMessage(`Saved request "${created.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, reqBody, reqHeaders, reqMethod, reqPath, saveName]);

  const updateSaved = useCallback(async () => {
    if (!loadedRequestId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/v1/requests/${encodeURIComponent(loadedRequestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          method: reqMethod,
          path: reqPath.trim(),
          headers: reqHeaders,
          body: reqBody,
        }),
      });
      await loadSavedRequests();
      setMessage("Saved request updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, loadedRequestId, reqBody, reqHeaders, reqMethod, reqPath]);

  const renameSaved = useCallback(async () => {
    if (!loadedRequestId) return;
    setBusy(true);
    setError("");
    try {
      await api(`/v1/requests/${encodeURIComponent(loadedRequestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: renameName }),
      });
      setRenameOpen(false);
      await loadSavedRequests();
      setMessage("Saved request renamed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, loadedRequestId, renameName]);

  const deleteSaved = useCallback(
    async (id: string) => {
      setBusy(true);
      setError("");
      try {
        await api(`/v1/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (loadedRequestId === id) setLoadedRequestId(null);
        await loadSavedRequests();
        setMessage("Saved request deleted.");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [loadSavedRequests, loadedRequestId],
  );

  // -- database explorer --------------------------------------------------
  const loadRows = useCallback(async (name: string, offset: number) => {
    try {
      const page = await api<RowsPage>(
        `/v1/database/tables/${encodeURIComponent(name)}/rows?limit=${DB_PAGE_SIZE}&offset=${offset}`,
      );
      setRowsPage(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const openTable = useCallback(
    async (name: string) => {
      setSelectedTable(name);
      try {
        const detail = await api<TableDetail>(`/v1/database/tables/${encodeURIComponent(name)}`);
        setTableDetail(detail);
        await loadRows(name, 0);
      } catch (err) {
        setTableDetail(null);
        setRowsPage(null);
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadRows],
  );

  const applyMigrations = useCallback(async () => {
    setDbBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await api<MigrationResult>("/v1/database/migrate", { method: "POST" });
      setMigration(data);
      setMessage(data.success ? "Migrations applied." : "Migration failed — see the log.");
      await refreshTables();
      await refreshStatus();
      if (selectedTable) {
        try {
          await openTable(selectedTable);
        } catch {
          /* table may no longer exist */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDbBusy(false);
    }
  }, [openTable, refreshStatus, refreshTables, selectedTable]);

  // -- example switching --------------------------------------------------
  async function perform(action: PendingAction) {
    setPending(null);
    if (!action) return;
    try {
      if (action.type === "openPersonal") {
        await api(`/v1/examples/${encodeURIComponent(action.id)}/activate`, { method: "POST" });
        setPreviewId(null);
        await refreshExamples();
        await loadWorkspace();
      } else if (action.type === "openBuiltin") {
        await loadPreview(action.id);
      } else if (action.type === "openFile") {
        await openFile(action.path, previewId);
      } else if (action.type === "run") {
        await run();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const guard = useCallback(
    (action: PendingAction) => {
      if (dirty && !previewId) {
        setPending(action);
        return;
      }
      void perform(action);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, previewId, perform],
  );

  async function resolvePending(kind: "save" | "discard" | "cancel") {
    const action = pending;
    if (kind === "cancel") {
      setPending(null);
      return;
    }
    if (kind === "save") {
      const ok = await save();
      if (!ok) return;
    }
    await perform(action);
  }

  async function submitNewExample() {
    setBusy(true);
    setError("");
    try {
      const created = await api<ExampleMeta>(
        "/v1/examples",
        jsonPost({ name: newName, description: newDesc, fromTemplateId: newTemplate }),
      );
      await api(`/v1/examples/${encodeURIComponent(created.id)}/activate`, { method: "POST" });
      setNewOpen(false);
      setNewName("");
      setNewDesc("");
      setNewTemplate("scratch");
      setPreviewId(null);
      await refreshExamples();
      await loadWorkspace();
      setMessage(`Created "${created.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateExample(id: string, activate: boolean, thenRun: boolean) {
    setBusy(true);
    setError("");
    try {
      const created = await api<ExampleMeta>(
        `/v1/examples/${encodeURIComponent(id)}/duplicate`,
        { method: "POST" },
      );
      if (activate) {
        await api(`/v1/examples/${encodeURIComponent(created.id)}/activate`, { method: "POST" });
        setPreviewId(null);
        await refreshExamples();
        await loadWorkspace();
        if (thenRun) await run();
      } else {
        await refreshExamples();
      }
      setMessage(`Created "${created.name}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitExampleRename() {
    if (!renameTarget) return;
    setBusy(true);
    setError("");
    try {
      await api(`/v1/examples/${encodeURIComponent(renameTarget.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: renameName, description: renameDesc }),
      });
      setRenameTarget(null);
      await refreshExamples();
      if (workspace?.id === renameTarget.id) await loadWorkspace();
      setMessage("Example updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError("");
    try {
      await api(`/v1/examples/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setDeleteTarget(null);
      setPreviewId(null);
      await refreshExamples();
      await loadWorkspace();
      setMessage("Example deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const stateClass = `state-${status.state}`;

  if (booting) {
    return (
      <div className="layout">
        <aside className="sidebar">
          <h1>Django Playground</h1>
        </aside>
        <main className="main">
          <div className="panel">
            <p className="muted">Preparing runner...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Django Playground</h1>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Local lab — Phase 3
        </p>

        <div className="section-head">
          <h2>Built-in Examples</h2>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Read-only. Copy one to edit and run it.
        </p>
        {examples.builtIn.map((item) => (
          <div className="example-row" key={item.id}>
            <button
              className={`example-name builtin ${previewId === item.id ? "active" : ""}`}
              onClick={() => guard({ type: "openBuiltin", id: item.id })}
              title={item.description}
            >
              {item.name}
            </button>
            <button
              className="icon-btn"
              disabled={busy}
              onClick={() => void duplicateExample(item.id, true, false)}
              title="Create an editable copy and open it"
            >
              Copy
            </button>
          </div>
        ))}

        <div className="section-head">
          <h2>My Examples</h2>
          <button className="icon-btn primary" disabled={busy} onClick={() => setNewOpen(true)}>
            + New
          </button>
        </div>
        {examples.personal.length === 0 && (
          <p className="muted" style={{ fontSize: 12 }}>
            No personal examples yet.
          </p>
        )}
        {examples.personal.map((item) => (
          <div className="example-row" key={item.id}>
            <button
              className={`example-name ${item.id === examples.activeExampleId && !previewId ? "active" : ""}`}
              onClick={() => guard({ type: "openPersonal", id: item.id })}
              title={item.description}
            >
              {item.name}
            </button>
            <button
              className="icon-btn"
              disabled={busy}
              onClick={() => {
                setRenameTarget(item);
                setRenameName(item.name);
                setRenameDesc(item.description ?? "");
              }}
              title="Rename"
            >
              Rename
            </button>
            <button
              className="icon-btn"
              disabled={busy}
              onClick={() => void duplicateExample(item.id, false, false)}
              title="Duplicate"
            >
              Dup
            </button>
            <button
              className="icon-btn danger"
              disabled={busy}
              onClick={() => setDeleteTarget(item)}
              title="Delete"
            >
              Del
            </button>
          </div>
        ))}

        <div className="section-head">
          <h2>Files</h2>
        </div>
        {files.map((file) => (
          <button
            key={file.path}
            className={`file-item ${file.path === currentPath ? "active" : ""}`}
            disabled={!file.editable}
            onClick={() => guard({ type: "openFile", path: file.path })}
            title={file.editable ? file.path : "not editable"}
          >
            {file.path}
            {!file.editable ? " (locked)" : ""}
          </button>
        ))}
      </aside>

      <main className="main">
        <div className="topbar">
          <span className={`badge ${stateClass}`}>
            <span className="dot" />
            {STATE_LABEL[status.state]}
          </span>

          {previewExample ? (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => void duplicateExample(previewExample.id, true, false)}
              >
                Create a copy
              </button>
              <button
                disabled={busy}
                onClick={() => void duplicateExample(previewExample.id, true, true)}
              >
                Try &amp; Run
              </button>
              <span className="spacer" />
              <button
                disabled={busy}
                onClick={() =>
                  guard({ type: "openPersonal", id: examples.activeExampleId ?? "" })
                }
              >
                Back to my example
              </button>
            </>
          ) : (
            <>
              <button className="primary" onClick={() => guard({ type: "run" })} disabled={busy}>
                Run / Restart
              </button>
              <button onClick={stop} disabled={busy || status.state === "stopped"}>
                Stop
              </button>
              <span className="spacer" />
              {dirty && <span className="warn">Unsaved changes</span>}
              <button className="primary" onClick={save} disabled={busy || !dirty}>
                Save
              </button>
              <button onClick={() => void bootstrap()} disabled={busy}>
                Retry
              </button>
            </>
          )}
        </div>

        <div className="panel">
          {runnerDown && (
            <div className="error-text">Runner is unreachable. Use Retry to try again.</div>
          )}
          {error && <div className="error-text">{error}</div>}
          {message && <div className="success">{message}</div>}
          {!previewExample && status.error && (
            <div className="error-text">Run error: {status.error}</div>
          )}

          {previewExample && (
            <div className="banner">
              Read-only built-in: <strong>{previewExample.name}</strong> — {previewExample.description}
            </div>
          )}

          <div className="row" style={{ alignItems: "stretch" }}>
            <div className="card" style={{ flex: 2 }}>
              <h2 className="ltr">
                {currentPath || "—"}
                {previewExample ? " (read-only)" : ""}
              </h2>
              <textarea
                className="editor"
                spellCheck={false}
                readOnly={Boolean(previewExample)}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setMessage("");
                }}
              />
            </div>

            <div className="card" style={{ flex: 1, minWidth: 340 }}>
              <div className="tabs">
                <button
                  className={`tab ${tab === "api" ? "active" : ""}`}
                  onClick={() => setTab("api")}
                >
                  API
                </button>
                <button
                  className={`tab ${tab === "database" ? "active" : ""}`}
                  onClick={() => {
                    setTab("database");
                    if (tables.length === 0) void refreshTables();
                  }}
                >
                  Database
                </button>
                <button
                  className={`tab ${tab === "log" ? "active" : ""}`}
                  onClick={() => setTab("log")}
                >
                  Log
                </button>
              </div>

              <div style={{ paddingTop: 12 }}>
                {tab === "api" && (
                  <div className="stack">
                    <div className="muted" style={{ fontSize: 12 }}>
                      Target: <strong>{workspace?.name}</strong>
                      {previewExample ? " (active example; previewing a built-in)" : ""}
                    </div>

                    {status.state !== "running" && !previewExample && (
                      <div className="banner">
                        API server is {STATE_LABEL[status.state].toLowerCase()}.{" "}
                        <button className="link-btn" onClick={() => guard({ type: "run" })}>
                          Run it to send requests.
                        </button>
                      </div>
                    )}

                    <div className="toolbar">
                      <select
                        className="method-select"
                        value={reqMethod}
                        onChange={(event) => setReqMethod(event.target.value)}
                      >
                        {METHODS.map((method) => (
                          <option key={method} value={method}>
                            {method}
                          </option>
                        ))}
                      </select>
                      <input
                        className="path-input"
                        placeholder="/api/items/"
                        value={reqPath}
                        onChange={(event) => setReqPath(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void sendRequest();
                        }}
                      />
                      <button className="primary" disabled={busy} onClick={() => void sendRequest()}>
                        Send
                      </button>
                    </div>

                    <div>
                      <button
                        className="icon-btn"
                        onClick={() => setShowRequestHeaders((value) => !value)}
                      >
                        {showRequestHeaders ? "Hide" : "Show"} headers ({reqHeaders.length})
                      </button>
                      {showRequestHeaders && (
                        <div style={{ marginTop: 8 }}>
                          {reqHeaders.map((header, index) => (
                            <div className="kv-row" key={index}>
                              <input
                                placeholder="Header"
                                value={header.key}
                                onChange={(event) => {
                                  const next = [...reqHeaders];
                                  next[index] = { ...next[index], key: event.target.value };
                                  setReqHeaders(next);
                                }}
                              />
                              <input
                                placeholder="Value"
                                value={header.value}
                                onChange={(event) => {
                                  const next = [...reqHeaders];
                                  next[index] = { ...next[index], value: event.target.value };
                                  setReqHeaders(next);
                                }}
                              />
                              <button
                                className="icon-btn danger"
                                onClick={() =>
                                  setReqHeaders(reqHeaders.filter((_, i) => i !== index))
                                }
                              >
                                x
                              </button>
                            </div>
                          ))}
                          <button
                            className="icon-btn"
                            onClick={() => setReqHeaders([...reqHeaders, { key: "", value: "" }])}
                          >
                            + Header
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>JSON body (used for POST / PUT / PATCH)</label>
                      <textarea
                        className="body"
                        spellCheck={false}
                        placeholder={'{\n  "name": "New item"\n}'}
                        value={reqBody}
                        onChange={(event) => setReqBody(event.target.value)}
                      />
                    </div>

                    <div className="row">
                      {loadedRequest ? (
                        <>
                          <button className="primary" disabled={busy} onClick={() => void updateSaved()}>
                            Update “{loadedRequest.name}”
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => {
                              setRenameName(loadedRequest.name);
                              setRenameOpen(true);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            className="icon-btn"
                            onClick={() => setLoadedRequestId(null)}
                            title="Detach from the saved request"
                          >
                            New
                          </button>
                        </>
                      ) : (
                        <button
                          disabled={busy}
                          onClick={() => {
                            setSaveName("");
                            setSaveOpen(true);
                          }}
                        >
                          Save request
                        </button>
                      )}
                    </div>

                    <div className="stack">
                      <h2>Saved requests</h2>
                      {savedRequests.length === 0 && (
                        <p className="muted" style={{ fontSize: 12 }}>
                          No saved requests for this example yet.
                        </p>
                      )}
                      {savedRequests.map((request) => (
                        <div className="request-item" key={request.id}>
                          <button
                            className={`request-name ${request.id === loadedRequestId ? "active" : ""}`}
                            onClick={() => loadSaved(request)}
                            title={request.path}
                          >
                            {request.name}
                          </button>
                          <button
                            className="icon-btn"
                            disabled={busy}
                            onClick={() => {
                              loadSaved(request);
                              void sendRequest();
                            }}
                          >
                            Send
                          </button>
                          <button
                            className="icon-btn danger"
                            disabled={busy}
                            onClick={() => void deleteSaved(request.id)}
                          >
                            Del
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="stack">
                      <h2>Response</h2>
                      {result ? (
                        <div className="stack">
                          <div className="ltr">
                            <span className={`status-badge ${statusClass(result.status)}`}>
                              {result.status}
                            </span>{" "}
                            <span className="muted">{result.durationMs} ms</span>
                            {result.truncated && <span className="muted"> • truncated</span>}
                          </div>
                          <button onClick={() => setShowResultHeaders((value) => !value)}>
                            {showResultHeaders ? "Hide headers" : "Show headers"}
                          </button>
                          {showResultHeaders && (
                            <pre className="logs ltr">
                              {Object.entries(result.headers)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join("\n")}
                            </pre>
                          )}
                          <pre className="logs ltr">
                            {prettyBody(result.body, result.contentType) || "(empty body)"}
                          </pre>
                        </div>
                      ) : (
                        <p className="muted">
                          No response yet. Activate an example, press Run, then Send.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {tab === "database" && (
                  <div className="stack">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div className="row" style={{ gap: 8 }}>
                        <button disabled={dbBusy} onClick={() => void refreshTables()}>
                          Refresh
                        </button>
                        <button
                          className="primary"
                          disabled={dbBusy}
                          onClick={() => void applyMigrations()}
                        >
                          {dbBusy ? "Working..." : "Apply DB Changes"}
                        </button>
                      </div>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {tables.length} tables
                      </span>
                    </div>

                    {migration && (
                      <div className="stack">
                        {migration.steps.map((step, index) => (
                          <pre className="logs ltr" key={index}>
                            {`$ ${step.command}\n${step.output || "(no output)"}`}
                          </pre>
                        ))}
                        <span className={migration.success ? "success" : "error-text"}>
                          {migration.success
                            ? `Migrations applied.${migration.restarted ? " Django restarted." : ""}`
                            : "Migration failed."}
                        </span>
                      </div>
                    )}

                    {!dbAvailable && (
                      <p className="muted">
                        No database yet. Press “Apply DB Changes” to create one.
                      </p>
                    )}

                    {dbAvailable && (
                      <div className="row" style={{ alignItems: "flex-start" }}>
                        <div className="stack" style={{ minWidth: 150 }}>
                          {tables.map((table) => (
                            <button
                              key={table.name}
                              className={`file-item ${selectedTable === table.name ? "active" : ""}`}
                              onClick={() => void openTable(table.name)}
                            >
                              {table.name}{" "}
                              <span className="muted">({table.rowCount})</span>
                            </button>
                          ))}
                        </div>

                        <div className="stack" style={{ flex: 1, minWidth: 0 }}>
                          {tableDetail && rowsPage ? (
                            <>
                              <div className="muted" style={{ fontSize: 12 }}>
                                {tableDetail.name} — {tableDetail.columns.length} columns,{" "}
                                {tableDetail.rowCount} rows
                              </div>
                              <div className="muted ltr" style={{ fontSize: 12 }}>
                                {tableDetail.columns
                                  .map(
                                    (column) =>
                                      `${column.name}${column.primaryKey ? " PK" : ""}${
                                        column.type ? ` (${column.type})` : ""
                                      }`,
                                  )
                                  .join("  •  ")}
                              </div>
                              {tableDetail.foreignKeys.length > 0 && (
                                <div className="muted ltr" style={{ fontSize: 12 }}>
                                  FK:{" "}
                                  {tableDetail.foreignKeys
                                    .map(
                                      (fk) =>
                                        `${fk.column} → ${fk.referencesTable}.${fk.referencesColumn}`,
                                    )
                                    .join("  •  ")}
                                </div>
                              )}
                              <div className="table-scroll">
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      {rowsPage.columns.map((column) => (
                                        <th key={column}>{column}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rowsPage.rows.map((row, rowIndex) => (
                                      <tr key={rowIndex}>
                                        {row.map((cell, cellIndex) => (
                                          <td key={cellIndex}>
                                            {cell === null ? "NULL" : String(cell)}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {rowsPage.total > 0 && (
                                <div className="pager">
                                  <button
                                    className="icon-btn"
                                    disabled={rowsPage.offset <= 0}
                                    onClick={() =>
                                      void loadRows(
                                        tableDetail.name,
                                        Math.max(0, rowsPage.offset - rowsPage.limit),
                                      )
                                    }
                                  >
                                    Prev
                                  </button>
                                  <span className="muted">
                                    {rowsPage.offset + 1}–
                                    {Math.min(rowsPage.offset + rowsPage.rows.length, rowsPage.total)}{" "}
                                    of {rowsPage.total}
                                  </span>
                                  <button
                                    className="icon-btn"
                                    disabled={rowsPage.offset + rowsPage.limit >= rowsPage.total}
                                    onClick={() =>
                                      void loadRows(
                                        tableDetail.name,
                                        rowsPage.offset + rowsPage.limit,
                                      )
                                    }
                                  >
                                    Next
                                  </button>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="muted">Select a table to view its rows.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "log" && (
                  <pre className="logs ltr">{logs.length ? logs.join("\n") : "—"}</pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {pending && (
        <div className="overlay">
          <div className="modal">
            <h2>Unsaved changes</h2>
            <p className="muted">The current file has unsaved changes. Do you want to save them?</p>
            <div className="row">
              <button className="primary" onClick={() => void resolvePending("save")}>
                Save and continue
              </button>
              <button className="danger" onClick={() => void resolvePending("discard")}>
                Continue without saving
              </button>
              <button onClick={() => void resolvePending("cancel")}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {saveOpen && (
        <div className="overlay">
          <div className="modal">
            <h2>Save request</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={saveName}
                autoFocus
                placeholder="List items"
                onChange={(event) => setSaveName(event.target.value)}
              />
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={busy || !saveName.trim()}
                onClick={() => void createSaved()}
              >
                Save
              </button>
              <button onClick={() => setSaveOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="overlay">
          <div className="modal">
            <h2>Rename request</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={renameName}
                autoFocus
                onChange={(event) => setRenameName(event.target.value)}
              />
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={busy || !renameName.trim()}
                onClick={() => void renameSaved()}
              >
                Save
              </button>
              <button onClick={() => setRenameOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {newOpen && (
        <div className="overlay">
          <div className="modal">
            <h2>New example</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={newName}
                autoFocus
                placeholder="My Expenses API"
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Description (optional)</label>
              <input value={newDesc} onChange={(event) => setNewDesc(event.target.value)} />
            </div>
            <div className="field">
              <label>Start from</label>
              <select value={newTemplate} onChange={(event) => setNewTemplate(event.target.value)}>
                {examples.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={busy || !newName.trim()}
                onClick={() => void submitNewExample()}
              >
                Create
              </button>
              <button onClick={() => setNewOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="overlay">
          <div className="modal">
            <h2>Rename example</h2>
            <div className="field">
              <label>Name</label>
              <input
                value={renameName}
                autoFocus
                onChange={(event) => setRenameName(event.target.value)}
              />
            </div>
            <div className="field">
              <label>Description</label>
              <input
                value={renameDesc}
                onChange={(event) => setRenameDesc(event.target.value)}
              />
            </div>
            <div className="row">
              <button
                className="primary"
                disabled={busy || !renameName.trim()}
                onClick={() => void submitExampleRename()}
              >
                Save
              </button>
              <button onClick={() => setRenameTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="overlay">
          <div className="modal">
            <h2>Delete example</h2>
            <p className="muted">
              Delete <strong>{deleteTarget.name}</strong>? This removes its source files, its
              SQLite database and its saved requests. Built-in examples are never affected.
            </p>
            <div className="row">
              <button className="danger" disabled={busy} onClick={() => void confirmDelete()}>
                Delete
              </button>
              <button onClick={() => setDeleteTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
