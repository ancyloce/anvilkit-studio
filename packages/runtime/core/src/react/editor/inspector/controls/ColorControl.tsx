"use client";

/**
 * @file `ColorControl` — the pre-canonical inspector's binding to the
 * shared hex-color control (PLAN-0020 CORE-P1A-007, CORE-P2-002).
 *
 * The editor moved to `composition/style/controls/ColorControl.tsx`
 * with PLAN-0028 `p4-001`; the bridge-backed token picker stays here
 * and is handed down as that control's `accessory`.
 */

import type { CssColor, TokenOrLiteral } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { ColorControl as SharedColorControl } from "../../composition/style/controls/ColorControl.js";
import { TokenPicker } from "../../tokens/TokenPicker.js";
import { resolveTokenLiteral } from "../../tokens/use-token-picker.js";
import {
	type InspectorFieldHandle,
	useEditorInspector,
} from "../use-inspector.js";

/** Props for {@link ColorControl}. */
export interface ColorControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<TokenOrLiteral<CssColor>>;
	readonly testId?: string;
}

/** Hex color editor bound to one inspector field. */
export function ColorControl(props: ColorControlProps): ReactNode {
	const context = useEditorInspector();
	const { field } = props;
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const accessory =
		context === null ? null : (
			<TokenPicker
				context={context}
				type="color"
				attachedTokenId={value?.kind === "token" ? value.tokenId : undefined}
				onAttach={(tokenId) => void field.commit({ kind: "token", tokenId })}
				onDetach={() => {
					const literal =
						value?.kind === "token"
							? resolveTokenLiteral(context, value.tokenId)
							: undefined;
					if (literal !== undefined) {
						void field.commit({ kind: "literal", value: literal as CssColor });
					}
				}}
				currentLiteral={
					value?.kind === "literal"
						? (value.value as unknown as Parameters<
								typeof TokenPicker
							>[0]["currentLiteral"])
						: undefined
				}
			/>
		);
	return <SharedColorControl {...props} accessory={accessory} />;
}
