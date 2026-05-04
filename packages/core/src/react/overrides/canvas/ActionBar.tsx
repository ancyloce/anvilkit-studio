/**
 * @file `ActionBar` — Puck `actionBar` override.
 *
 * Wraps Puck's per-component action bar with the chrome's panel
 * styling and surfaces the parent-action button alongside the
 * children (Puck's per-component controls). Position-clamping math
 * lives in `utils/action-bar-position.ts` so it can be tested
 * independently of React.
 */

import { type ReactNode } from "react";

import { cn } from "../utils/cn";

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
			className={cn(
				"flex items-center gap-1 rounded-md border border-[var(--ak-studio-border)]",
				"bg-[var(--ak-studio-panel)] px-1 py-0.5 text-xs text-[var(--ak-studio-panel-fg)] shadow-sm",
			)}
		>
			{label !== undefined ? (
				<span className="px-1 font-medium">{label}</span>
			) : null}
			<div className="flex items-center gap-0.5">
				{parentAction}
				{children}
			</div>
		</div>
	);
}
