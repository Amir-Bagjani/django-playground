type IconProps = {
  size?: number;
  className?: string;
};

const base = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function ChevronIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

export function FolderIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M1.9 4.4A1.3 1.3 0 0 1 3.2 3.1h3l1.4 1.7h5.2A1.3 1.3 0 0 1 14.1 6.1v5.5a1.3 1.3 0 0 1-1.3 1.3H3.2a1.3 1.3 0 0 1-1.3-1.3z" />
    </svg>
  );
}

export function FolderOpenIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M1.9 4.4A1.3 1.3 0 0 1 3.2 3.1h3l1.4 1.7h5.1" />
      <path d="M1.95 12.4 3.7 6.9a1.1 1.1 0 0 1 1.05-.73h9.05a.9.9 0 0 1 .86 1.15l-1.35 4.2a1.3 1.3 0 0 1-1.24.88H3a1 1 0 0 1-1.05-1z" />
    </svg>
  );
}

export function FileIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M4 1.9h4.8l3.2 3.2v9A.9.9 0 0 1 11.1 15H4a.9.9 0 0 1-.9-.9V2.8A.9.9 0 0 1 4 1.9z" />
      <path d="M8.6 1.9v3.4h3.4" />
    </svg>
  );
}

export function LockIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <rect x="3.7" y="7" width="8.6" height="6" rx="1.1" />
      <path d="M5.8 7V5.4a2.2 2.2 0 0 1 4.4 0V7" />
    </svg>
  );
}

export function CopyIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <rect x="5.5" y="5.5" width="7.4" height="8" rx="1.1" />
      <path d="M3.1 10.4V3.2A.7.7 0 0 1 3.8 2.5h7.1" />
    </svg>
  );
}

export function PlusIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M8 3.4v9.2M3.4 8h9.2" />
    </svg>
  );
}

export function CloseIcon({ size = 13, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function PlayIcon({ size = 15, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M4.6 2.9a.8.8 0 0 1 1.22-.68l7 4.78a.8.8 0 0 1 0 1.34l-7 4.78A.8.8 0 0 1 4.6 13z" />
    </svg>
  );
}

export function StopIcon({ size = 15, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <rect x="3.6" y="3.6" width="8.8" height="8.8" rx="1.4" />
    </svg>
  );
}

export function RestartIcon({ size = 15, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.6-3.7" />
      <path d="M13 2.6V5.4h-2.8" />
    </svg>
  );
}

export function SpinnerIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <circle cx="8" cy="8" r="5.6" opacity="0.25" />
      <path d="M13.6 8A5.6 5.6 0 0 0 8 2.4" />
    </svg>
  );
}

export function ExpandIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M9.6 2.5h3.9v3.9" />
      <path d="M13.5 2.5 8.7 7.3" />
      <path d="M6.4 13.5H2.5V9.6" />
      <path d="M2.5 13.5 7.3 8.7" />
    </svg>
  );
}

export function CollapseIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M13.5 6.4h-3.9V2.5" />
      <path d="M9.6 6.4 14.4 1.6" />
      <path d="M2.5 9.6h3.9v3.9" />
      <path d="M6.4 9.6 1.6 14.4" />
    </svg>
  );
}

export function RefreshIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className} aria-hidden="true">
      <path d="M13.2 8a5.2 5.2 0 1 1-1.5-3.7" />
      <path d="M13.4 2.6v3h-3" />
    </svg>
  );
}

export function DotsIcon({ size = 15, className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <circle cx="8" cy="3.6" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="8" cy="12.4" r="1.25" />
    </svg>
  );
}
