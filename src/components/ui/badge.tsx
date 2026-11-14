import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.68rem] font-medium tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default: "border-cyan-400/25 bg-cyan-400/10 text-cyan-200",
        secondary: "border-white/10 bg-white/[0.04] text-slate-300",
        success: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        warning: "border-amber-400/30 bg-amber-400/10 text-amber-300",
        danger: "border-rose-400/30 bg-rose-400/10 text-rose-300",
        outline: "border-white/15 text-slate-300",
        violet: "border-violet-400/30 bg-violet-400/10 text-violet-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
