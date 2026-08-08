"use client";

/**
 * @file `SelectControl` — the pre-canonical inspector's binding to the
 * shared enum control (PLAN-0020 CORE-P1A-006/-007).
 *
 * The implementation moved to
 * `composition/style/controls/SelectControl.tsx` with PLAN-0028
 * `p4-001`; this file keeps the legacy prop shape and delegates.
 */

import type { ReactNode } from "react";
import { SelectControl as SharedSelectControl } from "../../composition/style/controls/SelectControl.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

/** Props for {@link SelectControl}. */
export interface SelectControlProps<T extends string> {
	readonly label: string;
	readonly field: InspectorFieldHandle<T>;
	readonly options: readonly T[];
	/** Option-label resolver; defaults to the raw option string. */
	readonly optionLabel?: (option: T) => string;
	readonly testId?: string;
}

/** Enum select bound to one inspector field. */
export function SelectControl<T extends string>(
	props: SelectControlProps<T>,
): ReactNode {
	return <SharedSelectControl {...props} />;
}
