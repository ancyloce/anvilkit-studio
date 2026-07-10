import * as React from "react";

import { cn } from "@anvilkit/ui/lib/utils";

type ProgressProps = Omit<React.ComponentProps<"div">, "role"> & {
  value?: number;
  max?: number;
  indicatorClassName?: string;
};

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  const ratio = (value / max) * 100;
  if (ratio < 0) return 0;
  if (ratio > 100) return 100;
  return ratio;
}

function Progress({
  className,
  value,
  max = 100,
  indicatorClassName,
  ...props
}: ProgressProps) {
  const isIndeterminate = value === undefined;
  const percent = isIndeterminate ? 0 : clampPercent(value, max);

  return (
    <div
      data-slot="progress"
      data-state={isIndeterminate ? "indeterminate" : "determinate"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={isIndeterminate ? undefined : percent}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-secondary",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        className={cn(
          "h-full bg-primary transition-[width] duration-200 ease-out",
          isIndeterminate &&
            "w-1/3 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]",
          indicatorClassName,
        )}
        style={isIndeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

export { Progress };
export type { ProgressProps };
