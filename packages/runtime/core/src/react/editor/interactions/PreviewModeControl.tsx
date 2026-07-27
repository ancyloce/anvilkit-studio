"use client";

/**
 * @file `PreviewModeControl` — the §16 design/preview switch
 * (PLAN-0020 CORE-P3-002; ED-MOTION-002/003).
 *
 * §16: "Design mode prioritizes selection and does not run
 * interactions. Preview mode hides editing handles, executes the
 * normalized contract, and **always provides a visible
 * return-to-design control**."
 *
 * That last clause drives the shape of this component. In design mode
 * it is an unobtrusive toggle; in preview mode it becomes a labelled
 * button, because an author whose handles have vanished needs an
 * obvious way back — a subtle switch would leave the editor looking
 * broken. The two renders are deliberately asymmetric for that reason.
 *
 * Reduced motion is surfaced rather than silently applied: when the
 * user's OS asks for reduced motion, previewing shows a note, so an
 * author does not conclude their animation is broken when it is being
 * honoured (ED-MOTION-003).
 */

import { type ReactNode, use } from "react";
import { Button } from "@/primitives/button";
import { Toggle } from "@/primitives/toggle";
import { useMsg } from "@/state/editor-i18n-context";
import { useInteractionPreview } from "@/state/slices/editor-ui-selectors";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";
import { usePrefersReducedMotion } from "./use-preview-mode.js";

/** The design ⇄ preview control for the editor chrome. */
export function PreviewModeControl(): ReactNode {
	const msg = useMsg();
	const bridge = use(StudioEditorBridgeContext);
	const [preview, setPreview] = useInteractionPreview();
	const reducedMotion = usePrefersReducedMotion();

	// Hidden entirely without the editor runtime: a Studio with the
	// editor feature off has no interactions to preview, and offering
	// the mode would be a control that does nothing.
	if (bridge === null) {
		return null;
	}

	if (!preview) {
		return (
			<Toggle
				size="sm"
				pressed={false}
				onPressedChange={() => setPreview(true)}
				aria-label={msg("studio.editor.preview.enter")}
				className="h-7 px-2 text-xs"
				data-testid="ak-preview-enter"
			>
				{msg("studio.editor.preview.enter")}
			</Toggle>
		);
	}

	return (
		<div
			className="flex items-center gap-2"
			data-testid="ak-preview-active"
			// A live region: entering preview removes the handles, so the
			// state change must be announced rather than only shown.
			role="status"
		>
			{/* No `badge` primitive exists in this package; a styled span
			    is Tailwind-only per the styling rules and does not warrant
			    inventing a shared component for one call site. */}
			<span className="rounded bg-[var(--ak-studio-hover)] px-1.5 py-0.5 text-[11px] font-medium">
				{msg("studio.editor.preview.active")}
			</span>
			{reducedMotion ? (
				<span
					className="text-[11px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-preview-reduced-motion"
				>
					{msg("studio.editor.preview.reducedMotion")}
				</span>
			) : null}
			<Button
				type="button"
				size="sm"
				variant="secondary"
				className="h-7 px-2 text-xs"
				onClick={() => setPreview(false)}
				data-testid="ak-preview-exit"
			>
				{msg("studio.editor.preview.exit")}
			</Button>
		</div>
	);
}
