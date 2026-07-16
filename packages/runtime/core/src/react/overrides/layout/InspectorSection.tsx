/**
 * @file `InspectorSection` — a collapsible property group for the
 * inspector (task Phase 7).
 *
 * Puck's `fields` override only ever receives a fully-rendered, opaque
 * `children` tree (see `FieldsPanel.tsx`) — individual field
 * definitions aren't available at that level, so `FieldsPanel` itself
 * cannot group arbitrary flat fields into named sections (there is no
 * Puck API for that without a component author opting in). What IS
 * achievable, safely and generically: Puck's native `object` field
 * type already groups related fields under one key — `ObjectField.tsx`
 * uses this component to render that existing grouping as a proper
 * collapsible section instead of an always-open card, with zero
 * changes required to any component package.
 *
 * Thin wrapper over the existing `Accordion` primitives — reuses the
 * exact single-item-accordion pattern `InsertSection.tsx` already
 * established, so this is not a new interaction model.
 */

import { type ReactNode, useCallback } from "react";
import {
	Accordion,
	AccordionItem,
	AccordionPanel,
	AccordionTrigger,
} from "@/primitives/accordion";
import { cn } from "@/shared/cn";
import { useFieldSectionsExpanded } from "@/state/slices/editor-ui-selectors";

export interface InspectorSectionProps {
	/**
	 * Stable id for persisting expand state — callers should prefer the
	 * Puck field's `id` (falls back to `name`) so unrelated sections in
	 * different components don't collide.
	 */
	readonly id: string;
	readonly title: string;
	readonly icon?: ReactNode;
	/** Expand state the first time this id is ever seen. Default `true`. */
	readonly defaultExpanded?: boolean;
	readonly children: ReactNode;
	readonly className?: string;
}

export function InspectorSection({
	id,
	title,
	icon,
	defaultExpanded = true,
	children,
	className,
}: InspectorSectionProps): ReactNode {
	const [expandedMap, setSectionExpanded] = useFieldSectionsExpanded();
	const expanded = expandedMap[id] ?? defaultExpanded;

	const handleValueChange = useCallback(
		(next: readonly string[]): void => {
			setSectionExpanded(id, next.includes(id));
		},
		[id, setSectionExpanded],
	);

	return (
		<Accordion
			value={expanded ? [id] : []}
			onValueChange={handleValueChange}
			className={className}
			data-testid={`ak-inspector-section-${id}`}
		>
			<AccordionItem value={id} className="border-b-0">
				<AccordionTrigger className="min-h-8 gap-1.5 px-0 py-1.5 text-xs font-medium text-[var(--ak-studio-fg)] hover:no-underline">
					{icon}
					<span className={cn("grow truncate text-left", icon && "ms-0")}>
						{title}
					</span>
				</AccordionTrigger>
				<AccordionPanel className="p-0">{children}</AccordionPanel>
			</AccordionItem>
		</Accordion>
	);
}
