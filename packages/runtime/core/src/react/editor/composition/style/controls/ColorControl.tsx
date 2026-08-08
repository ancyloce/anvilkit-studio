"use client";

/**
 * @file `ColorControl` — typed `CssColor` (hex) editor with a native
 * color swatch + hex text input.
 *
 * Operates on `TokenOrLiteral<CssColor>`: literal hex values are
 * editable and token-backed values render a badge; attach/detach is the
 * caller's `accessory` (the token picker, where the host provides one).
 * Invalid hex drafts stay local (§11.3), and the swatch commits once
 * per interaction — see {@link ColorSwatch}.
 *
 * Moved here from `inspector/controls/ColorControl.tsx` by PLAN-0028
 * `p4-001`; the old path wraps this one.
 */

import type { CssColor, TokenOrLiteral } from "@anvilkit/contracts/editor";
import { type ReactNode, useEffect, useState } from "react";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { InspectorFieldShell } from "../../../inspector/InspectorFieldShell.js";
import { ColorSwatch } from "./ColorSwatch.js";
import { fieldValue, type StyleFieldHandle } from "./handle.js";

const HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Props for {@link ColorControl}. */
export interface ColorControlProps {
	readonly label: string;
	readonly field: StyleFieldHandle<TokenOrLiteral<CssColor>>;
	/** Trailing affordance (the token picker, where one is available). */
	readonly accessory?: ReactNode;
	readonly testId?: string;
}

/** The hex literal inside a `TokenOrLiteral<CssColor>`, or `""`. */
export function hexOf(value: TokenOrLiteral<CssColor> | undefined): string {
	return value?.kind === "literal" && value.value.kind === "hex"
		? value.value.value
		: "";
}

/** Wrap a hex string as the literal the specs store. */
export function hexLiteral(hex: string): TokenOrLiteral<CssColor> {
	return { kind: "literal", value: { kind: "hex", value: hex.toLowerCase() } };
}

/** Hex color editor bound to one style field. */
export function ColorControl({
	label,
	field,
	accessory = null,
	testId,
}: ColorControlProps): ReactNode {
	const msg = useMsg();
	const value = fieldValue(field.state);
	const isToken = value?.kind === "token";
	const durableText = hexOf(value);
	const [draft, setDraft] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the draft intentionally resets whenever the durable value changes (external commit, undo, selection change).
	useEffect(() => setDraft(null), [durableText]);
	const text = draft ?? durableText;
	const invalid = draft !== null && draft !== "" && !HEX_PATTERN.test(draft);

	const commitDraft = (): void => {
		if (draft === null) {
			return;
		}
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft(null);
			field.reset();
			return;
		}
		if (!HEX_PATTERN.test(trimmed)) {
			return; // invalid draft retained (§11.3)
		}
		setDraft(null);
		field.commit(hexLiteral(trimmed));
	};

	return (
		<InspectorFieldShell
			label={label}
			state={field.state}
			onReset={() => field.reset()}
		>
			{isToken ? (
				<div className="flex items-center gap-1">
					<span
						className="flex-1 truncate rounded border border-[var(--ak-studio-border)] px-2 py-1 text-[11px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-color-token"
					>
						{msg("studio.editor.inspector.tokenValue")}
					</span>
					{accessory}
				</div>
			) : (
				<div className="flex items-center gap-1">
					<ColorSwatch
						hex={durableText}
						label={msg("studio.editor.inspector.pickColor")}
						onCommit={(hex) => field.commit(hexLiteral(hex))}
						testId={testId !== undefined ? `${testId}-swatch` : undefined}
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
					{accessory}
				</div>
			)}
		</InspectorFieldShell>
	);
}
