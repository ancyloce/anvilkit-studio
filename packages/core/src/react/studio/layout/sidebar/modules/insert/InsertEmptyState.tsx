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

import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
} from "@/primitives/empty";
import { useMsg } from "@/state/editor-i18n-store";

export interface InsertEmptyStateProps {
	readonly variant: "library" | "search";
}

const VARIANT_KEY: Readonly<Record<InsertEmptyStateProps["variant"], string>> =
	{
		library: "studio.module.insert.empty",
		search: "studio.module.insert.search.empty",
	};

export function InsertEmptyState({
	variant,
}: InsertEmptyStateProps): ReactNode {
	const msg = useMsg();
	return (
		<Empty
			data-testid={`ak-insert-empty-${variant}`}
			className="border-0 px-4 py-8"
		>
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Inbox aria-hidden="true" />
				</EmptyMedia>
				<EmptyDescription className="text-xs">
					{msg(VARIANT_KEY[variant])}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
