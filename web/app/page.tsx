"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RuntimeState = "stopped" | "starting" | "running" | "error";

interface RuntimeStatus {
  state: RuntimeState;
  exitCode: number | null;
  error: string | null;
  pid: number | null;
}

interface Workspace {
  id: string;
  name: string;
  description: string;
  readOnly: boolean;
  defaultOpenFile: string;
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
  | { type: "open"; path: string }
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

export default function Page() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
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

  const dirty = content !== savedContent;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

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

  const openFile = useCallback(async (path: string) => {
    const data = await api<{ content: string; path: string }>(
      `/v1/files/content?path=${encodeURIComponent(path)}`,
    );
    setCurrentPath(data.path);
    setContent(data.content);
    setSavedContent(data.content);
  }, []);

  const bootstrap = useCallback(async () => {
    setBooting(true);
    setError("");
    try {
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
      setRunnerDown(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunnerDown(true);
    } finally {
      setBooting(false);
    }
  }, [openFile, refreshLogs]);

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
    if (!currentPath) return false;
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
  }, [content, currentPath]);

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

  const testHello = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const data = await api<HttpResult>("/v1/runtime/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "GET", path: "/api/hello/" }),
      });
      setResult(data);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const requestWithGuard = useCallback(
    (action: PendingAction) => {
      if (dirty) {
        setPending(action);
        return;
      }
      void perform(action);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirty, perform],
  );

  async function perform(action: PendingAction) {
    setPending(null);
    if (!action) return;
    if (action.type === "open") {
      try {
        await openFile(action.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } else if (action.type === "run") {
      await run();
    } else if (action.type === "test") {
      await testHello();
    }
  }

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
          Local lab — Phase 1
        </p>

        <h2 style={{ marginTop: 20 }}>My Examples</h2>
        <button className="file-item active" style={{ fontFamily: "inherit" }}>
          {workspace?.name ?? "Scratch"}
        </button>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Managing multiple examples arrives in Phase 2. For now only this workspace is active.
        </p>

        <h2 style={{ marginTop: 20 }}>Files</h2>
        {files.map((file) => (
          <button
            key={file.path}
            className={`file-item ${file.path === currentPath ? "active" : ""}`}
            disabled={!file.editable}
            onClick={() => requestWithGuard({ type: "open", path: file.path })}
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

          <button className="primary" onClick={() => requestWithGuard({ type: "run" })} disabled={busy}>
            Run / Restart
          </button>
          <button onClick={stop} disabled={busy || status.state === "stopped"}>
            Stop
          </button>
          <button onClick={() => requestWithGuard({ type: "test" })} disabled={busy}>
            Test Hello API
          </button>

          <span className="spacer" />

          {dirty && <span className="warn">Unsaved changes</span>}
          <button className="primary" onClick={save} disabled={busy || !dirty}>
            Save
          </button>
          <button onClick={() => void bootstrap()} disabled={busy}>
            Retry
          </button>
        </div>

        <div className="panel">
          {runnerDown && (
            <div className="error-text">
              Runner is unreachable. Use Retry to try again.
            </div>
          )}
          {error && <div className="error-text">{error}</div>}
          {message && <div className="success">{message}</div>}
          {status.error && <div className="error-text">Run error: {status.error}</div>}

          <div className="row" style={{ alignItems: "stretch" }}>
            <div className="card" style={{ flex: 2 }}>
              <h2 className="ltr">{currentPath || "—"}</h2>
              <textarea
                className="editor"
                spellCheck={false}
                value={content}
                onChange={(event) => {
                  setContent(event.target.value);
                  setMessage("");
                }}
              />
            </div>

            <div className="stack" style={{ flex: 1, minWidth: 280 }}>
              <div className="card">
                <h2>Test Hello API response</h2>
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
                    No request sent yet. Press Run, then Test Hello API.
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
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div className="card" style={{ maxWidth: 420 }}>
            <h2>Unsaved changes</h2>
            <p className="muted">
              The current file has unsaved changes. Do you want to save them?
            </p>
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
    </div>
  );
}
