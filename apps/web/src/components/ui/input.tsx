import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const baseClasses =
  "block w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-heading shadow-sm placeholder:text-faint focus:border-primary-500 focus:outline-2 focus:outline-primary-600 disabled:cursor-not-allowed disabled:bg-surface-2 aria-invalid:border-red-500 aria-invalid:focus:outline-red-600";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = "text", ...props }, ref) {
    return <input ref={ref} type={type} className={cn(baseClasses, className)} {...props} />;
  },
);

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(baseClasses, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(baseClasses, "min-h-20 resize-y", className)} {...props} />;
}