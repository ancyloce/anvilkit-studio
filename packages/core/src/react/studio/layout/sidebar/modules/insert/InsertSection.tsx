/**
 * @file Single accordion section in the `insert` module.
 *
 * Wraps an `Accordion.Item` with the section's i18n title (resolved
 * via `useMsg`) and a body rendered as either a grid or a list of
 * Puck Drawer.Items, switched by the active `componentViewMode`.
 *
 * The collapse/expand state is owned by the caller through the
 * `Accordion.Root` `value` array — `InsertDrawerBody` derives that
 * array from the persisted `insertSectionsExpanded` slice.
 */

import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Accordion } from "../../../../primitives/Accordion.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";
import type { ComponentViewMode } from "../../../../state/editor-ui-store.js";
import { InsertTileGrid } from "./InsertTileGrid.js";
import { InsertTileList } from "./InsertTileList.js";

export interface InsertSectionProps {
	readonly id: string;
	readonly titleKey: string;
	readonly viewMode: ComponentViewMode;
	readonly children: readonly ReactNode[];
}

export function InsertSection({
	id,
	titleKey,
	viewMode,
	children,
}: InsertSectionProps): ReactNode {
	const msg = useMsg();
	const count = children.length;
	const Tiles = viewMode === "grid" ? InsertTileGrid : InsertTileList;

	return (
		<Accordion.Item value={id} data-testid={`ak-insert-section-${id}`}>
			<Accordion.Header>
				<Accordion.Trigger density="compact">
					<ChevronRight
						className="size-3.5 shrink-0 text-[var(--ak-studio-muted-fg)] transition-transform group-data-[panel-open]:rotate-90"
						aria-hidden="true"
					/>
					<span className="grow truncate">{msg(titleKey)}</span>
					<span className="text-[10px] text-[var(--ak-studio-muted-fg)]">
						{count}
					</span>
				</Accordion.Trigger>
			</Accordion.Header>
			<Accordion.Panel>
				<Tiles>{children}</Tiles>
			</Accordion.Panel>
		</Accordion.Item>
	);
}
