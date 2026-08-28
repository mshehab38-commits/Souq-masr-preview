const egpFormatter = new Intl.NumberFormat("ar-EG", {
  numberingSystem: "latn",
  maximumFractionDigits: 0,
});

interface PriceTagProps {
  amount: number;
  negotiable?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-2xl",
};

export function PriceTag({ amount, negotiable = false, size = "md", className }: PriceTagProps) {
  return (
    <span className={["inline-flex items-baseline gap-1.5", className ?? ""].join(" ")}>
      <span className={["font-cairo font-extrabold text-teal-800", sizeClasses[size]].join(" ")}>
        {egpFormatter.format(amount)}
      </span>
      <span className="text-sm font-medium text-neutral-500">ج.م</span>
      {negotiable && (
        <span className="text-xs font-medium text-amber-600">قابل للتفاوض</span>
      )}
    </span>
  );
}
