/**
 * @file Default renderer for Puck `object` fields.
 *
 * Puck invokes the override as `FieldComponent({ ...mergedProps,
 * children: <DefaultObjectField {...mergedProps} /> })`. Its default
 * object renderer (`DefaultObjectField`) wraps its subfields in
 * `mergedProps.Label`, which paints an `EllipsisVertical` (⋮) label
 * on top of whatever wrapper we render here — i.e. a duplicated
 * header. We provide our own `FieldLabel` (`{} Logo`) and clone the
 * children element with a passthrough `Label` so Puck's default
 * Label renders just the subfields without its own header.
 */

import type {
	FieldProps,
	ObjectField as PuckObjectField,
} from "@puckeditor/core";
import { cloneElement, isValidElement, type ReactNode } from "react";

import { Card, CardContent } from "@/primitives/card";
import { cn } from "@/utils/cn";
import { FieldLabel } from "../../layout/FieldLabel";

interface ObjectFieldRendererProps
	extends FieldProps<
		PuckObjectField<Record<string, unknown>>,
		Record<string, unknown> | undefined
	> {
	readonly name: string;
	readonly children: ReactNode;
}

function PassthroughLabel({ children }: { children?: ReactNode }): ReactNode {
	return <>{children}</>;
}

export function ObjectField({
	field,
	readOnly,
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
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="object"
			el="div"
			readOnly={readOnly}
		>
			<Card size="sm" className={cn(readOnly === true && "opacity-70")}>
				<CardContent className="flex flex-col gap-2">
					{headerlessChildren}
				</CardContent>
			</Card>
		</FieldLabel>
	);
}

export type { FieldProps as PuckFieldProps };
