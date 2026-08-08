"use client";

/**
 * @file `BoxEdgesControl` — the pre-canonical inspector's binding to
 * the shared four-edge editor (PLAN-0020 CORE-P1A-006; DD-0019 §11.5).
 *
 * The editor moved to `composition/style/controls/BoxEdgesControl.tsx`
 * with PLAN-0028 `p4-001`, where it emits the **complete**
 * `CssBoxEdges` because the canonical writer assigns rather than
 * merges. The legacy command port does merge, and it removes an edge
 * only when the patch carries an explicit `null` (freeze D-8) — so the
 * adapter below restates "absent" as `null` per edge. Emitting all four
 * keys is equivalent to the old one-edge patch under a recursive merge,
 * and it keeps clearing an edge working.
 */

import type { CssBoxEdges } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { BoxEdgesControl as SharedBoxEdgesControl } from "../../composition/style/controls/BoxEdgesControl.js";
import type { StyleFieldHandle } from "../../composition/style/controls/handle.js";
import type { InspectorFieldHandle } from "../use-inspector.js";

/** Props for {@link BoxEdgesControl}. */
export interface BoxEdgesControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<CssBoxEdges>;
	readonly testId?: string;
}

/** Four-edge (px) editor bound to one box-edges inspector field. */
export function BoxEdgesControl({
	label,
	field,
	testId,
}: BoxEdgesControlProps): ReactNode {
	const merging: StyleFieldHandle<CssBoxEdges> = {
		state: field.state,
		commit: (next) =>
			void field.commit({
				top: next.top ?? null,
				right: next.right ?? null,
				bottom: next.bottom ?? null,
				left: next.left ?? null,
			} as unknown as CssBoxEdges),
		reset: () => void field.reset(),
		layer: field.layer,
	};
	return (
		<SharedBoxEdgesControl label={label} field={merging} testId={testId} />
	);
}
