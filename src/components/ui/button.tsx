import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 shadow-[0_0_30px_-8px_rgba(34,211,238,0.6)] hover:from-cyan-300 hover:to-blue-400 hover:shadow-[0_0_40px_-8px_rgba(34,211,238,0.8)]",
        secondary:
          "border border-white/10 bg-white/[0.04] text-slate-200 hover:border-cyan-400/30 hover:bg-cyan-400/[0.06] hover:text-white",
        outline:
          "border border-cyan-400/25 bg-transparent text-cyan-200 hover:bg-cyan-400/10 hover:text-cyan-100",
        ghost: "text-slate-300 hover:bg-white/[0.06] hover:text-white",
        destructive:
          "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20",
        link: "text-cyan-300 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
