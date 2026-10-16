"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ChevronIcon, FileIcon, FolderIcon, FolderOpenIcon, LockIcon } from "./icons";

export interface FileEntry {
  path: string;
  editable: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  editable: boolean;
  children: TreeNode[];
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", isDir: true, editable: true, children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      const path = parts.slice(0, index + 1).join("/");
      let child = node.children.find((entry) => entry.name === part);
      if (!child) {
        child = {
          name: part,
          path,
          isDir: !isLast,
          editable: isLast ? file.editable : true,
          children: [],
        };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) =>
      a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
    );
    nodes.forEach((node) => sort(node.children));
  };
  sort(root.children);
  return root.children;
}

function directAncestors(path: string): string[] {
  const parts = path.split("/");
  const out: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    out.push(parts.slice(0, index).join("/"));
  }
  return out;
}

export function FileTree({
  files,
  currentPath,
  onOpen,
  disabled = false,
}: {
  files: FileEntry[];
  currentPath: string;
  onOpen: (path: string) => void;
  disabled?: boolean;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    setExpanded((previous) => {
      const next = new Set(previous);
      for (const ancestor of directAncestors(currentPath)) next.add(ancestor);
      if (next.size === previous.size) return previous;
      return next;
    });
  }, [currentPath]);

  useEffect(() => {
    setExpanded((previous) => {
      if (previous.size > 0) return previous;
      const next = new Set<string>();
      for (const node of tree) if (node.isDir) next.add(node.path);
      return next;
    });
  }, [tree]);

  const toggle = (path: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const renderNodes = (nodes: TreeNode[], depth: number): ReactNode =>
    nodes.map((node) => {
      if (node.isDir) {
        const open = expanded.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              className={`tree-row dir ${open ? "open" : ""}`}
              style={{ paddingLeft: 6 + depth * 14 }}
              onClick={() => toggle(node.path)}
              title={node.path}
            >
              <ChevronIcon className={`chev ${open ? "open" : ""}`} />
              {open ? <FolderOpenIcon className="tree-icon" /> : <FolderIcon className="tree-icon" />}
              <span className="tree-name">{node.name}</span>
            </button>
            {open && <div className="tree-group">{renderNodes(node.children, depth + 1)}</div>}
          </div>
        );
      }
      const active = node.path === currentPath;
      return (
        <button
          key={node.path}
          type="button"
          className={`tree-row file ${active ? "active" : ""}`}
          style={{ paddingLeft: 6 + depth * 14 }}
          disabled={!node.editable || disabled}
          onClick={() => onOpen(node.path)}
          title={node.editable ? node.path : `${node.path} (read-only)`}
        >
          <span className="chev-spacer" />
          <FileIcon className="tree-icon" />
          <span className="tree-name">{node.name}</span>
          {!node.editable && <LockIcon className="tree-lock" />}
        </button>
      );
    });

  return <div className="file-tree">{renderNodes(tree, 0)}</div>;
}
