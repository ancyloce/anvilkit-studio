"use client";

/**
 * @file `CompositionCanvas` — the shell's canvas column: the viewport
 * toolbar above `Puck.Preview`, with the preview width derived from
 * the shared write layer (PLAN-0028 `p4-005`).
 *
 * The width is **derived, never stored**. `ViewportToolbar` writes the
 * layer; this component reads the same layer and projects it to a
 * width through the shared {@link viewportWidthForLayer}. Neither side
 * keeps a viewport value, so "previewing mobile" and "authoring
 * mobile" cannot drift apart — they are two readings of one value.
 *
 * ### The preview is wrapped in the compiled-appearance feed
 *
 * `p4-009`. Without this the promoted shell renders **unstyled** and
 * the parity claim is false: `AppearanceIframeOverride` is what makes
 * the editor canvas the *same* consumer as production rather than a
 * fourth renderer that resembles it. It compiles the live document
 * once (`useCompiledAppearance`) and injects exactly one style element
 * — the same sheet the preview, the production render and the export
 * consume.
 *
 * ### The previewed token mode is compiled, not simulated
 *
 * `p5-007`. The mode the Design System panel selects arrives here
 * through {@link useTokenMode} and is handed to the *same*
 * `compileDocumentAppearance` call the preview, the production render
 * and the export make (contract rule 3). Switching mode therefore
 * repaints by recompiling the document — there is no second style
 * path, no mode-specific override sheet, and nothing the editor shows
 * that production would compute differently.
 *
 * Wrapping the preview directly is the **host-document** wiring the
 * component's own header prescribes (`iframe: { enabled: false }`, and
 * every jsdom test). In iframe mode the same component is additionally
 * passed as Puck's `iframe` override, where it renders only inside
 * `AutoFrame`'s enabled branch — so the §8.4 rule holds either way:
 * exactly one injection path per canvas document.
 */

import { Puck } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { DefinitionScopeBanner } from "../components/DefinitionScope.js";
import { useDocumentModel } from "../use-document-model.js";
import { AppearanceIframeOverride } from "./AppearanceIframeOverride.js";
import { useTokenMode } from "./token-mode.js";
import { ViewportToolbar, viewportWidthForLayer } from "./ViewportToolbar.js";
import { useWriteLayer } from "./write-layer.js";

const NO_BREAKPOINTS = Object.freeze([]);

/** Props for {@link CompositionCanvas}. */
export interface CompositionCanvasProps {
	/** CSP nonce propagated onto the injected style element (§7.4). */
	readonly nonce?: string;
	/**
	 * Token mode to compile against. Overrides the shell's previewed
	 * mode for a host that wires this component directly; omit it —
	 * which the shell does — and the mode is
	 * {@link useTokenMode}'s, which the Design System panel writes.
	 */
	readonly tokenMode?: string;
}

/** The canvas column. Must render inside `<Puck>`. */
export function CompositionCanvas({
	nonce,
	tokenMode,
}: CompositionCanvasProps = {}): ReactNode {
	const model = useDocumentModel();
	const { layer } = useWriteLayer();
	const shellTokenMode = useTokenMode();
	// One mode, two readings: the panel writes the shell value and the
	// canvas compiles against it. `undefined` reaches
	// `compileDocumentAppearance` unchanged and means "the document's
	// own `defaultTokenMode`" — the panel resolves the same fallback
	// for display, so neither side can be showing a mode the other is
	// not compiling.
	const activeTokenMode = tokenMode ?? shellTokenMode.tokenMode;
	const width = viewportWidthForLayer(
		layer,
		model.designSystem?.breakpoints ?? NO_BREAKPOINTS,
	);
	// A runtime-computed length Tailwind cannot express as a utility —
	// the documented exception to the no-inline-styles rule.
	const frame: CSSProperties | undefined =
		width === undefined ? undefined : { maxWidth: `${width}px` };

	return (
		<main
			className="flex min-w-0 flex-1 flex-col overflow-hidden"
			data-testid="ak-composition-canvas"
			data-viewport-width={width ?? "auto"}
			data-token-mode={activeTokenMode ?? "document-default"}
		>
			<ViewportToolbar />
			{/* The definition-editing scope, made visible where the author
			    is looking. Deliberately NOT the same vocabulary as
			    `p5-002`'s component mode above it: that one styles an
			    instance's elements in place on this page, this one says a
			    component *definition* is open and the page canvas below is
			    still the page. `null` in page scope. */}
			<DefinitionScopeBanner model={model} />
			<div className="min-h-0 flex-1 overflow-auto">
				<div
					className="mx-auto h-full w-full"
					style={frame}
					data-testid="ak-composition-viewport-frame"
				>
					<AppearanceIframeOverride nonce={nonce} tokenMode={activeTokenMode}>
						<Puck.Preview />
					</AppearanceIframeOverride>
				</div>
			</div>
		</main>
	);
}
