import type { ReactNode } from "react";

type BadgeTone = "teal" | "amber" | "success" | "warning" | "danger" | "neutral";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<BadgeTone, string> = {
  teal: "bg-teal-50 text-teal-700",
  amber: "bg-amber-50 text-amber-700",
  success: "bg-green-50 text-success",
  warning: "bg-yellow-50 text-warning",
  danger: "bg-red-50 text-danger",
  neutral: "bg-neutral-100 text-neutral-700",
};

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        toneClasses[tone],
        className ?? "",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

export function VerifiedBadge() {
  return (
    <Badge tone="teal">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2l2.4 2.2 3.2-.6.9 3.1 3 1.3-1.1 3.1 1.1 3.1-3 1.3-.9 3.1-3.2-.6L12 21l-2.4-2.2-3.2.6-.9-3.1-3-1.3 1.1-3.1L2.5 9.3l3-1.3.9-3.1 3.2.6L12 2z" />
        <path d="M9.5 12.5l1.8 1.8 3.2-3.6" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>موثّق</span>
    </Badge>
  );
}
