/**
 * @file Empty-state placeholder for the `insert` module (PRD §5.5).
 *
 * Two variants:
 * - `library`: no components are registered at all → `studio.module.insert.empty`.
 * - `search`: a search query yielded zero matches → `studio.module.insert.search.empty`.
 *
 * Per Q3 in the build plan, individual sections that match zero
 * components are hidden by `InsertDrawerBody` — only these two
 * top-level empty states surface a message to the user.
 */

import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { useMsg } from "../../../../state/editor-i18n-store.js";

export interface InsertEmptyStateProps {
	readonly variant: "library" | "search";
}

const VARIANT_KEY: Readonly<Record<InsertEmptyStateProps["variant"], string>> = {
	library: "studio.module.insert.empty",
	search: "studio.module.insert.search.empty",
};

export function InsertEmptyState({ variant }: InsertEmptyStateProps): ReactNode {
	const msg = useMsg();
	return (
		<div
			data-testid={`ak-insert-empty-${variant}`}
			className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center"
		>
			<Inbox
				className="size-6 text-[var(--ak-studio-muted-fg)]"
				aria-hidden="true"
			/>
			<p className="text-xs text-[var(--ak-studio-muted-fg)]">
				{msg(VARIANT_KEY[variant])}
			</p>
		</div>
	);
}
