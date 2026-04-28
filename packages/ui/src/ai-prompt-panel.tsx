/**
 * @file `<AiPromptPanel>` — selection-aware prompt panel for the AI
 * copilot.
 *
 * The Phase 6 / M9 sibling to the original 1.0 "Generate page" prompt.
 * The component renders a single `<textarea>` + submit affordance whose
 * mode is driven by the active Puck selection: zero selection switches
 * to whole-page generation (1.0 behavior); ≥ 1 selected node switches
 * to "Regenerate selection" so the host can call
 * `regenerateSelection(prompt, selection)` against
 * `@anvilkit/plugin-ai-copilot`.
 *
 * Pure presentation. The parent owns: the prompt string, the pending
 * status, the selection identity, and the submit handlers. The panel
 * never touches the AI plugin directly — keeping it stack-agnostic so
 * the same primitive works in `apps/demo`, downstream Studio shells,
 * and component tests.
 *
 * Diagnostics: the panel surfaces a free-form `error` message (e.g.
 * a network failure) plus a structured `issues` list (one row per
 * `validateAiSectionPatch` issue). Both render inline below the
 * textarea so the author sees feedback without leaving the panel.
 */

import * as React from "react";

import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Separator } from "./separator";
import { Textarea } from "./textarea";

/**
 * Lightweight description of the active Puck selection. Mirrors the
 * minimum surface `regenerateSelection()` needs without forcing the UI
 * package to depend on `@anvilkit/core/types` directly — keeps the
 * primitive importable from any host.
 */
export interface AiPromptPanelSelection {
	/**
	 * Stable Puck zone id (root content, legacy zone, or slot zone).
	 * Surfaced to the user as "Replacing in <zoneId>".
	 */
	readonly zoneId: string;
	/**
	 * Selected node ids in author-visible order.
	 */
	readonly nodeIds: readonly string[];
	/**
	 * Optional human-readable label per node (e.g. component type), used
	 * to make the "Replacing 1 node" summary more legible. Falls back to
	 * the node ids themselves when omitted.
	 */
	readonly nodeLabels?: readonly string[];
}

/**
 * One row in the inline diagnostics list. Matches the structured
 * payload `@anvilkit/plugin-ai-copilot` emits on `ai-copilot:error`.
 */
export interface AiPromptPanelIssue {
	readonly path: string;
	readonly message: string;
	readonly severity: "error" | "warn";
}

export interface AiPromptPanelProps {
	/**
	 * Controlled prompt value.
	 */
	readonly prompt: string;
	readonly onPromptChange: (next: string) => void;
	/**
	 * Active selection, or `null` for whole-page mode.
	 *
	 * The component switches mode purely on the truthiness + length of
	 * `selection.nodeIds`: an empty list is treated identically to
	 * `null` so callers don't need a special-case check.
	 */
	readonly selection?: AiPromptPanelSelection | null;
	/**
	 * Submission handler for the page-level flow. Required — the panel
	 * always supports page mode.
	 */
	readonly onGenerate: (prompt: string) => void;
	/**
	 * Submission handler for the section-level flow. When omitted, the
	 * panel still renders the section UI but disables the submit button
	 * and surfaces a hint that the host has not wired
	 * `regenerateSelection`.
	 */
	readonly onRegenerate?: (
		prompt: string,
		selection: AiPromptPanelSelection,
	) => void;
	/**
	 * Generation status. `"pending"` disables the submit button and
	 * shows a loading label.
	 */
	readonly status?: "idle" | "pending";
	/**
	 * Free-form error message rendered below the textarea (e.g. a
	 * timeout or network failure). Plain text — no HTML.
	 */
	readonly error?: string | null;
	/**
	 * Structured diagnostics list. Errors render in red, warnings in
	 * muted text. Empty array hides the section.
	 */
	readonly issues?: readonly AiPromptPanelIssue[];
	/**
	 * Optional hint shown when a section is selected — typically a
	 * sentence telling the author what will be replaced. Falls back to
	 * a default summary derived from `selection`.
	 */
	readonly sectionDescription?: string;
	/**
	 * Optional placeholder for the textarea. Defaults change with mode
	 * to nudge the author toward useful prompt text.
	 */
	readonly placeholder?: string;
	readonly className?: string;
}

const DEFAULT_PAGE_PLACEHOLDER = "a hero for a SaaS landing page";
const DEFAULT_SECTION_PLACEHOLDER = "rewrite this hero in a punchier voice";

function summarizeSelection(selection: AiPromptPanelSelection): string {
	const labels = selection.nodeLabels ?? selection.nodeIds;
	if (labels.length === 1) {
		return `Replacing 1 node (${labels[0]}) in ${selection.zoneId}.`;
	}
	const head = labels.slice(0, 3).join(", ");
	const tail = labels.length > 3 ? `, +${labels.length - 3} more` : "";
	return `Replacing ${labels.length} nodes (${head}${tail}) in ${selection.zoneId}.`;
}

function AiPromptPanel(props: AiPromptPanelProps): React.ReactElement {
	const {
		prompt,
		onPromptChange,
		selection,
		onGenerate,
		onRegenerate,
		status = "idle",
		error = null,
		issues,
		sectionDescription,
		placeholder,
		className,
	} = props;

	const isSectionMode = !!selection && selection.nodeIds.length > 0;
	const sectionHandlerMissing = isSectionMode && !onRegenerate;
	const isPending = status === "pending";

	const heading = isSectionMode ? "Regenerate selection" : "Generate page";
	const eyebrow = isSectionMode ? "Section flow" : "Page flow";
	const submitLabel = isSectionMode ? "Regenerate selection" : "Generate";
	const pendingLabel = isSectionMode ? "Regenerating…" : "Generating…";

	const description = isSectionMode
		? (sectionDescription ?? summarizeSelection(selection))
		: "Describe the page you want — the AI copilot will generate a full canvas.";

	const textareaPlaceholder =
		placeholder ??
		(isSectionMode ? DEFAULT_SECTION_PLACEHOLDER : DEFAULT_PAGE_PLACEHOLDER);

	const errorIssues = issues?.filter((issue) => issue.severity === "error") ?? [];
	const warnIssues = issues?.filter((issue) => issue.severity === "warn") ?? [];
	const hasDiagnostics =
		error !== null ||
		errorIssues.length > 0 ||
		warnIssues.length > 0 ||
		sectionHandlerMissing;

	const submitDisabled =
		isPending || prompt.trim().length === 0 || sectionHandlerMissing;

	function handleSubmit(): void {
		const trimmed = prompt.trim();
		if (trimmed.length === 0) return;
		if (isSectionMode && selection && onRegenerate) {
			onRegenerate(trimmed, selection);
		} else if (!isSectionMode) {
			onGenerate(trimmed);
		}
	}

	return (
		<Card
			data-slot="ai-prompt-panel"
			data-mode={isSectionMode ? "section" : "page"}
			className={className}
		>
			<CardHeader>
				<CardTitle data-testid="ai-prompt-panel-eyebrow" className="text-xs uppercase tracking-wide text-muted-foreground">
					{eyebrow}
				</CardTitle>
				<CardTitle data-testid="ai-prompt-panel-heading">{heading}</CardTitle>
				<CardDescription data-testid="ai-prompt-panel-description">
					{description}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<label
					htmlFor="ai-prompt-panel-input"
					className="flex flex-col gap-1.5"
				>
					<span className="text-xs uppercase tracking-wide text-muted-foreground">
						Prompt
					</span>
					<Textarea
						id="ai-prompt-panel-input"
						data-testid="ai-prompt-panel-input"
						value={prompt}
						placeholder={textareaPlaceholder}
						rows={3}
						onChange={(event) => onPromptChange(event.target.value)}
						disabled={isPending}
					/>
				</label>
				<div className="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						data-testid="ai-prompt-panel-submit"
						onClick={handleSubmit}
						disabled={submitDisabled}
					>
						{isPending ? pendingLabel : submitLabel}
					</Button>
					{isSectionMode ? (
						<span className="text-xs text-muted-foreground">
							The surrounding canvas stays untouched.
						</span>
					) : null}
				</div>
				{hasDiagnostics ? (
					<>
						<Separator />
						<div
							role="status"
							data-testid="ai-prompt-panel-diagnostics"
							className="flex flex-col gap-2 text-sm"
						>
							{sectionHandlerMissing ? (
								<p className="text-destructive">
									This host has not wired a section regenerator. Configure{" "}
									<code className="font-mono text-xs">generateSection</code>{" "}
									on <code className="font-mono text-xs">createAiCopilotPlugin</code>{" "}
									to enable section regeneration.
								</p>
							) : null}
							{error !== null ? (
								<p
									role="alert"
									data-testid="ai-prompt-panel-error"
									className="text-destructive"
								>
									{error}
								</p>
							) : null}
							{errorIssues.length > 0 ? (
								<ul
									data-testid="ai-prompt-panel-error-issues"
									className="flex flex-col gap-1 list-disc pl-5 text-destructive"
								>
									{errorIssues.map((issue, index) => (
										<li
											key={`${issue.path}:${index}`}
											className="break-words"
										>
											<span className="font-mono text-xs">{issue.path || "(root)"}</span>{" "}
											— {issue.message}
										</li>
									))}
								</ul>
							) : null}
							{warnIssues.length > 0 ? (
								<ul
									data-testid="ai-prompt-panel-warn-issues"
									className="flex flex-col gap-1 list-disc pl-5 text-muted-foreground"
								>
									{warnIssues.map((issue, index) => (
										<li
											key={`${issue.path}:${index}`}
											className="break-words"
										>
											<span className="font-mono text-xs">{issue.path || "(root)"}</span>{" "}
											— {issue.message}
										</li>
									))}
								</ul>
							) : null}
						</div>
					</>
				) : null}
			</CardContent>
		</Card>
	);
}

export { AiPromptPanel };
