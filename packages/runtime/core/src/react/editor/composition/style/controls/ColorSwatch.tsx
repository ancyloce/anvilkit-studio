"use client";

/**
 * @file `ColorSwatch` — the native color input, with one commit per
 * interaction (PLAN-0028 `p4-001`).
 *
 * The OS color picker emits a continuous stream of `input` events while
 * it is being dragged. Committing each one writes a history entry per
 * pointer move, which is exactly the defect `p4-001` must not ship, so
 * the swatch **previews** into local state and commits once — on the
 * native `change` event, which fires when the interaction ends.
 *
 * React aliases `onChange` onto `input` for form controls, so the real
 * `change` event is only reachable through a listener attached to the
 * node. That is the whole reason this is a component rather than three
 * inline attributes.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/cn";

const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i;

/** Props for {@link ColorSwatch}. */
export interface ColorSwatchProps {
	/** The durable hex value; anything not 6-digit renders as black. */
	readonly hex: string;
	/** Localized accessible name. */
	readonly label: string;
	/** Called ONCE per interaction, with the final hex. */
	readonly onCommit: (hex: string) => void;
	readonly className?: string;
	readonly testId?: string;
}

/** Native color input that commits once per interaction. */
export function ColorSwatch({
	hex,
	label,
	onCommit,
	className,
	testId,
}: ColorSwatchProps): ReactNode {
	const [preview, setPreview] = useState<string | null>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the preview intentionally clears whenever the durable value changes (commit, undo, selection change).
	useEffect(() => setPreview(null), [hex]);

	const node = useRef<HTMLInputElement | null>(null);
	const latest = useRef(onCommit);
	useEffect(() => {
		latest.current = onCommit;
	});
	useEffect(() => {
		const input = node.current;
		if (input === null) return undefined;
		const committed = (): void => {
			setPreview(null);
			latest.current(input.value);
		};
		input.addEventListener("change", committed);
		return () => input.removeEventListener("change", committed);
	}, []);

	const shown = preview ?? hex;
	return (
		<input
			ref={node}
			type="color"
			value={SIX_DIGIT_HEX.test(shown) ? shown : "#000000"}
			aria-label={label}
			className={cn(
				"size-7 shrink-0 cursor-pointer rounded border border-[var(--ak-studio-border)] bg-transparent p-0.5",
				className,
			)}
			onChange={(event) => setPreview(event.target.value)}
			data-testid={testId}
		/>
	);
}
