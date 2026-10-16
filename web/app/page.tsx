"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import dynamic from "next/dynamic";

import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
  type LayoutStorage,
} from "react-resizable-panels";

import { FileTree, type FileEntry } from "./components/file-tree";
import { KebabMenu } from "./components/kebab-menu";
import {
  ChevronIcon,
  CloseIcon,
  CollapseIcon,
  CopyIcon,
  ExpandIcon,
  FileIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  RestartIcon,
  SpinnerIcon,
  StopIcon,
} from "./components/icons";
import { languageForPath } from "./components/language";

const CodeEditor = dynamic(() => import("./components/code-editor").then((mod) => mod.CodeEditor), {
  ssr: false,
  loading: () => <div className="editor-loading">Loading editor…</div>,
});

const COMPACT_QUERY = "(max-width: 900px)";

const layoutStorage: LayoutStorage = {
  getItem(key) {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore storage failures */
    }
  },
};

function useCompactLayout() {
  const [compact, setCompact] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(COMPACT_QUERY).matches;
  });

  useEffect(() => {
    const media = window.matchMedia(COMPACT_QUERY);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

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

interface ImportPreview {
  format?: string;
  version?: number;
  metadata?: { name?: string; description?: string };
  files?: Record<string, string>;
  requests?: unknown[];
  dataset?: { records?: unknown[] } | null;
}

interface DatasetPreview {
  recordCount: number;
  records: { model: string; count: number }[];
  databaseReady: boolean;
  compatible: boolean;
  missingModels: string[];
}

type Tab = "api" | "database" | "log";

interface OpenTab {
  key: string;
  exampleId: string;
  path: string;
  name: string;
}

type PendingAction =
  | { type: "openPersonal"; id: string }
  | { type: "openBuiltin"; id: string }
  | { type: "run" }
  | { type: "importFile" }
  | null;

interface CloseRequest {
  keys: string[];
  message: string;
}

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);
const DB_PAGE_SIZE = 50;

function tabKey(exampleId: string, path: string): string {
  return `file:///${exampleId}/${path}`;
}

function tabName(path: string): string {
  return path.split("/").pop() || path;
}

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

async function apiText(path: string): Promise<string> {
  const response = await fetch(`/api/runner${path}`, { cache: "no-store" });
  const text = await response.text();
  if (!response.ok) {
    let detail = "Unknown error";
    try {
      const data = JSON.parse(text) as { detail?: unknown };
      if (data && data.detail) detail = String(data.detail);
    } catch {
      if (text) detail = text;
    }
    throw new Error(detail);
  }
  return text;
}

function safeFileName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "example";
}

function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<string[]>([]);
  const [wordWrap, setWordWrap] = useState<boolean>(false);
  const [closeRequest, setCloseRequest] = useState<CloseRequest | null>(null);
  const [quickOpen, setQuickOpen] = useState<boolean>(false);
  const [quickQuery, setQuickQuery] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [booting, setBooting] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [runnerDown, setRunnerDown] = useState<boolean>(false);
  const [pending, setPending] = useState<PendingAction>(null);
  const [tab, setTab] = useState<Tab>("api");
  const [builtinOpen, setBuiltinOpen] = useState<boolean>(true);
  const [personalOpen, setPersonalOpen] = useState<boolean>(true);
  const [filesOpen, setFilesOpen] = useState<boolean>(true);

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

  // Import / export state
  const [exportOpen, setExportOpen] = useState<boolean>(false);
  const [exportIncludeDataset, setExportIncludeDataset] = useState<boolean>(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [datasetPayload, setDatasetPayload] = useState<unknown>(null);
  const [datasetPreview, setDatasetPreview] = useState<DatasetPreview | null>(null);
  const [datasetBusy, setDatasetBusy] = useState<boolean>(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const datasetInputRef = useRef<HTMLInputElement>(null);

  const tabsRef = useRef<OpenTab[]>([]);
  const activeKeyRef = useRef<string | null>(null);
  const documentsRef = useRef<Record<string, string>>({});
  const savedDocsRef = useRef<Record<string, string>>({});
  const dirtyKeysRef = useRef<Set<string>>(new Set());
  tabsRef.current = tabs;
  activeKeyRef.current = activeKey;

  const previewExample = previewId
    ? examples.builtIn.find((item) => item.id === previewId) ?? null
    : null;
  const loadedRequest = savedRequests.find((item) => item.id === loadedRequestId) ?? null;

  const activeTab = tabs.find((item) => item.key === activeKey) ?? null;
  const activeValue = activeKey ? documentsRef.current[activeKey] ?? "" : "";
  const openPaths = useMemo(() => tabs.map((item) => item.key), [tabs]);
  const contextId = previewId ?? workspace?.id ?? "";
  const editableFiles = files.filter((item) => item.editable);
  const anyDirty = dirtyKeys.length > 0;
  const anyDirtyRef = useRef(anyDirty);
  anyDirtyRef.current = anyDirty;

  const toastKeysRef = useRef<Set<string>>(new Set());
  const toastTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const toastIdRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    const timer = toastTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      toastTimersRef.current.delete(id);
    }
    setToasts((previous) => {
      const target = previous.find((item) => item.id === id);
      if (target) toastKeysRef.current.delete(`${target.kind}:${target.text}`);
      return previous.filter((item) => item.id !== id);
    });
  }, []);

  const pushToast = useCallback((kind: Toast["kind"], text: string) => {
    const message = (text ?? "").trim();
    if (!message) return;
    const dedupeKey = `${kind}:${message}`;
    if (toastKeysRef.current.has(dedupeKey)) return;
    toastKeysRef.current.add(dedupeKey);
    const id = toastIdRef.current + 1;
    toastIdRef.current = id;
    setToasts((previous) => [...previous, { id, kind, text: message }]);
    const ttl = kind === "error" ? 9000 : 4200;
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(id);
      toastKeysRef.current.delete(dedupeKey);
      setToasts((previous) => previous.filter((item) => item.id !== id));
    }, ttl);
    toastTimersRef.current.set(id, timer);
  }, []);

  const notifySuccess = useCallback((text: string) => pushToast("success", text), [pushToast]);
  const notifyError = useCallback((text: string) => pushToast("error", text), [pushToast]);

  useEffect(
    () => () => {
      toastTimersRef.current.forEach((timer) => clearTimeout(timer));
      toastTimersRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("playground.sidebar");
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        builtin?: boolean;
        personal?: boolean;
        files?: boolean;
      };
      if (typeof parsed.builtin === "boolean") setBuiltinOpen(parsed.builtin);
      if (typeof parsed.personal === "boolean") setPersonalOpen(parsed.personal);
      if (typeof parsed.files === "boolean") setFilesOpen(parsed.files);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        "playground.sidebar",
        JSON.stringify({ builtin: builtinOpen, personal: personalOpen, files: filesOpen }),
      );
    } catch {
      /* ignore storage failures */
    }
  }, [builtinOpen, personalOpen, filesOpen]);

  const compact = useCompactLayout();

  const sidebarPanelRef = usePanelRef();
  const rightPanelRef = usePanelRef();
  const focusSavedRef = useRef<{ sidebar: number; right: number } | null>(null);
  const [focusMode, setFocusMode] = useState<boolean>(false);

  const outerLayout = useDefaultLayout({
    id: "playground.layout.outer",
    panelIds: ["sidebar", "main"],
    onlySaveAfterUserInteractions: true,
    storage: layoutStorage,
  });
  const innerLayout = useDefaultLayout({
    id: "playground.layout.inner",
    panelIds: ["editor", "right"],
    onlySaveAfterUserInteractions: true,
    storage: layoutStorage,
  });

  const toggleFocus = useCallback(() => {
    const sidebar = sidebarPanelRef.current;
    const right = rightPanelRef.current;
    if (!focusMode) {
      focusSavedRef.current = {
        sidebar: sidebar?.getSize().asPercentage ?? 20,
        right: right?.getSize().asPercentage ?? 32,
      };
      sidebar?.collapse();
      right?.resize(compact ? "64" : "58");
      setFocusMode(true);
    } else {
      const saved = focusSavedRef.current;
      sidebar?.expand();
      if (saved) {
        right?.resize(String(saved.right));
        sidebar?.resize(String(saved.sidebar));
      }
      setFocusMode(false);
    }
  }, [compact, focusMode, sidebarPanelRef, rightPanelRef]);

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

  const openFile = useCallback(async (path: string, exampleId: string) => {
    const key = tabKey(exampleId, path);
    if (!(key in documentsRef.current)) {
      const data = await api<{ content: string; path: string }>(
        `/v1/files/content?path=${encodeURIComponent(path)}&exampleId=${encodeURIComponent(
          exampleId,
        )}`,
      );
      documentsRef.current[key] = data.content;
      savedDocsRef.current[key] = data.content;
      setTabs((previous) =>
        previous.some((item) => item.key === key)
          ? previous
          : [...previous, { key, exampleId, path: data.path, name: tabName(data.path) }],
      );
    }
    setActiveKey(key);
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
      await openFile(target, ws.id);
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
    try {
      await refreshExamples();
      await loadWorkspace();
      setPreviewId(null);
      setRunnerDown(false);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
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
      if (anyDirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // -- file editor --------------------------------------------------------
  const closeAllTabs = useCallback(() => {
    for (const tab of tabsRef.current) {
      delete documentsRef.current[tab.key];
      delete savedDocsRef.current[tab.key];
    }
    dirtyKeysRef.current = new Set();
    setDirtyKeys([]);
    setTabs([]);
    setActiveKey(null);
    setCloseRequest(null);
  }, []);

  const updateActiveValue = useCallback((value: string) => {
    const key = activeKeyRef.current;
    if (!key) return;
    documentsRef.current[key] = value;
    const isDirty = value !== savedDocsRef.current[key];
    const wasDirty = dirtyKeysRef.current.has(key);
    if (isDirty === wasDirty) return;
    if (isDirty) dirtyKeysRef.current.add(key);
    else dirtyKeysRef.current.delete(key);
    setDirtyKeys(Array.from(dirtyKeysRef.current));
  }, []);

  const saveTab = useCallback(
    async (key: string): Promise<boolean> => {
      if (previewId || !dirtyKeysRef.current.has(key)) return !previewId;
      const tab = tabsRef.current.find((item) => item.key === key);
      if (!tab) return false;
      try {
        await api("/v1/files/content", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path: tab.path, content: documentsRef.current[key] ?? "" }),
        });
        savedDocsRef.current[key] = documentsRef.current[key] ?? "";
        dirtyKeysRef.current.delete(key);
        setDirtyKeys(Array.from(dirtyKeysRef.current));
        return true;
      } catch (err) {
        notifyError(err instanceof Error ? err.message : String(err));
        return false;
      }
    },
    [previewId],
  );

  const saveAllDirty = useCallback(async (): Promise<boolean> => {
    if (previewId || dirtyKeysRef.current.size === 0) return true;
    setBusy(true);
    try {
      for (const key of Array.from(dirtyKeysRef.current)) {
        const ok = await saveTab(key);
        if (!ok) return false;
      }
      notifySuccess("Saved.");
      return true;
    } finally {
      setBusy(false);
    }
  }, [previewId, saveTab]);

  const saveAllDirtyRef = useRef(saveAllDirty);
  saveAllDirtyRef.current = saveAllDirty;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveAllDirtyRef.current();
      } else if (key === "p") {
        event.preventDefault();
        setQuickQuery("");
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const activateTab = useCallback((key: string) => {
    setActiveKey(key);
  }, []);

  const doCloseTab = useCallback((key: string) => {
    const list = tabsRef.current;
    const index = list.findIndex((item) => item.key === key);
    if (index < 0) return;
    const next = list.filter((item) => item.key !== key);
    delete documentsRef.current[key];
    delete savedDocsRef.current[key];
    dirtyKeysRef.current.delete(key);
    setDirtyKeys(Array.from(dirtyKeysRef.current));
    setTabs(next);
    if (activeKeyRef.current === key) {
      const fallback = next[index] ?? next[index - 1] ?? null;
      setActiveKey(fallback ? fallback.key : null);
    }
  }, []);

  const requestCloseTab = useCallback(
    (key: string) => {
      const tab = tabsRef.current.find((item) => item.key === key);
      if (tab && dirtyKeysRef.current.has(key)) {
        setCloseRequest({ keys: [key], message: `"${tab.name}" has unsaved changes.` });
        return;
      }
      doCloseTab(key);
    },
    [doCloseTab],
  );

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const next = await api<RuntimeStatus>("/v1/runtime/start", { method: "POST" });
      setStatus(next);
      await refreshLogs();
      if (next.state === "error") {
        notifyError(next.error ?? "Django failed to start.");
      } else if (next.state === "running") {
        notifySuccess("Django is running.");
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [refreshLogs]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      const next = await api<RuntimeStatus>("/v1/runtime/stop", { method: "POST" });
      setStatus(next);
      await refreshLogs();
      notifySuccess("Django stopped.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
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
      notifyError(err instanceof Error ? err.message : String(err));
      return [];
    }
  }, []);

  const sendRequest = useCallback(async () => {
    if (!reqPath.trim()) {
      notifyError("Enter a request path, for example /api/hello/.");
      return;
    }
    if (BODY_METHODS.has(reqMethod) && reqBody.trim()) {
      try {
        JSON.parse(reqBody);
      } catch {
        notifyError("Request body is not valid JSON.");
        return;
      }
    }
    setBusy(true);
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
      notifyError(err instanceof Error ? err.message : String(err));
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
      notifySuccess(`Saved request "${created.name}".`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, reqBody, reqHeaders, reqMethod, reqPath, saveName]);

  const updateSaved = useCallback(async () => {
    if (!loadedRequestId) return;
    setBusy(true);
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
      notifySuccess("Saved request updated.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, loadedRequestId, reqBody, reqHeaders, reqMethod, reqPath]);

  const renameSaved = useCallback(async () => {
    if (!loadedRequestId) return;
    setBusy(true);
    try {
      await api(`/v1/requests/${encodeURIComponent(loadedRequestId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: renameName }),
      });
      setRenameOpen(false);
      await loadSavedRequests();
      notifySuccess("Saved request renamed.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [loadSavedRequests, loadedRequestId, renameName]);

  const deleteSaved = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await api(`/v1/requests/${encodeURIComponent(id)}`, { method: "DELETE" });
        if (loadedRequestId === id) setLoadedRequestId(null);
        await loadSavedRequests();
        notifySuccess("Saved request deleted.");
      } catch (err) {
        notifyError(err instanceof Error ? err.message : String(err));
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
      notifyError(err instanceof Error ? err.message : String(err));
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
        notifyError(err instanceof Error ? err.message : String(err));
      }
    },
    [loadRows],
  );

  const applyMigrations = useCallback(async () => {
    setDbBusy(true);
    try {
      const data = await api<MigrationResult>("/v1/database/migrate", { method: "POST" });
      setMigration(data);
      if (data.success) notifySuccess("Migrations applied.");
      else notifyError("Migration failed — see the log.");
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
      notifyError(err instanceof Error ? err.message : String(err));
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
        closeAllTabs();
        await api(`/v1/examples/${encodeURIComponent(action.id)}/activate`, { method: "POST" });
        setPreviewId(null);
        await refreshExamples();
        await loadWorkspace();
      } else if (action.type === "openBuiltin") {
        closeAllTabs();
        await loadPreview(action.id);
      } else if (action.type === "run") {
        await run();
      } else if (action.type === "importFile") {
        importInputRef.current?.click();
      }
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    }
  }

  const guard = useCallback(
    (action: PendingAction) => {
      if (anyDirtyRef.current && !previewId) {
        setPending(action);
        return;
      }
      void perform(action);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [previewId, perform],
  );

  async function resolvePending(kind: "save" | "discard" | "cancel") {
    const action = pending;
    if (kind === "cancel") {
      setPending(null);
      return;
    }
    if (kind === "save") {
      const ok = await saveAllDirty();
      if (!ok) return;
    }
    await perform(action);
  }

  async function resolveClose(kind: "save" | "discard" | "cancel") {
    const request = closeRequest;
    if (!request || kind === "cancel") {
      setCloseRequest(null);
      return;
    }
    setCloseRequest(null);
    if (kind === "save") {
      for (const key of request.keys) {
        const ok = await saveTab(key);
        if (!ok) return;
      }
    }
    for (const key of request.keys) doCloseTab(key);
  }

  async function submitNewExample() {
    setBusy(true);
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
      closeAllTabs();
      await refreshExamples();
      await loadWorkspace();
      notifySuccess(`Created "${created.name}".`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function duplicateExample(id: string, activate: boolean, thenRun: boolean) {
    setBusy(true);
    try {
      const created = await api<ExampleMeta>(
        `/v1/examples/${encodeURIComponent(id)}/duplicate`,
        { method: "POST" },
      );
      if (activate) {
        await api(`/v1/examples/${encodeURIComponent(created.id)}/activate`, { method: "POST" });
        setPreviewId(null);
        closeAllTabs();
        await refreshExamples();
        await loadWorkspace();
        if (thenRun) await run();
      } else {
        await refreshExamples();
      }
      notifySuccess(`Created "${created.name}".`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitExampleRename() {
    if (!renameTarget) return;
    setBusy(true);
    try {
      await api(`/v1/examples/${encodeURIComponent(renameTarget.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: renameName, description: renameDesc }),
      });
      setRenameTarget(null);
      await refreshExamples();
      if (workspace?.id === renameTarget.id) await loadWorkspace();
      notifySuccess("Example updated.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api(`/v1/examples/${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      setDeleteTarget(null);
      setPreviewId(null);
      closeAllTabs();
      await refreshExamples();
      await loadWorkspace();
      notifySuccess("Example deleted.");
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // -- import / export ----------------------------------------------------
  async function downloadExample(id: string, includeDataset: boolean, label: string) {
    setBusy(true);
    try {
      const text = await apiText(
        `/v1/examples/${encodeURIComponent(id)}/export?includeDataset=${includeDataset}`,
      );
      const parsed = JSON.parse(text) as {
        files?: Record<string, string>;
        requests?: unknown[];
        dataset?: unknown;
        redactedSensitiveHeaders?: boolean;
      };
      downloadText(`${safeFileName(label)}.example.json`, text);
      const parts = [
        `${Object.keys(parsed.files ?? {}).length} files`,
        `${(parsed.requests ?? []).length} saved requests`,
        parsed.dataset ? "with dataset" : "without dataset",
      ];
      notifySuccess(
        `Exported ${parts.join(", ")}.${
          parsed.redactedSensitiveHeaders ? " Sensitive request headers were removed." : ""
        }`,
      );
      return true;
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as ImportPreview;
      if (payload.format !== "django-playground.example") {
        notifyError("This is not a Django Playground example file.");
        return;
      }
      setImportPreview(payload);
    } catch {
      notifyError("This is not valid JSON.");
    }
  }

  async function performImport() {
    if (!importPreview) return;
    setBusy(true);
    try {
      const created = await api<ExampleMeta>("/v1/examples/import", jsonPost(importPreview));
      await api(`/v1/examples/${encodeURIComponent(created.id)}/activate`, { method: "POST" });
      setImportPreview(null);
      setPreviewId(null);
      closeAllTabs();
      await refreshExamples();
      await loadWorkspace();
      notifySuccess(`Imported "${created.name}".`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportActiveDataset() {
    if (!workspace) return;
    setDatasetBusy(true);
    try {
      const text = await apiText(`/v1/examples/${encodeURIComponent(workspace.id)}/dataset/export`);
      const parsed = JSON.parse(text) as { records?: unknown[] };
      downloadText(`${safeFileName(workspace.name)}.dataset.json`, text);
      notifySuccess(`Exported ${(parsed.records ?? []).length} records.`);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setDatasetBusy(false);
    }
  }

  async function handleDatasetFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !workspace) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as unknown;
      const preview = await api<DatasetPreview>(
        `/v1/examples/${encodeURIComponent(workspace.id)}/dataset/preview`,
        jsonPost(payload),
      );
      setDatasetPayload(payload);
      setDatasetPreview(preview);
    } catch (err) {
      notifyError(err instanceof Error ? err.message : String(err));
    }
  }

  async function confirmDatasetReplace() {
    if (!workspace || datasetPayload === null) return;
    setDatasetBusy(true);
    try {
      const result = await api<{ success: boolean; loaded: number; restarted: boolean }>(
        `/v1/examples/${encodeURIComponent(workspace.id)}/dataset/replace`,
        jsonPost(datasetPayload),
      );
      setDatasetPreview(null);
      setDatasetPayload(null);
      notifySuccess(
        `Loaded ${result.loaded} records into ${workspace.name}.${
          result.restarted ? " Django restarted." : ""
        }`,
      );
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
      notifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setDatasetBusy(false);
    }
  }

  const runtimeLoading = busy || status.state === "starting";

  if (booting) {
    return (
      <div className="app app-booting">
        <div className="boot-panel">
          <div className="brand">
            <span className="mark">D</span>
            <h1>Django Playground</h1>
          </div>
          <div className="alert info">Connecting to the runner…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <Group
        orientation={compact ? "vertical" : "horizontal"}
        className={`layout-group ${compact ? "layout-vertical" : "layout-horizontal"}`}
        defaultLayout={outerLayout.defaultLayout}
        onLayoutChanged={outerLayout.onLayoutChanged}
      >
        <Panel
          id="sidebar"
          className="pane pane-sidebar"
          style={{ overflow: "hidden" }}
          collapsible
          collapsedSize={0}
          defaultSize={compact ? 160 : 280}
          minSize={compact ? 110 : 200}
          maxSize={compact ? "50" : 460}
          groupResizeBehavior="preserve-pixel-size"
          panelRef={sidebarPanelRef}
        >
          <aside className="sidebar">
            <div className="brand">
              <span className="mark">D</span>
              <h1>Django Playground</h1>
            </div>

        <div className="side-scroll">
          <section className="side-section">
            <button
              type="button"
              className="side-head"
              aria-expanded={builtinOpen}
              onClick={() => setBuiltinOpen((value) => !value)}
            >
              <ChevronIcon className={`chev ${builtinOpen ? "open" : ""}`} />
              <span>Built-in Examples</span>
              <span className="count">{examples.builtIn.length}</span>
            </button>
            {builtinOpen && (
              <div className="side-list">
                {examples.builtIn.map((item) => (
                  <div
                    className={`example-item builtin ${previewId === item.id ? "active" : ""}`}
                    key={item.id}
                  >
                    <button
                      className="example-name"
                      onClick={() => guard({ type: "openBuiltin", id: item.id })}
                      title={item.description}
                    >
                      {item.name}
                    </button>
                    <button
                      className="icon-btn example-copy"
                      disabled={busy}
                      onClick={() => void duplicateExample(item.id, true, false)}
                      title="Create an editable copy and open it"
                      aria-label={`Copy ${item.name}`}
                    >
                      <CopyIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="side-section">
            <div className="side-head static">
              <button
                type="button"
                className="side-toggle"
                aria-expanded={personalOpen}
                onClick={() => setPersonalOpen((value) => !value)}
              >
                <ChevronIcon className={`chev ${personalOpen ? "open" : ""}`} />
                <span>My Examples</span>
                <span className="count">{examples.personal.length}</span>
              </button>
              <button
                className="icon-btn head-action"
                disabled={busy}
                onClick={() => setNewOpen(true)}
                title="New example"
              >
                <PlusIcon /> New
              </button>
            </div>
            {personalOpen && (
              <div className="side-list">
                {examples.personal.length === 0 && (
                  <p className="side-empty">No personal examples yet.</p>
                )}
                {examples.personal.map((item) => (
                  <div
                    className={`example-item ${
                      item.id === examples.activeExampleId && !previewId ? "active" : ""
                    }`}
                    key={item.id}
                  >
                    <button
                      className="example-name"
                      onClick={() => guard({ type: "openPersonal", id: item.id })}
                      title={item.description}
                    >
                      {item.name}
                    </button>
                    <KebabMenu
                      label={`Actions for ${item.name}`}
                      items={[
                        {
                          label: "Rename",
                          onSelect: () => {
                            setRenameTarget(item);
                            setRenameName(item.name);
                            setRenameDesc(item.description ?? "");
                          },
                        },
                        {
                          label: "Duplicate",
                          onSelect: () => void duplicateExample(item.id, false, false),
                        },
                        {
                          label: "Delete",
                          onSelect: () => setDeleteTarget(item),
                          danger: true,
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="side-section">
            <button
              type="button"
              className="side-head"
              aria-expanded={filesOpen}
              onClick={() => setFilesOpen((value) => !value)}
            >
              <ChevronIcon className={`chev ${filesOpen ? "open" : ""}`} />
              <span>Files</span>
            </button>
            {filesOpen && (
              <FileTree
                files={files}
                currentPath={activeTab?.path ?? ""}
                onOpen={(path) => {
                  if (contextId) void openFile(path, contextId);
                }}
                disabled={busy}
              />
            )}
          </section>
        </div>
          </aside>
        </Panel>

        <Separator className="resize-handle" id="handle-sidebar" />

        <Panel
          id="main"
          className="pane pane-main"
          style={{ overflow: "hidden" }}
          minSize={compact ? 160 : 360}
        >
          <main className="main">
        <div className="topbar">
          <span
            className={`runtime-status state-${status.state}`}
            role="status"
            aria-live="polite"
            title={`Runtime: ${STATE_LABEL[status.state]}`}
          >
            {status.state === "starting" ? <SpinnerIcon className="spin" /> : <span className="dot" />}
            <span className="runtime-text">{STATE_LABEL[status.state]}</span>
          </span>
          <span className="topbar-title">
            {previewExample ? `Previewing: ${previewExample.name}` : workspace?.name}
          </span>
          <span className="spacer" />

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
              <button
                disabled={busy}
                onClick={() => void downloadExample(previewExample.id, false, previewExample.name)}
              >
                Export
              </button>
              <span className="divider" />
              <button
                disabled={busy}
                onClick={() => guard({ type: "openPersonal", id: examples.activeExampleId ?? "" })}
              >
                Back to my example
              </button>
            </>
          ) : (
            <>
              <div className="runtime-controls">
                <button
                  type="button"
                  className="runtime-btn"
                  aria-label="Run"
                  title="Run"
                  disabled={runtimeLoading || status.state === "running"}
                  onClick={() => guard({ type: "run" })}
                >
                  <PlayIcon />
                </button>
                <button
                  type="button"
                  className="runtime-btn"
                  aria-label="Restart"
                  title="Restart"
                  disabled={runtimeLoading || status.state !== "running"}
                  onClick={() => guard({ type: "run" })}
                >
                  <RestartIcon />
                </button>
                <button
                  type="button"
                  className="runtime-btn"
                  aria-label="Stop"
                  title="Stop"
                  disabled={runtimeLoading || status.state === "stopped"}
                  onClick={stop}
                >
                  <StopIcon />
                </button>
              </div>
              <span className="divider" />
              <div className="topbar-group">
                <button
                  className="primary"
                  onClick={() => void saveAllDirty()}
                  disabled={busy || !anyDirty}
                  title="Save all changes (Ctrl/Cmd+S)"
                >
                  Save
                </button>
                {anyDirty && <span className="warn">Unsaved changes</span>}
              </div>
              <span className="divider" />
              <div className="topbar-group">
                <button
                  disabled={busy}
                  onClick={() => {
                    setExportIncludeDataset(false);
                    setExportOpen(true);
                  }}
                  title="Download this example as a JSON file"
                >
                  Export
                </button>
                <button
                  disabled={busy}
                  onClick={() => guard({ type: "importFile" })}
                  title="Import an example from a JSON file"
                >
                  Import
                </button>
              </div>
              <span className="divider" />
              <button onClick={() => void bootstrap()} disabled={busy} title="Reload from the runner">
                Retry
              </button>
            </>
          )}
        </div>

        {(runnerDown || previewExample || (!previewExample && status.error)) && (
          <div className="alerts">
            {runnerDown && (
              <div className="alert error">Runner is unreachable. Use Retry to try again.</div>
            )}
            {!previewExample && status.error && (
              <div className="alert error">Run error: {status.error}</div>
            )}
            {previewExample && (
              <div className="alert info">
                Read-only built-in: <strong>{previewExample.name}</strong> — {previewExample.description}
              </div>
            )}
          </div>
        )}

        <div className="workarea">
          <Group
            orientation={compact ? "vertical" : "horizontal"}
            className={`layout-group ${compact ? "layout-vertical" : "layout-horizontal"}`}
            defaultLayout={innerLayout.defaultLayout}
            onLayoutChanged={innerLayout.onLayoutChanged}
          >
            <Panel
              id="editor"
              className="pane pane-editor"
              style={{ overflow: "hidden" }}
              minSize={compact ? 160 : 320}
            >
              <section className="editor-pane">
            <div className="tabbar" role="tablist">
              {tabs.map((item) => {
                const isActive = item.key === activeKey;
                const isDirty = dirtyKeys.includes(item.key);
                return (
                  <div
                    key={item.key}
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={0}
                    className={`file-tab ${isActive ? "active" : ""}`}
                    title={item.path}
                    onClick={() => activateTab(item.key)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        activateTab(item.key);
                      }
                    }}
                  >
                    <FileIcon className="tab-icon" />
                    <span className="tab-name">{item.name}</span>
                    {isDirty && <span className="tab-dot" title="Unsaved changes" />}
                    <button
                      type="button"
                      className="tab-close"
                      title="Close"
                      aria-label={`Close ${item.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        requestCloseTab(item.key);
                      }}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                );
              })}
              <span className="tabbar-spacer" />
              {previewExample && <span className="tab-note">read-only</span>}
              <button
                type="button"
                className="tabbar-action"
                onClick={() => {
                  setQuickQuery("");
                  setQuickOpen(true);
                }}
                title="Quick open (Ctrl/Cmd+P)"
              >
                Quick open
              </button>
            </div>
            <CodeEditor
              path={activeKey}
              paths={openPaths}
              displayPath={activeTab?.path ?? ""}
              defaultValue={activeValue}
              language={activeTab ? languageForPath(activeTab.path) : "plaintext"}
              readOnly={Boolean(previewExample)}
              wordWrap={wordWrap}
              dirty={activeKey ? dirtyKeys.includes(activeKey) : false}
              onValueChange={updateActiveValue}
              onSave={() => void saveAllDirty()}
              onToggleWordWrap={() => setWordWrap((value) => !value)}
            />
          </section>
            </Panel>

            <Separator className="resize-handle" id="handle-right" />

            <Panel
              id="right"
              className="pane pane-right"
              style={{ overflow: "hidden" }}
              collapsible
              collapsedSize={0}
              defaultSize={compact ? 220 : 440}
              minSize={compact ? 140 : 300}
              maxSize={compact ? "70" : "75"}
              groupResizeBehavior="preserve-pixel-size"
              panelRef={rightPanelRef}
            >
          <aside className="side-panel">
            <div className="panel-tabs">
              <button
                className={`panel-tab ${tab === "api" ? "active" : ""}`}
                onClick={() => setTab("api")}
              >
                API
              </button>
              <button
                className={`panel-tab ${tab === "database" ? "active" : ""}`}
                onClick={() => {
                  setTab("database");
                  if (tables.length === 0) void refreshTables();
                }}
              >
                Database
              </button>
              <button
                className={`panel-tab ${tab === "log" ? "active" : ""}`}
                onClick={() => setTab("log")}
              >
                Log
              </button>
              <span className="panel-tabs-spacer" />
              <button
                type="button"
                className={`panel-expand ${focusMode ? "active" : ""}`}
                aria-pressed={focusMode}
                title={focusMode ? "Exit focus mode" : "Focus panel"}
                aria-label={focusMode ? "Exit focus mode" : "Focus panel"}
                onClick={toggleFocus}
              >
                {focusMode ? <CollapseIcon /> : <ExpandIcon />}
              </button>
            </div>

            <div className="panel-body">
                {tab === "api" && (
                  <div className="stack">
                    <div className="muted" style={{ fontSize: 12 }}>
                      Target: <strong>{workspace?.name}</strong>
                      {previewExample ? " (active example; previewing a built-in)" : ""}
                    </div>

                    {status.state !== "running" && !previewExample && (
                      <div className="alert info">
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
                  <div className="db">
                    <div className="db-toolbar">
                      <button
                        className="icon-btn db-toolbar-icon"
                        disabled={dbBusy}
                        onClick={() => void refreshTables()}
                        title="Refresh tables"
                        aria-label="Refresh tables"
                      >
                        <RefreshIcon />
                      </button>
                      <button
                        className="primary"
                        disabled={dbBusy}
                        onClick={() => void applyMigrations()}
                        title="Create or update the SQLite schema"
                      >
                        {dbBusy ? "Working…" : "Apply DB Changes"}
                      </button>
                      <span className="db-toolbar-spacer" />
                      <button
                        className="db-toolbar-btn"
                        disabled={datasetBusy || dbBusy}
                        onClick={() => void exportActiveDataset()}
                        title="Download the demo data as a JSON fixture"
                      >
                        Export Dataset
                      </button>
                      <button
                        className="db-toolbar-btn"
                        disabled={datasetBusy || dbBusy}
                        onClick={() => datasetInputRef.current?.click()}
                        title="Replace the demo data from a JSON fixture"
                      >
                        Import Dataset
                      </button>
                    </div>

                    {migration && (
                      <div className="migration-block">
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
                        No database yet. Run the example or press “Apply DB Changes” to create one.
                      </p>
                    )}

                    {dbAvailable && (
                      <div className="db-layout">
                        <div className="db-tables">
                          <div className="db-section-label">
                            <span>Tables</span>
                            <span className="count">{tables.length}</span>
                          </div>
                          <div className="db-table-list">
                            {tables.length === 0 && <p className="side-empty">No tables found.</p>}
                            {tables.map((table) => (
                              <button
                                key={table.name}
                                className={`db-table ${selectedTable === table.name ? "active" : ""}`}
                                onClick={() => void openTable(table.name)}
                                title={table.name}
                              >
                                <span className="db-table-name truncate ltr">{table.name}</span>
                                <span className="db-count">{table.rowCount}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="db-detail">
                          {tableDetail && rowsPage ? (
                            <>
                              <div className="db-detail-head">
                                <span className="db-detail-name truncate ltr" title={tableDetail.name}>
                                  {tableDetail.name}
                                </span>
                                <div className="db-stats">
                                  <span className="db-stat">
                                    <strong>{tableDetail.rowCount}</strong> rows
                                  </span>
                                  <span className="db-stat">
                                    <strong>{tableDetail.columns.length}</strong> columns
                                  </span>
                                  <span className="db-stat">
                                    <strong>
                                      {
                                        tableDetail.columns.filter((column) => column.primaryKey)
                                          .length
                                      }
                                    </strong>{" "}
                                    pk
                                  </span>
                                  <span className="db-stat">
                                    <strong>{tableDetail.foreignKeys.length}</strong> fk
                                  </span>
                                </div>
                              </div>

                              <details className="db-section" open>
                                <summary className="db-section-head">
                                  <span>Schema</span>
                                  <span className="db-section-hint">
                                    {tableDetail.columns.length} columns
                                    {tableDetail.foreignKeys.length > 0
                                      ? ` · ${tableDetail.foreignKeys.length} foreign keys`
                                      : ""}
                                  </span>
                                </summary>
                                <div className="db-section-body">
                                  <div className="schema-scroll">
                                    <table className="schema-table">
                                      <thead>
                                        <tr>
                                          <th>column</th>
                                          <th>type</th>
                                          <th>key</th>
                                          <th>null</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {tableDetail.columns.map((column) => (
                                          <tr key={column.name}>
                                            <td className="ltr" title={column.name}>
                                              {column.name}
                                            </td>
                                            <td className="ltr" title={column.type || ""}>
                                              {column.type || "—"}
                                            </td>
                                            <td>
                                              {column.primaryKey ? (
                                                <span className="badge-tag pk">PK</span>
                                              ) : (
                                                ""
                                              )}
                                            </td>
                                            <td>{column.notNull ? "no" : "yes"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>

                                  {tableDetail.foreignKeys.length > 0 && (
                                    <div className="db-fk">
                                      <div className="db-fk-title">Foreign keys</div>
                                      <ul className="fk-list">
                                        {tableDetail.foreignKeys.map((fk, index) => (
                                          <li key={index} className="ltr">
                                            <span className="badge-tag fk">{fk.column}</span>{" "}
                                            → {fk.referencesTable}.{fk.referencesColumn}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                </div>
                              </details>

                              <div className="db-section">
                                <div className="db-section-head static">
                                  <span>Records</span>
                                  <span className="db-section-hint">{rowsPage.total} rows</span>
                                </div>
                                {rowsPage.rows.length === 0 ? (
                                  <p className="muted db-empty">This table has no rows yet.</p>
                                ) : (
                                  <div className="table-scroll">
                                    <table className="data-table">
                                      <thead>
                                        <tr>
                                          {rowsPage.columns.map((column) => (
                                            <th key={column} scope="col">
                                              {column}
                                            </th>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {rowsPage.rows.map((row, rowIndex) => (
                                          <tr key={rowIndex}>
                                            {row.map((cell, cellIndex) => (
                                              <td
                                                key={cellIndex}
                                                className={cell === null ? "cell-null" : ""}
                                                title={cell === null ? "NULL" : String(cell)}
                                              >
                                                {cell === null ? "NULL" : String(cell)}
                                              </td>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
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
                                  <span>
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
                            <p className="muted">Select a table to view its schema and rows.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {tab === "log" && (
                  <div className="log-view">
                    <pre className="logs ltr">{logs.length ? logs.join("\n") : "No logs yet."}</pre>
                  </div>
                )}
            </div>
          </aside>
            </Panel>
          </Group>
        </div>
          </main>
        </Panel>
      </Group>

      {pending && (
        <div className="overlay">
          <div className="modal">
            <h2>Unsaved changes</h2>
            <p className="muted">
              {dirtyKeys.length === 1
                ? "One file has unsaved changes."
                : `${dirtyKeys.length} files have unsaved changes.`}{" "}
              Do you want to save them before continuing?
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

      {closeRequest && (
        <div className="overlay">
          <div className="modal">
            <h2>Unsaved changes</h2>
            <p className="muted">{closeRequest.message} Do you want to save before closing?</p>
            <div className="row">
              <button className="primary" onClick={() => void resolveClose("save")}>
                Save and close
              </button>
              <button className="danger" onClick={() => void resolveClose("discard")}>
                Close without saving
              </button>
              <button onClick={() => void resolveClose("cancel")}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {quickOpen && (
        <div className="overlay" onMouseDown={() => setQuickOpen(false)}>
          <div className="modal quick-open" onMouseDown={(event) => event.stopPropagation()}>
            <input
              className="quick-input"
              autoFocus
              placeholder="Search files by name…"
              value={quickQuery}
              onChange={(event) => setQuickQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuickOpen(false);
                if (event.key === "Enter") {
                  const query = quickQuery.trim().toLowerCase();
                  const first = editableFiles.find((file) =>
                    file.path.toLowerCase().includes(query),
                  );
                  if (first && contextId) {
                    setQuickOpen(false);
                    void openFile(first.path, contextId);
                  }
                }
              }}
            />
            <div className="quick-list">
              {editableFiles
                .filter((file) => file.path.toLowerCase().includes(quickQuery.trim().toLowerCase()))
                .map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    className="quick-item ltr"
                    onClick={() => {
                      setQuickOpen(false);
                      if (contextId) void openFile(file.path, contextId);
                    }}
                  >
                    {file.path}
                  </button>
                ))}
              {editableFiles.filter((file) =>
                file.path.toLowerCase().includes(quickQuery.trim().toLowerCase()),
              ).length === 0 && <p className="muted">No matching files.</p>}
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

      {exportOpen && workspace && (
        <div className="overlay">
          <div className="modal">
            <h2>Export example</h2>
            <p className="muted">
              Download <strong>{workspace.name}</strong> as a single JSON file.
            </p>
            <label className="check-row">
              <input
                type="checkbox"
                checked={exportIncludeDataset}
                onChange={(event) => setExportIncludeDataset(event.target.checked)}
              />
              Include the current dataset (database rows)
            </label>
            <div className="notice" style={{ marginTop: 10 }}>
              Saved requests are exported without sensitive headers (Authorization, Cookie, …).
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void downloadExample(
                    workspace.id,
                    exportIncludeDataset,
                    workspace.name,
                  ).then((ok) => {
                    if (ok) setExportOpen(false);
                  })
                }
              >
                Download
              </button>
              <button onClick={() => setExportOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {importPreview && (
        <div className="overlay">
          <div className="modal">
            <h2>Import example</h2>
            <div className="stack">
              <div>
                <strong>{importPreview.metadata?.name || "(unnamed example)"}</strong>
                {importPreview.metadata?.description ? (
                  <span className="muted"> — {importPreview.metadata.description}</span>
                ) : null}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {Object.keys(importPreview.files ?? {}).length} files •{" "}
                {(importPreview.requests ?? []).length} saved requests •{" "}
                {importPreview.dataset
                  ? `dataset with ${importPreview.dataset.records?.length ?? 0} records`
                  : "no dataset"}
              </div>
              <div className="notice">
                Importing always creates a new example. Your existing examples are never overwritten.
              </div>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="primary" disabled={busy} onClick={() => void performImport()}>
                Import
              </button>
              <button onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {datasetPreview && (
        <div className="overlay">
          <div className="modal">
            <h2>Import dataset</h2>
            <div className="stack">
              <p className="muted" style={{ margin: 0 }}>
                This replaces <strong>all</strong> data in{" "}
                <strong>{workspace?.name ?? "this example"}</strong>. The current rows are deleted
                first, then the file is loaded.
              </p>
              <div className="muted" style={{ fontSize: 12 }}>
                {datasetPreview.recordCount} records
                {datasetPreview.records.length > 0
                  ? `: ${datasetPreview.records
                      .map((entry) => `${entry.model} × ${entry.count}`)
                      .join(", ")}`
                  : ""}
              </div>
              {!datasetPreview.databaseReady && (
                <div className="notice">
                  No database yet. It will be prepared before the data is loaded.
                </div>
              )}
              {datasetPreview.databaseReady && !datasetPreview.compatible && (
                <div className="error-text">
                  Incompatible: unknown models {datasetPreview.missingModels.join(", ")}. Apply DB
                  Changes first.
                </div>
              )}
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="danger"
                disabled={
                  datasetBusy || (datasetPreview.databaseReady && !datasetPreview.compatible)
                }
                onClick={() => void confirmDatasetReplace()}
              >
                {datasetBusy ? "Working..." : "Replace dataset"}
              </button>
              <button
                onClick={() => {
                  setDatasetPreview(null);
                  setDatasetPayload(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(event) => void handleImportFile(event)}
      />
      <input
        ref={datasetInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={(event) => void handleDatasetFile(event)}
      />

      <div className="toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">
            <span className="toast-text">{toast.text}</span>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              title="Dismiss"
              onClick={() => dismissToast(toast.id)}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
