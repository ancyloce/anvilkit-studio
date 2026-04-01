import React, { type ComponentPropsWithoutRef, type CSSProperties } from "react"

import { cn } from "@anvilkit/ui/lib/utils"

interface RippleProps extends ComponentPropsWithoutRef<"div"> {
  mainCircleSize?: number
  mainCircleOpacity?: number
  numCircles?: number
}

export const Ripple = React.memo(function Ripple({
  mainCircleSize = 210,
  mainCircleOpacity = 0.24,
  numCircles = 8,
  className,
  ...props
}: RippleProps) {
  const circles = Array.from({ length: numCircles }, (_, circleIndex) => {
    const size = mainCircleSize + circleIndex * 70
    const opacity = mainCircleOpacity - circleIndex * 0.03

    return {
      id: `ripple-${size}`,
      order: circleIndex,
      size,
      opacity,
      animationDelay: `${circleIndex * 0.06}s`,
    }
  })

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 mask-[linear-gradient(to_bottom,white,transparent)] select-none",
        className
      )}
      {...props}
    >
      {circles.map((circle) => {
        const borderStyle = "solid"

        return (
          <div
            key={circle.id}
            className={`animate-ripple bg-foreground/25 absolute rounded-full border shadow-xl`}
            style={
              {
                "--i": circle.order,
                width: `${circle.size}px`,
                height: `${circle.size}px`,
                opacity: circle.opacity,
                animationDelay: circle.animationDelay,
                borderStyle,
                borderWidth: "1px",
                borderColor: `var(--foreground)`,
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%) scale(1)",
              } as CSSProperties
            }
          />
        )
      })}
    </div>
  )
})

Ripple.displayName = "Ripple"
