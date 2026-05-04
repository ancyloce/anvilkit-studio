/**
 * @file Reusable empty-state placeholder for sidebar sub-panels.
 *
 * Used by `PagesPanel` and `LayersPanel` (and any later module that
 * needs the same idiom). Centered, muted text, optional leading icon.
 * Trivially small — variants belong in the calling module so we keep
 * the shared component a thin layout shell.
 */

import type { ReactNode } from "react";

export interface EmptyStateProps {
	readonly message: string;
	readonly icon?: ReactNode;
	readonly testId?: string;
}

export function EmptyState({ message, icon, testId }: EmptyStateProps): ReactNode {
	return (
		<div
			data-testid={testId}
			className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
		>
			{icon}
			<p className="text-xs text-[var(--ak-studio-muted-fg)]">{message}</p>
		</div>
	);
}
