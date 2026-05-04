/**
 * @file Default renderer for Puck `object` fields. Just a labeled
 * container — Puck mounts the nested field tree as `children`.
 */

import type {
	FieldProps,
	ObjectField as PuckObjectField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { Card, CardContent } from "@/primitives/card";
import { cn } from "@/utils/cn";

interface ObjectFieldRendererProps
	extends FieldProps<
		PuckObjectField<Record<string, unknown>>,
		Record<string, unknown> | undefined
	> {
	readonly name: string;
	readonly children: ReactNode;
}

export function ObjectField({
	readOnly,
	children,
}: ObjectFieldRendererProps): ReactNode {
	return (
		<Card size="sm" className={cn(readOnly === true && "opacity-70")}>
			<CardContent className="flex flex-col gap-2">{children}</CardContent>
		</Card>
	);
}

export type { FieldProps as PuckFieldProps };
