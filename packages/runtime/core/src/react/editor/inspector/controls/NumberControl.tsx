"use client";

/**
 * @file `NumberControl` — the pre-canonical inspector's binding to the
 * shared numeric control (PLAN-0020 CORE-P1A-006/-007; DD-0019 §11.3).
 *
 * The implementation moved to
 * `composition/style/controls/NumberControl.tsx` with PLAN-0028
 * `p4-001` so the canonical Style panel and the sections below render
 * ONE control. This file keeps the legacy prop shape
 * (`InspectorFieldHandle`, whose commit returns a promise) and
 * delegates: a promise-returning commit is assignable to the shared
 * handle's `void`-returning one, so no adapter is needed.
 */

import type { ReactNode } from "react";
import { NumberControl as SharedNumberControl } from "../../composition/style/controls/NumberControl.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

/** Props for {@link NumberControl}. */
export interface NumberControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<number>;
	readonly min?: number;
	readonly max?: number;
	/** Keyboard step (Shift multiplies by 10). Default 1. */
	readonly step?: number;
	readonly testId?: string;
}

/** Plain number editor bound to one inspector field. */
export function NumberControl(props: NumberControlProps): ReactNode {
	return <SharedNumberControl {...props} />;
}
