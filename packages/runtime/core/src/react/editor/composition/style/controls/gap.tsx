"use client";

/**
 * @file `GapControl` / `AxisGapControl` — `gap` with its `rowGap` /
 * `columnGap` split, behind one link toggle (PLAN-0028 `p5-005`).
 *
 * The three properties are three separate §6.1 grants and three
 * separate carriers (`LayoutSpec.gap`, `.rowGap`, `.columnGap`), which
 * is why the panel mounts a control per property. What an author wants
 * is one affordance: a single gap, with a toggle that splits it into
 * two axes. That is what these two components are — the same three
 * fields, arranged so exactly one of them owns the row.
 *
 * **`gap` owns the trio when it is granted.** {@link GapControl} binds
 * `rowGap` and `columnGap` itself and renders them beneath the linked
 * input; {@link AxisGapControl}, the control mounted for `rowGap` and
 * `columnGap` in their own right, renders **nothing** when `gap` is
 * granted at the same address, so no axis is offered twice. When `gap`
 * is not granted, the axes render as ordinary length editors and the
 * link toggle never appears — there would be nothing to link.
 *
 * **The allowlist gate is the read, not a second table.**
 * `readNodeField` reports `unsupported` for a property no selected node
 * grants (`document-model/read-node-field.ts`), so asking for `rowGap`
 * at an address that never granted it is how this file learns the
 * answer. There is one allowlist and it is the same one
 * `updateAppearanceInData` validates against; a control whose commit
 * would be rejected cannot render.
 *
 * **Re-linking clears, it does not average.** Axis overrides win over
 * the shorthand in the emitted sheet (`resolve-authoring-style.ts`
 * writes `gap`, then `row-gap`, then `column-gap`), so a "linked" view
 * that left them in place would be a lie. Pressing the toggle back on
 * resets whichever axes are actually authored — one history entry per
 * cleared axis, and none at all when there is nothing to clear.
 */

import type { CssLength } from "@anvilkit/contracts/editor";
import { Link2, Unlink2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Toggle } from "@/primitives/toggle";
import { useMsg } from "@/state/editor-i18n-context";
import { type StyleFieldAddress, useStyleField } from "../use-style-field.js";
import type { StyleFieldHandle } from "./handle.js";
import { LengthControl } from "./LengthControl.js";

/** Whether a field carries an authored value anywhere in the selection. */
function isAuthored(state: StyleFieldHandle<CssLength>["state"]): boolean {
	return state.kind === "value" || state.kind === "mixed";
}

/** Props shared by the two gap controls. */
export interface GapControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<CssLength>;
	/** The section's address — the axis fields bind at the same one. */
	readonly address: StyleFieldAddress;
	readonly testId?: string;
}

/** `gap`, plus the `rowGap` / `columnGap` split behind a link toggle. */
export function GapControl({
	label,
	field,
	address,
	testId,
}: GapControlProps): ReactNode {
	const msg = useMsg();
	const rowGap = useStyleField<CssLength>(address, {
		field: "property",
		property: "rowGap",
	});
	const columnGap = useStyleField<CssLength>(address, {
		field: "property",
		property: "columnGap",
	});

	const splittable =
		rowGap.state.kind !== "unsupported" ||
		columnGap.state.kind !== "unsupported";
	const authored = isAuthored(rowGap.state) || isAuthored(columnGap.state);
	// `null` = follow the document; a press pins the choice for the
	// session so the split can be opened before anything is typed.
	const [pinned, setPinned] = useState<boolean | null>(null);
	const split = splittable && (pinned ?? authored);

	const toggle = splittable ? (
		<Toggle
			size="sm"
			pressed={!split}
			onPressedChange={(next: boolean) => {
				setPinned(!next);
				if (!next) {
					return;
				}
				// Re-linking clears the axes that would otherwise keep
				// overriding the shorthand. Untouched axes are not written.
				if (isAuthored(rowGap.state)) {
					rowGap.reset();
				}
				if (isAuthored(columnGap.state)) {
					columnGap.reset();
				}
			}}
			aria-label={msg("studio.editor.inspector.layout.gap.link")}
			className="size-7 shrink-0"
			data-testid="ak-style-gap-link"
		>
			{split ? (
				<Unlink2 className="size-3" aria-hidden="true" />
			) : (
				<Link2 className="size-3" aria-hidden="true" />
			)}
		</Toggle>
	) : null;

	return (
		<>
			<LengthControl
				label={label}
				field={field}
				accessory={toggle}
				testId={testId}
			/>
			{split ? (
				<>
					<LengthControl
						label={msg("studio.editor.inspector.layout.rowGap")}
						field={rowGap}
						testId="ak-style-prop-rowGap"
					/>
					<LengthControl
						label={msg("studio.editor.inspector.layout.columnGap")}
						field={columnGap}
						testId="ak-style-prop-columnGap"
					/>
				</>
			) : null}
		</>
	);
}

/** `rowGap` / `columnGap` on their own — silent when `gap` owns them. */
export function AxisGapControl({
	label,
	field,
	address,
	testId,
}: GapControlProps): ReactNode {
	const gap = useStyleField<CssLength>(address, {
		field: "property",
		property: "gap",
	});
	if (gap.state.kind !== "unsupported") {
		// `gap` is granted here, so `GapControl` already renders this
		// axis under the link toggle. Rendering it again would offer the
		// same carrier twice in one section.
		return null;
	}
	return <LengthControl label={label} field={field} testId={testId} />;
}
