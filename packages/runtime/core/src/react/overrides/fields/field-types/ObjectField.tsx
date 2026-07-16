/**
 * @file Default renderer for Puck `object` fields.
 *
 * Puck invokes the override as `FieldComponent({ ...mergedProps,
 * children: <DefaultObjectField {...mergedProps} /> })`. Its default
 * object renderer (`DefaultObjectField`) wraps its subfields in
 * `mergedProps.Label`, which paints an `EllipsisVertical` (⋮) label on
 * top of whatever wrapper we render here — i.e. a duplicated header. We
 * clone the children element with a passthrough `Label` so Puck's
 * default Label renders just the subfields without its own header.
 *
 * task Phase 7: renders as a collapsible `<InspectorSection>` instead
 * of an always-open card — this is the one place Core can safely offer
 * a real collapsible property GROUP: Puck's native `object` field type
 * already groups related sub-fields under one key, so no new authoring
 * convention is required from component packages (unlike the flat
 * Content/Appearance/Layout taxonomy, which Puck's `fields` override
 * has no data-level access to — see `InspectorSection`'s file doc).
 */

import type {
	FieldProps,
	ObjectField as PuckObjectField,
} from "@puckeditor/core";
import { cloneElement, isValidElement, type ReactNode } from "react";
import { InspectorSection } from "@/overrides/layout/InspectorSection";
import { cn } from "@/shared/cn";

interface ObjectFieldRendererProps
	extends FieldProps<
		PuckObjectField<Record<string, unknown>>,
		Record<string, unknown> | undefined
	> {
	readonly id?: string;
	readonly name: string;
	readonly children: ReactNode;
}

function PassthroughLabel({ children }: { children?: ReactNode }): ReactNode {
	return <>{children}</>;
}

export function ObjectField({
	field,
	readOnly,
	id,
	name,
	children,
}: ObjectFieldRendererProps): ReactNode {
	const headerlessChildren = isValidElement(children)
		? cloneElement(children, { Label: PassthroughLabel } as Record<
				string,
				unknown
			>)
		: children;

	return (
		<InspectorSection
			id={id ?? name}
			title={field.label ?? name}
			icon={field.labelIcon}
			className={cn(readOnly === true && "opacity-70")}
		>
			<div className="flex flex-col gap-2 border-t border-[var(--ak-studio-border)] pt-2">
				{headerlessChildren}
			</div>
		</InspectorSection>
	);
}

export type { FieldProps as PuckFieldProps };
