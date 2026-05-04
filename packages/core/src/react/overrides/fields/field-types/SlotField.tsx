/**
 * @file Default renderer for Puck `slot` fields. Slots are
 * Puck-managed drop zones; the override just frames the area so it
 * picks up the chrome's panel styling.
 */

import type { FieldProps, SlotField as PuckSlotField } from "@puckeditor/core";
import { type ReactNode } from "react";

import type { FieldRendererProps } from "./TextField";

interface SlotFieldRendererProps extends FieldProps<PuckSlotField, unknown> {
  readonly name: string;
  readonly children: ReactNode;
}

export function SlotField({ children }: SlotFieldRendererProps): ReactNode {
	return (
		<div className="rounded-md border border-dashed border-[var(--ak-studio-border)] bg-[var(--ak-studio-bg)] p-2">
			{children}
		</div>
	);
}

export type { FieldProps as PuckFieldProps };
