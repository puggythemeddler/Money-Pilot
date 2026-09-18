import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "info" | "success" | "error" | "warning";

const styles: Record<Variant, string> = {
  info: "border-primary-200 bg-primary-50 text-primary-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
}: {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm", styles[variant], className)}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}