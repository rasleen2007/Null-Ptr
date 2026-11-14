import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus-visible:border-cyan-400/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
