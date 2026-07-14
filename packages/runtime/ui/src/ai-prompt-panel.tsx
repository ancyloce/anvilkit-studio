"use client";

/**
 * @file `<AiPromptPanel>` — selection-aware prompt panel for the AI
 * copilot.
 *
 * Pure presentation. The parent owns: the prompt string, the pending
 * status, the selection identity, and the submit handlers. The panel
 * never touches the AI plugin directly — keeping it stack-agnostic so
 * the same primitive works in `apps/demo`, downstream Studio shells,
 * and component tests.
 *
 * Motion: the heading gradient-sweeps at rest and shimmers while a
 * generation is pending; the description fades in on mode switch; the
 * diagnostics block slides in via AnimatePresence; the submit button
 * has a tactile hover/tap scale and a cross-fade label swap. Decoration
 * is reserved for the heading — the body stays calm so author attention
 * stays on the prompt.
 */

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";

import { Button } from "./button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "./card";
import { Separator } from "./separator";
import { Textarea } from "./textarea";
import { Button as MotionButton } from "./components/animate-ui/primitives/buttons/button";
import { GradientText } from "./components/animate-ui/primitives/texts/gradient";
import { ShimmeringText } from "./components/animate-ui/primitives/texts/shimmering";

export interface AiPromptPanelSelection {
	readonly zoneId: string;
	readonly nodeIds: readonly string[];
	readonly nodeLabels?: readonly string[];
}

export interface AiPromptPanelIssue {
	readonly path: string;
	readonly message: string;
	readonly severity: "error" | "warn";
}

export interface AiPromptPanelProps {
	readonly prompt: string;
	readonly onPromptChange: (next: string) => void;
	readonly selection?: AiPromptPanelSelection | null;
	readonly onGenerate: (prompt: string) => void;
	readonly onRegenerate?: (
		prompt: string,
		selection: AiPromptPanelSelection,
	) => void;
	readonly status?: "idle" | "pending";
	readonly error?: string | null;
	readonly issues?: readonly AiPromptPanelIssue[];
	readonly sectionDescription?: string;
	readonly placeholder?: string;
	readonly className?: string;
}

const DEFAULT_PAGE_PLACEHOLDER = "a hero for a SaaS landing page";
const DEFAULT_SECTION_PLACEHOLDER = "rewrite this hero in a punchier voice";

const HEADING_GRADIENT =
	"linear-gradient(90deg, var(--primary) 0%, hsl(280 90% 65%) 50%, var(--primary) 100%)";
const HEADING_SWEEP = {
	duration: 14,
	repeat: Infinity,
	ease: "linear",
} as const;

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

	const errorIssues =
		issues?.filter((issue) => issue.severity === "error") ?? [];
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

	const buttonLabel = isPending ? pendingLabel : submitLabel;
	const modeKey = isSectionMode ? "section" : "page";

	return (
		<Card
			data-slot="ai-prompt-panel"
			data-mode={isSectionMode ? "section" : "page"}
			className={className}
		>
			<CardHeader>
				<span
					data-testid="ai-prompt-panel-eyebrow"
					className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground"
				>
					<span aria-hidden className="size-1.5 rounded-full bg-primary/60" />
					{eyebrow}
				</span>
				<CardTitle data-testid="ai-prompt-panel-heading">
					{isPending ? (
						<ShimmeringText
							text={heading}
							duration={1.4}
							color="var(--muted-foreground)"
							shimmeringColor="var(--foreground)"
						/>
					) : (
						<GradientText
							text={heading}
							gradient={HEADING_GRADIENT}
							transition={HEADING_SWEEP}
						/>
					)}
				</CardTitle>
				<CardDescription data-testid="ai-prompt-panel-description">
					<AnimatePresence mode="wait" initial={false}>
						<motion.span
							key={modeKey}
							initial={{ opacity: 0, y: 4 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -4 }}
							transition={{ duration: 0.2, ease: "easeOut" }}
							style={{ display: "inline-block" }}
						>
							{description}
						</motion.span>
					</AnimatePresence>
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
					<MotionButton
						asChild
						hoverScale={submitDisabled ? 1 : 1.02}
						tapScale={submitDisabled ? 1 : 0.97}
					>
						<Button
							type="button"
							data-testid="ai-prompt-panel-submit"
							onClick={handleSubmit}
							disabled={submitDisabled}
						>
							<AnimatePresence mode="wait" initial={false}>
								<motion.span
									key={buttonLabel}
									initial={{ opacity: 0, y: 4 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -4 }}
									transition={{ duration: 0.15 }}
									style={{ display: "inline-block" }}
								>
									{buttonLabel}
								</motion.span>
							</AnimatePresence>
						</Button>
					</MotionButton>
					{isSectionMode ? (
						<span className="text-xs text-muted-foreground">
							The surrounding canvas stays untouched.
						</span>
					) : null}
				</div>
				<AnimatePresence initial={false}>
					{hasDiagnostics ? (
						<motion.div
							key="diagnostics"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.22, ease: "easeOut" }}
							style={{ overflow: "hidden" }}
						>
							<div className="flex flex-col gap-2 pt-1">
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
											on{" "}
											<code className="font-mono text-xs">
												createAiCopilotPlugin
											</code>{" "}
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
											className="flex list-disc flex-col gap-1 pl-5 text-destructive"
										>
											{errorIssues.map((issue, index) => (
												<li
													key={`${issue.path}:${index}`}
													className="break-words"
												>
													<span className="font-mono text-xs">
														{issue.path || "(root)"}
													</span>{" "}
													— {issue.message}
												</li>
											))}
										</ul>
									) : null}
									{warnIssues.length > 0 ? (
										<ul
											data-testid="ai-prompt-panel-warn-issues"
											className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground"
										>
											{warnIssues.map((issue, index) => (
												<li
													key={`${issue.path}:${index}`}
													className="break-words"
												>
													<span className="font-mono text-xs">
														{issue.path || "(root)"}
													</span>{" "}
													— {issue.message}
												</li>
											))}
										</ul>
									) : null}
								</div>
							</div>
						</motion.div>
					) : null}
				</AnimatePresence>
			</CardContent>
		</Card>
	);
}

export { AiPromptPanel };
