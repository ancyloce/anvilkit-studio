/**
 * @file `ActionBar` — Puck `actionBar` override.
 *
 * Wraps Puck's per-component action bar with the chrome's panel
 * styling and surfaces the parent-action button alongside the
 * children (Puck's per-component controls). The component label
 * is rendered as a tab in `ComponentOverlay` instead of inline,
 * so this bar is purely a floating icon toolbar. Position-clamping
 * math lives in `utils/action-bar-position.ts` so it can be tested
 * independently of React.
 */

import { type ReactNode } from "react";

import { cn } from "@/utils/cn";

export interface ActionBarOverrideProps {
  readonly label?: string;
  readonly children: ReactNode;
  readonly parentAction: ReactNode;
}

export function ActionBar({
  label,
  children,
  parentAction,
}: ActionBarOverrideProps): ReactNode {
  return (
    <div
      data-ak-action-bar
      data-component-label={label}
      className={cn(
        "flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
        "border border-[var(--ak-studio-border)]",
        "bg-[var(--ak-studio-panel)] text-[var(--ak-studio-panel-fg)] shadow-md",
      )}
    >
      {parentAction}
      {children}
    </div>
  );
}
