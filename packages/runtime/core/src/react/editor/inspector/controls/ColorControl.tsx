"use client";

/**
 * @file `ColorControl` — typed `CssColor` (hex) editor with a native
 * color swatch + hex text input (PLAN-0020 CORE-P1A-007, CORE-P2-002).
 *
 * Operates on `TokenOrLiteral<CssColor>`: literal hex values are
 * editable, and the Phase 2 token picker attaches/detaches document
 * tokens of type `color`. Invalid hex drafts stay local.
 */

import type { CssColor, TokenOrLiteral } from "@anvilkit/contracts/editor";
import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { TokenPicker } from "../../tokens/TokenPicker.js";
import { resolveTokenLiteral } from "../../tokens/use-token-picker.js";
import { InspectorFieldShell } from "../InspectorFieldShell.js";
import {
	type InspectorFieldHandle,
	useEditorInspector,
} from "../use-inspector.js";

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Props for {@link ColorControl}. */
export interface ColorControlProps {
	readonly label: string;
	readonly field: InspectorFieldHandle<TokenOrLiteral<CssColor>>;
	readonly testId?: string;
}

function hexOf(value: TokenOrLiteral<CssColor> | undefined): string {
	return value?.kind === "literal" && value.value.kind === "hex"
		? value.value.value
		: "";
}

/** Hex color editor bound to one inspector field. */
export function ColorControl({
	label,
	field,
	testId,
}: ColorControlProps): ReactNode {
	const msg = useMsg();
	const context = useEditorInspector();
	const value = field.state.kind === "value" ? field.state.value : undefined;
	const isToken = value?.kind === "token";
	const durableText = hexOf(value);
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !HEX_PATTERN.test(draft);

	const commitHex = (hex: string): void => {
		void field.commit({
			kind: "literal",
			value: { kind: "hex", value: hex.toLowerCase() },
		});
	};

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft(null);
			void field.reset();
			return;
		}
		if (!HEX_PATTERN.test(trimmed)) {
			return; // invalid draft retained (§11.3)
		}
		setDraft(null);
		commitHex(trimmed);
	};

	const picker =
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

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => void field.reset()}
		>
			{isToken ? (
				<div className="flex items-center gap-1">
					<span
						className="flex-1 truncate rounded border border-[var(--ak-studio-border)] px-2 py-1 text-[11px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-color-token"
					>
						{msg("studio.editor.inspector.tokenValue")}
					</span>
					{picker}
				</div>
			) : (
				<div className="flex items-center gap-1">
					<input
						type="color"
						// The native swatch needs a 6-digit hex; fall back to black.
						value={
							/^#[0-9a-f]{6}$/i.test(durableText) ? durableText : "#000000"
						}
						aria-label={msg("studio.editor.inspector.pickColor")}
						className="size-7 shrink-0 cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5"
						onChange={(event) => commitHex(event.target.value)}
						data-testid={testId !== undefined ? `${testId}-swatch` : undefined}
					/>
					<Input
						type="text"
						value={text}
						placeholder="#000000"
						aria-invalid={invalid || undefined}
						aria-label={label}
						className={cn(
							"h-7 flex-1 font-mono text-xs",
							invalid ? "border-red-500" : null,
						)}
						onChange={(event) => setDraft(event.target.value)}
						onBlur={commitDraft}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								commitDraft();
							}
						}}
						data-testid={testId}
					/>
					{picker}
				</div>
			)}
		</InspectorFieldShell>
	);
}
