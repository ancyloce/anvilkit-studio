"use client";

/**
 * @file `AccessibilityIssuesPanel` — the contract-rule issues list
 * (PLAN-0020 CORE-P1A-012; §32.2 scenario 7 contract subset).
 *
 * Interim placement: a collapsible block above the layer tree —
 * document-wide diagnostics belong beside the document structure
 * until the §26.2 chrome design assigns a dedicated surface. Each row
 * navigates to the offending node; automated safe-fix application
 * (e.g. writing alt text) requires prop-writing surfaces that arrive
 * with Phase 1B inline/image editing, so navigation IS the Phase 1A
 * fix path.
 */

import { Accessibility } from "lucide-react";
import type { ReactNode } from "react";
import { InspectorSection } from "@/overrides/layout/InspectorSection";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-context";
import { useAccessibilityIssues } from "./use-accessibility-issues.js";

/** The issues block; renders nothing while the document is clean. */
export default function AccessibilityIssuesPanel(): ReactNode {
	const msg = useMsg();
	const api = useAccessibilityIssues();
	if (api === null || api.issues.length === 0) {
		return null;
	}
	return (
		<div className="px-2 pt-1" data-testid="ak-a11y-panel">
			<InspectorSection
				id="editor:a11y"
				title={`${msg("studio.editor.a11y.title")} (${api.issues.length})`}
				defaultExpanded
			>
				<ul className="flex flex-col gap-0.5 pt-1 pb-2">
					{api.issues.map((issue) => (
						<li key={issue.fingerprint}>
							<Button
								type="button"
								variant="ghost"
								className="h-auto w-full justify-start gap-1.5 px-1.5 py-1 text-left text-xs"
								data-testid={`ak-a11y-issue-${issue.fingerprint}`}
								onClick={() => api.navigateTo(issue)}
							>
								<Accessibility
									className={
										issue.severity === "error"
											? "size-3.5 shrink-0 text-red-500"
											: "size-3.5 shrink-0 text-amber-500"
									}
									aria-hidden="true"
								/>
								<span className="min-w-0">
									<span className="block truncate">
										{/* §27.6 "non-color-only status": severity was
										    previously carried ONLY by the icon's colour
										    (red vs amber) on an `aria-hidden` icon, so a
										    colour-blind or screen-reader user could not
										    tell an error from a warning — in the
										    accessibility panel itself. The text prefix is
										    the status; the colour is now redundant
										    reinforcement (PLAN-0020 CORE-P4-003). */}
										<span className="font-medium">
											{msg(
												issue.severity === "error"
													? "studio.editor.a11y.severity.error"
													: "studio.editor.a11y.severity.warning",
											)}
										</span>
										{" · "}
										{msg(issue.messageKey)}
									</span>
									<span className="block truncate text-[10px] text-[var(--ak-studio-muted-fg)]">
										{issue.componentType} · {issue.nodeId}
									</span>
								</span>
							</Button>
						</li>
					))}
				</ul>
			</InspectorSection>
		</div>
	);
}
