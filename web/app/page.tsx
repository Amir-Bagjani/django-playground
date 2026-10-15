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
}

type PendingAction =
  | { type: "openPersonal"; id: string }
  | { type: "openBuiltin"; id: string }
  | { type: "openFile"; path: string }
  | { type: "run" }
  | { type: "test" }
  | null;

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
  const [result, setResult] = useState<HttpResult | null>(null);
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [booting, setBooting] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [runnerDown, setRunnerDown] = useState<boolean>(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [showResultHeaders, setShowResultHeaders] = useState<boolean>(false);

  const [newOpen, setNewOpen] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newDesc, setNewDesc] = useState<string>("");
  const [newTemplate, setNewTemplate] = useState<string>("scratch");
  const [renameTarget, setRenameTarget] = useState<ExampleMeta | null>(null);
  const [renameName, setRenameName] = useState<string>("");
  const [renameDesc, setRenameDesc] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<ExampleMeta | null>(null);

  const dirty = content !== savedContent;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const previewExample = previewId
    ? examples.builtIn.find((item) => item.id === previewId) ?? null
    : null;

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
    const list = await api<{ files: FileEntry[] }>("/v1/files");
    setFiles(list.files);
    const target =
      list.files.find((f) => f.path === ws.defaultOpenFile && f.editable)?.path ??
      list.files.find((f) => f.editable)?.path;
    if (target) {
      await openFile(target);
    }
    await refreshLogs();
  }, [openFile, refreshLogs]);

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

  const testApi = useCallback(async () => {
    const path = workspace?.defaultRequestPath ?? "/api/hello/";
    setBusy(true);
    setError("");
    try {
      const data = await api<HttpResult>("/v1/runtime/request", jsonPost({ method: "GET", path }));
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [workspace]);

  async function perform(action: PendingAction) {
    setPending(null);
    if (!action) return;
    try {
      if (action.type === "openPersonal") {
        await api(`/v1/examples/${encodeURIComponent(action.id)}/activate`, { method: "POST" });
        setPreviewId(null);
        setResult(null);
        await refreshExamples();
        await loadWorkspace();
      } else if (action.type === "openBuiltin") {
        setResult(null);
        await loadPreview(action.id);
      } else if (action.type === "openFile") {
        await openFile(action.path, previewId);
      } else if (action.type === "run") {
        await run();
      } else if (action.type === "test") {
        await testApi();
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

  async function submitRename() {
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
          Local lab — Phase 2
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
              <button disabled={busy} onClick={() => guard({ type: "openPersonal", id: examples.activeExampleId ?? "" })}>
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
              <button onClick={() => guard({ type: "test" })} disabled={busy}>
                Test API
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

            <div className="stack" style={{ flex: 1, minWidth: 280 }}>
              <div className="card">
                <h2>API response</h2>
                {result ? (
                  <div className="stack">
                    <div className="ltr">
                      <strong>status:</strong> {result.status} — {result.durationMs} ms
                    </div>
                    <button onClick={() => setShowResultHeaders((v) => !v)}>
                      {showResultHeaders ? "Hide headers" : "Show headers"}
                    </button>
                    {showResultHeaders && (
                      <pre className="logs ltr">
                        {Object.entries(result.headers)
                          .map(([key, value]) => `${key}: ${value}`)
                          .join("\n")}
                      </pre>
                    )}
                    <pre className="logs ltr">{result.body}</pre>
                  </div>
                ) : (
                  <p className="muted">
                    No request sent yet. Activate an example, press Run, then Test API.
                  </p>
                )}
              </div>

              <div className="card" style={{ flex: 1 }}>
                <h2>Server Log</h2>
                <pre className="logs ltr">{logs.length ? logs.join("\n") : "—"}</pre>
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
                onClick={() => void submitRename()}
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
