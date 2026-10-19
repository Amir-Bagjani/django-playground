import type { CSSProperties, ReactNode } from "react";

import { CodeBlock } from "./code-block";
import styles from "./markdown.module.css";

/**
 * Minimal, safe Markdown renderer for Academy lesson bodies.
 *
 * It intentionally supports only a small, whitelisted subset (headings,
 * paragraphs, ordered/unordered lists, blockquotes, fenced code, GFM tables,
 * and inline bold / code / links). It never uses `dangerouslySetInnerHTML`, so
 * raw HTML or scripts embedded in content are rendered as literal text and
 * cannot execute.
 */

const INLINE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    const key = `${keyPrefix}-i${i++}`;
    if (match[2] !== undefined) {
      nodes.push(<strong key={key}>{match[2]}</strong>);
    } else if (match[4] !== undefined) {
      nodes.push(
        <code key={key} className={styles.inlineCode}>
          {match[4]}
        </code>,
      );
    } else if (match[6] !== undefined && match[7] !== undefined) {
      nodes.push(
        <a key={key} href={match[7]} target="_blank" rel="noopener noreferrer">
          {match[6]}
        </a>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    nodes.push(text.slice(last));
  }
  return nodes;
}

type Align = "left" | "right" | "center" | null;

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; lines: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; header: string[]; align: Align[]; rows: string[][] }
  | { type: "paragraph"; lines: string[] };

/** A GFM table row: starts and ends with a pipe. */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 1;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function alignOf(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** The `|---|:--:|` line that turns the preceding row into a header. */
function isTableSeparator(line: string): boolean {
  if (!isTableRow(line)) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell));
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const isBlank = (line: string) => line.trim() === "";

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const fence = /^```(.*)$/.exec(line);
    if (fence) {
      const lang = fence[1].trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence
      blocks.push({ type: "code", lang, lines: body });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", lines: quote });
      continue;
    }

    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*-\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map(alignOf);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, align, rows });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*-\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }

  return blocks;
}

/** URL/id slug that keeps Unicode letters (so Persian headings work). */
function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function Markdown({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);
  const usedSlugs = new Map<string, number>();
  const headingIds = blocks.map((block) => {
    if (block.type !== "heading") return "";
    const base = slugify(block.text) || "section";
    const seen = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });

  return (
    <div className={styles.root}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "heading": {
            const Tag = (`h${Math.min(block.level + 1, 6)}`) as "h2" | "h3" | "h4" | "h5" | "h6";
            const id = headingIds[index];
            return (
              <Tag key={key} id={id} className={styles.heading}>
                <a
                  href={`#${id}`}
                  className={styles.anchor}
                  aria-label="Link to this section"
                >
                  #
                </a>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "code":
            return <CodeBlock key={key} code={block.lines.join("\n")} />;
          case "quote":
            return (
              <blockquote key={key} className={styles.quote}>
                {renderInline(block.lines.join(" "), key)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={key} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className={styles.list}>
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "table": {
            const cellStyle = (column: number): CSSProperties | undefined =>
              block.align[column]
                ? { textAlign: block.align[column] as CSSProperties["textAlign"] }
                : undefined;
            return (
              <div key={key} className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      {block.header.map((cell, c) => (
                        <th key={c} style={cellStyle(c)}>
                          {renderInline(cell, `${key}-h${c}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {block.header.map((_, c) => (
                          <td key={c} style={cellStyle(c)}>
                            {renderInline(row[c] ?? "", `${key}-r${r}c${c}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "paragraph":
            return (
              <p key={key} className={styles.paragraph}>
                {renderInline(block.lines.join(" "), key)}
              </p>
            );
        }
      })}
    </div>
  );
}
