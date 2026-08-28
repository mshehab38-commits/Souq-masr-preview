import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

export function Card({ children, padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={[
        "rounded-xl border border-neutral-200 bg-white shadow-sm",
        padded ? "p-4" : "",
        className ?? "",
      ].join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
