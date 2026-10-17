import type { LessonStatus } from "@/lib/academy";

import styles from "./academy.module.css";

const LABELS: Record<LessonStatus, string> = {
  planned: "Planned",
  draft: "Draft",
  approved: "Approved",
};

const CLASSES: Record<LessonStatus, string> = {
  planned: styles.badgePlanned,
  draft: styles.badgeDraft,
  approved: styles.badgeApproved,
};

export function StatusBadge({ status }: { status: LessonStatus }) {
  return <span className={`${styles.badge} ${CLASSES[status] ?? ""}`}>{LABELS[status] ?? status}</span>;
}
