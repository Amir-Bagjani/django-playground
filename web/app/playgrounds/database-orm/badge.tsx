import styles from "./academy.module.css";

const LABELS: Record<string, string> = {
  planned: "Planned",
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
};

const CLASSES: Record<string, string | undefined> = {
  planned: styles.badgePlanned,
  draft: styles.badgeDraft,
  "in-review": styles.badgeInReview,
  approved: styles.badgeApproved,
};

export function StatusBadge({ status }: { status: string }) {
  const key = String(status);
  return (
    <span className={`${styles.badge} ${CLASSES[key] ?? ""}`}>
      <span className={styles.badgeDot} aria-hidden="true" />
      <span>{LABELS[key] ?? key}</span>
    </span>
  );
}
