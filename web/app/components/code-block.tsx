"use client";

import { useRef, useState } from "react";

import styles from "./markdown.module.css";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable (insecure context): leave the button unchanged
    }
  };

  return (
    <div className={styles.codeWrap}>
      <button
        type="button"
        className={styles.copyBtn}
        onClick={copy}
        aria-label={copied ? "Code copied" : "Copy code"}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className={styles.codeBlock} dir="ltr">
        <code>{code}</code>
      </pre>
    </div>
  );
}
