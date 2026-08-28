import type { ReactNode } from "react";
import { Button } from "./Button";

interface StateProps {
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

function StateShell({ title, description, action, icon }: StateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-200 px-6 py-12 text-center">
      {icon}
      <h3 className="font-cairo text-lg font-bold text-neutral-900">{title}</h3>
      {description && <p className="max-w-sm text-sm text-neutral-500">{description}</p>}
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return (
    <StateShell
      {...props}
      icon={
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-neutral-300" aria-hidden="true">
          <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7V5a2 2 0 012-2h4a2 2 0 012 2v2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      }
    />
  );
}

export function ErrorState(props: StateProps) {
  return (
    <StateShell
      {...props}
      icon={
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="text-danger" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
          <path d="M12 8v5M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

export function LoadingState({ label = "جارٍ التحميل" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}
