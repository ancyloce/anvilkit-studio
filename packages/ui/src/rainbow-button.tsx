import React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@anvilkit/ui/lib/utils"

const rainbowButtonVariants = cva(
  cn(
    "relative isolate inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center gap-2 overflow-visible whitespace-nowrap border border-transparent text-sm font-medium select-none transition-[background-position,box-shadow,transform] duration-300 ease-out animate-rainbow",
    "inline-flex items-center justify-center gap-2 shrink-0",
    "rounded-xl bg-origin-border outline-none focus-visible:ring-[3px] aria-invalid:border-destructive",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0"
  ),
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(#121213,#121213),linear-gradient(#121213_50%,rgba(18,18,19,0.6)_80%,rgba(18,18,19,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] text-white shadow-[0_6px_18px_rgba(18,18,19,0.16)] [background-clip:padding-box,border-box,border-box] [background-size:200%_100%] [border:calc(0.08rem)_solid_transparent] before:pointer-events-none before:absolute before:bottom-[-20%] before:left-1/2 before:z-[-1] before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-rainbow before:content-[''] before:bg-[linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] before:[background-size:200%_100%] before:opacity-80 before:[filter:blur(0.75rem)] dark:bg-[linear-gradient(#ffffff,#ffffff),linear-gradient(#ffffff_50%,rgba(255,255,255,0.6)_80%,rgba(0,0,0,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] dark:text-black",
        outline:
          "bg-[linear-gradient(#ffffff,#ffffff),linear-gradient(#ffffff_50%,rgba(18,18,19,0.6)_80%,rgba(18,18,19,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] text-black shadow-[0_4px_16px_rgba(18,18,19,0.08)] [background-clip:padding-box,border-box,border-box] [background-size:200%_100%] [border:1px_solid_transparent] before:pointer-events-none before:absolute before:bottom-[-20%] before:left-1/2 before:z-[-1] before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-rainbow before:content-[''] before:bg-[linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] before:[background-size:200%_100%] before:opacity-75 before:[filter:blur(0.75rem)] dark:bg-[linear-gradient(#0a0a0a,#0a0a0a),linear-gradient(#0a0a0a_50%,rgba(255,255,255,0.6)_80%,rgba(0,0,0,0)),linear-gradient(90deg,var(--color-1),var(--color-5),var(--color-3),var(--color-4),var(--color-2))] dark:text-white",
      },
      size: {
        default: "h-11 px-6",
        sm: "h-9 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface RainbowButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof rainbowButtonVariants> {
  asChild?: boolean
}

const RainbowButton = React.forwardRef<HTMLButtonElement, RainbowButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        data-slot="button"
        className={cn(rainbowButtonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)

RainbowButton.displayName = "RainbowButton"

export { RainbowButton, rainbowButtonVariants, type RainbowButtonProps }
