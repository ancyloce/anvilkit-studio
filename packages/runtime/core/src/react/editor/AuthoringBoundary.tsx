"use client";

/**
 * @file `AuthoringBoundary` — the wrapper element Core renders around
 * components that declare `styleTarget: "wrapper"` (PLAN-0020
 * CORE-P0-011; DD-0019 §8, §11.4).
 *
 * The component author explicitly accepts this extra DOM element by
 * choosing the wrapper target. `box-sizing: border-box` is applied
 * per §11.4 so authored padding/size behave predictably. Styling is
 * inline by necessity: the canvas iframe does not inherit parent CSS
 * (repo rule), and resolved authoring styles are runtime-computed.
 */

import type { CSSProperties, ReactNode } from "react";
import type { ResolvedAuthoringStyle } from "../../editor/style/resolve-authoring-style.js";

function toCssProperties(
	inlineStyle: ResolvedAuthoringStyle["inlineStyle"],
): CSSProperties {
	const style: Record<string, string | number> = {};
	for (const [property, value] of Object.entries(inlineStyle)) {
		// CSS custom-property passthrough plus kebab→camel for React.
		const key = property.startsWith("--")
			? property
			: property.replace(/-([a-z])/g, (_match, ch: string) => ch.toUpperCase());
		style[key] = value;
	}
	return style as CSSProperties;
}

/** Props for {@link AuthoringBoundary}. */
export interface AuthoringBoundaryProps {
	readonly resolved: ResolvedAuthoringStyle | undefined;
	readonly children?: ReactNode;
}

/**
 * Renders the wrapper element and applies the resolved authoring
 * style. With no resolved style (editor disabled or nothing
 * authored) the wrapper is present but style-free — declared-wrapper
 * components accept the element unconditionally, keeping DOM shape
 * stable across editor on/off.
 */
export function AuthoringBoundary({
	resolved,
	children,
}: AuthoringBoundaryProps): ReactNode {
	return (
		<div
			{...(resolved?.dataAttributes ?? {})}
			className={
				resolved !== undefined && resolved.classNames.length > 0
					? resolved.classNames.join(" ")
					: undefined
			}
			style={{
				boxSizing: "border-box",
				...(resolved !== undefined
					? toCssProperties(resolved.inlineStyle)
					: {}),
			}}
		>
			{children}
		</div>
	);
}
