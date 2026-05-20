/**
 * @file Reusable empty-state placeholder for sidebar sub-panels.
 *
 * Used by `PagesPanel` and `LayersPanel` (and any later module that
 * needs the same idiom). Centered, muted text, optional leading icon.
 * Trivially small — variants belong in the calling module so we keep
 * the shared component a thin layout shell.
 */

import type { ReactNode } from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
} from "@/primitives/empty";

export interface EmptyStateProps {
  readonly message: string;
  readonly icon?: ReactNode;
  readonly testId?: string;
}

export function EmptyState({
  message,
  icon,
  testId,
}: EmptyStateProps): ReactNode {
  return (
    <Empty data-testid={testId} className="border-0 px-4 py-8">
      <EmptyHeader>
        {icon !== undefined ? (
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
        ) : null}
        <EmptyDescription className="text-xs">{message}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
