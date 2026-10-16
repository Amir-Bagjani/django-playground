"use client";

import { useEffect, useRef, useState } from "react";

import Editor, { loader, type Monaco, type OnMount } from "@monaco-editor/react";
import type * as MonacoNs from "monaco-editor";

import { languageLabel } from "./language";

loader.config({ paths: { vs: "/monaco/vs" } });

const THEME = "playground-dark";
const EDITOR_FONT = '"SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7686", fontStyle: "italic" },
      { token: "string", foreground: "9ecbff" },
      { token: "keyword", foreground: "ff7b9c" },
      { token: "number", foreground: "f2b47e" },
      { token: "type", foreground: "7fd6c4" },
    ],
    colors: {
      "editor.background": "#0a0d13",
      "editor.foreground": "#cdd6e4",
      "editorGutter.background": "#0a0d13",
      "editorLineNumber.foreground": "#39435a",
      "editorLineNumber.activeForeground": "#8b98ac",
      "editor.lineHighlightBackground": "#111827",
      "editor.selectionBackground": "#24406e",
      "editor.inactiveSelectionBackground": "#1b2b47",
      "editorCursor.foreground": "#4c8dff",
      "editorIndentGuide.background1": "#1a2130",
      "editorIndentGuide.activeBackground1": "#2a3446",
      "editorWidget.background": "#11151d",
      "editorWidget.border": "#212838",
      "editorSuggestWidget.background": "#11151d",
      "editorSuggestWidget.selectedBackground": "#1c2534",
    },
  });
}

export interface CursorInfo {
  line: number;
  column: number;
}

interface CodeEditorProps {
  path: string | null;
  paths: string[];
  displayPath: string;
  defaultValue: string;
  language: string;
  readOnly: boolean;
  wordWrap: boolean;
  dirty: boolean;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onToggleWordWrap: () => void;
}

export function CodeEditor({
  path,
  paths,
  displayPath,
  defaultValue,
  language,
  readOnly,
  wordWrap,
  dirty,
  onValueChange,
  onSave,
  onToggleWordWrap,
}: CodeEditorProps) {
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoNs.editor.IStandaloneCodeEditor | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, column: 1 });
  const [ready, setReady] = useState(false);

  const handleMount: OnMount = (editor, monaco) => {
    monacoRef.current = monaco;
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveRef.current());
    editor.onDidChangeCursorPosition((event) => {
      setCursor({ line: event.position.lineNumber, column: event.position.column });
    });
    const position = editor.getPosition();
    if (position) setCursor({ line: position.lineNumber, column: position.column });
    setReady(true);
  };

  useEffect(() => {
    if (!ready) return;
    const monaco = monacoRef.current;
    if (!monaco) return;
    const open = new Set(paths);
    for (const model of monaco.editor.getModels()) {
      if (!open.has(model.uri.toString())) model.dispose();
    }
  }, [paths, ready]);

  useEffect(() => {
    if (!ready) return;
    const position = editorRef.current?.getPosition();
    if (position) setCursor({ line: position.lineNumber, column: position.column });
  }, [path, ready]);

  if (!path) {
    return (
      <div className="editor-wrap">
        <div className="editor-host empty">
          <p className="muted">Open a file from the Files tree to start editing.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-wrap">
      <div className="editor-host">
        <Editor
          path={path}
          defaultValue={defaultValue}
          language={language}
          theme={THEME}
          beforeMount={defineTheme}
          onMount={handleMount}
          onChange={(value) => onValueChange(value ?? "")}
          saveViewState
          loading={<div className="editor-loading">Loading editor…</div>}
          options={{
            readOnly,
            domReadOnly: readOnly,
            wordWrap: wordWrap ? "on" : "off",
            fontSize: 13,
            lineHeight: 21,
            fontFamily: EDITOR_FONT,
            minimap: { enabled: false },
            tabSize: 4,
            insertSpaces: true,
            detectIndentation: false,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderWhitespace: "selection",
            renderLineHighlight: "line",
            bracketPairColorization: { enabled: true },
            guides: { indentation: true },
            fixedOverflowWidgets: true,
            smoothScrolling: true,
            cursorBlinking: "smooth",
            padding: { top: 12, bottom: 12 },
            wordBasedSuggestions: "currentDocument",
            autoClosingBrackets: "languageDefined",
            autoClosingQuotes: "languageDefined",
            matchBrackets: "always",
            scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
          }}
        />
      </div>
      <div className="editor-status">
        <span className="ltr truncate status-path" title={displayPath}>
          {displayPath}
        </span>
        <span className="status-right">
          {readOnly && <span className="status-chip">Read-only</span>}
          <button
            type="button"
            className="status-btn"
            onClick={onToggleWordWrap}
            title="Toggle word wrap"
          >
            Wrap: {wordWrap ? "on" : "off"}
          </button>
          <span>Spaces: 4</span>
          <span>Ln {cursor.line}, Col {cursor.column}</span>
          <span>{languageLabel(language)}</span>
          <span className={dirty ? "status-dirty" : ""}>
            {readOnly ? "Locked" : dirty ? "Modified" : "Saved"}
          </span>
        </span>
      </div>
    </div>
  );
}
