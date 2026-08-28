interface LogoMarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 32, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="سوق مصر"
      className={className}
    >
      <rect width="64" height="64" rx="16" className="fill-teal-600" />
      <path
        d="M22 28c0-5.523 4.477-10 10-10s10 4.477 10 10"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <rect x="16" y="27" width="32" height="24" rx="5" fill="white" />
      <rect x="16" y="36" width="32" height="5" className="fill-amber-500" />
    </svg>
  );
}

interface LogoProps {
  variant?: "full" | "mark";
  size?: number;
  className?: string;
}

export function Logo({ variant = "full", size = 32, className }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark size={size} />
      {variant === "full" && (
        <span className="font-cairo text-xl font-extrabold text-teal-800">سوق مصر</span>
      )}
    </span>
  );
}
