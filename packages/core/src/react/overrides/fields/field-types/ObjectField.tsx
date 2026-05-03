/**
 * @file Default renderer for Puck `object` fields. Just a labeled
 * container — Puck mounts the nested field tree as `children`.
 */

import type {
	FieldProps,
	ObjectField as PuckObjectField,
} from "@puckeditor/core";
import { type ReactNode } from "react";

import { cn } from "../../utils/cn.js";

import type { FieldRendererProps } from "./TextField.js";

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
		<div
			className={cn(
				"flex flex-col gap-2 rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-2",
				readOnly === true ? "opacity-70" : null,
			)}
		>
			{children}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
