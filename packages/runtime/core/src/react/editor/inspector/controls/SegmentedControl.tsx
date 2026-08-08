"use client";

/**
 * @file `SegmentedControl` — the pre-canonical inspector's binding to
 * the shared segmented enum control.
 *
 * The implementation moved to
 * `composition/style/controls/SegmentedControl.tsx` with PLAN-0028
 * `p4-001`; this file keeps the legacy prop shape and delegates.
 * {@link SegmentedOption} is re-exported so the existing sections keep
 * importing their option type from here.
 */

import type { ReactNode } from "react";
import { SegmentedControl as SharedSegmentedControl } from "../../composition/style/controls/SegmentedControl.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

export type { SegmentedOption } from "../../composition/style/controls/SegmentedControl.js";

import type { SegmentedOption } from "../../composition/style/controls/SegmentedControl.js";

/** Props for {@link SegmentedControl}. */
export interface SegmentedControlProps<T extends string> {
	readonly label: string;
	readonly field: InspectorFieldHandle<T>;
	readonly options: readonly SegmentedOption<T>[];
	readonly testId?: string;
}

/** Segmented enum editor bound to one inspector field. */
export function SegmentedControl<T extends string>(
	props: SegmentedControlProps<T>,
): ReactNode {
	return <SharedSegmentedControl {...props} />;
}
