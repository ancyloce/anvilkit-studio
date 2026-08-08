"use client";

/**
 * @file `LengthControl` — the pre-canonical inspector's binding to the
 * shared typed-length control (PLAN-0020 CORE-P1A-006/-007; DD-0019
 * §11.3, §11.5).
 *
 * The editor itself moved to
 * `composition/style/controls/LengthControl.tsx` with PLAN-0028
 * `p4-001`. What stays here is the part that is genuinely legacy: the
 * token picker, which reads the bridge-backed inspector context. It is
 * passed down as the shared control's `accessory`, so the canonical
 * Style panel renders the same control without importing the bridge.
 */

import type { CssLength, CssUnit, TokenType } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { LengthControl as SharedLengthControl } from "../../composition/style/controls/LengthControl.js";
import { TokenPicker } from "../../tokens/TokenPicker.js";
import { resolveTokenLiteral } from "../../tokens/use-token-picker.js";
import {
	type InspectorFieldHandle,
	useEditorInspector,
} from "../use-inspector.js";

/** Props for {@link LengthControl}. */
export interface LengthControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<CssLength>;
	readonly units?: readonly CssUnit[];
	/** Allow the sizing keywords in the unit dropdown. */
	readonly allowKeywords?: boolean;
	/**
	 * Token type the picker filters by (§15.1 compatible type).
	 * Corner-radius fields pass `"radius"`; everything else is a
	 * `"length"`.
	 */
	readonly tokenType?: TokenType;
	readonly testId?: string;
}

/** Typed CSS length editor bound to one inspector field. */
export function LengthControl({
	tokenType = "length",
	...props
}: LengthControlProps): ReactNode {
	const context = useEditorInspector();
	const { field } = props;
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const accessory =
		context === null ? null : (
			<TokenPicker
				context={context}
				type={tokenType}
				attachedTokenId={value?.kind === "token" ? value.tokenId : undefined}
				onAttach={(tokenId) => void field.commit({ kind: "token", tokenId })}
				onDetach={() => {
					// A `length`/`radius` token resolves to a `CssLength`, which
					// is written back in place — there is no literal wrapper in
					// this union (see `materializeTokenLiteral`).
					const literal =
						value?.kind === "token"
							? resolveTokenLiteral(context, value.tokenId)
							: undefined;
					if (literal !== undefined) {
						void field.commit(literal as CssLength);
					}
				}}
				currentLiteral={
					value !== undefined && value.kind !== "token"
						? (value as unknown as Parameters<
								typeof TokenPicker
							>[0]["currentLiteral"])
						: undefined
				}
			/>
		);
	return <SharedLengthControl {...props} accessory={accessory} />;
}
