"use client";

/**
 * @file `TimelinePanel` — ordered multi-step visualisation
 * (PLAN-0020 CORE-P3-003; ED-TIMELINE-001; DD-0019 §16).
 *
 * Shows what an interaction will actually do, on a shared time axis:
 * one row per action, one track per animated target, one bar per step.
 *
 * ### Derived, never stored
 *
 * Everything here comes from `buildInteractionTimeline`, which is built
 * on the same `buildMotionSchedule` the runtime executes. The panel
 * therefore cannot disagree with what plays — including the
 * reduced-motion transform, which drops transforms rather than snapping
 * them, so a transform-only action correctly shows *nothing* to run.
 *
 * ### Reordering
 *
 * ED-TIMELINE-001 asks for ordered visualisation *and* parameterisation.
 * Reordering commits through `interaction.update` (added under freeze
 * D-2 by owner decision, CORE-P3-001), which replaces the record in one
 * history-recording dispatch — so one undo restores the prior order.
 * `onReorder` is optional: a caller that omits it gets a purely
 * read-only panel.
 */

import type { InteractionV1 } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { Button } from "@/primitives/button";
import {
	buildInteractionTimeline,
	reorderActions,
	type TimelineSegment,
} from "../../../../editor/index.js";
import { usePrefersReducedMotion } from "../use-preview-mode.js";

/** Props for {@link TimelinePanel}. */
export interface TimelinePanelProps {
	readonly interaction: InteractionV1;
	/**
	 * Commit a reordered interaction. Omitted = read-only, which is what
	 * a caller without `interaction.update` should pass.
	 */
	readonly onReorder?: (next: InteractionV1) => void;
}

/** Percentage width for a segment on the shared axis. */
function span(
	segment: TimelineSegment,
	totalMs: number,
): { readonly left: string; readonly width: string } {
	// A zero-duration timeline would divide by zero; a single instant
	// action still deserves a visible bar.
	const total = totalMs > 0 ? totalMs : 1;
	const left = Math.min(100, (segment.startMs / total) * 100);
	const width = Math.max(
		2,
		Math.min(100 - left, ((segment.endMs - segment.startMs) / total) * 100),
	);
	return { left: `${left}%`, width: `${width}%` };
}

/** The §16 timeline for one interaction. */
export function TimelinePanel({
	interaction,
	onReorder,
}: TimelinePanelProps): ReactNode {
	const msg = useMsg();
	const reducedMotion = usePrefersReducedMotion();
	const timeline = buildInteractionTimeline(interaction.actions, {
		reducedMotion,
	});

	return (
		<div
			className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-2"
			data-testid="ak-timeline"
			data-duration={timeline.durationMs}
		>
			<div className="flex items-center justify-between text-[10px] text-[var(--ak-studio-muted-fg)]">
				<span>{msg("studio.editor.timeline.title")}</span>
				<span data-testid="ak-timeline-duration">
					{timeline.durationMs}
					{msg("studio.editor.timeline.ms")}
				</span>
			</div>

			{timeline.rows.map((row) => (
				<div
					key={row.actionIndex}
					className="flex flex-col gap-0.5"
					data-testid="ak-timeline-row"
					data-action-type={row.actionType}
				>
					<span className="flex items-center gap-1 text-[10px] font-medium">
						{row.actionIndex + 1}.{" "}
						{msg(`studio.editor.interaction.action.${row.actionType}`)}
						{onReorder !== undefined && interaction.actions.length > 1 ? (
							<>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-4 px-1 text-[10px]"
									disabled={row.actionIndex === 0}
									aria-label={msg("studio.editor.timeline.moveUp")}
									onClick={() =>
										onReorder({
											...interaction,
											actions: reorderActions(
												interaction.actions,
												row.actionIndex,
												row.actionIndex - 1,
											),
										})
									}
									data-testid="ak-timeline-move-up"
								>
									↑
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-4 px-1 text-[10px]"
									disabled={
										row.actionIndex === interaction.actions.length - 1
									}
									aria-label={msg("studio.editor.timeline.moveDown")}
									onClick={() =>
										onReorder({
											...interaction,
											actions: reorderActions(
												interaction.actions,
												row.actionIndex,
												row.actionIndex + 1,
											),
										})
									}
									data-testid="ak-timeline-move-down"
								>
									↓
								</Button>
							</>
						) : null}
					</span>

					{row.tracks.length === 0 ? (
						// A non-animating action is a real ordered step with no
						// duration to draw — hiding it would make the timeline
						// disagree with the action list the author is editing.
						<span
							className="text-[10px] text-[var(--ak-studio-muted-fg)]"
							data-testid="ak-timeline-instant"
						>
							{msg("studio.editor.timeline.instant")}
						</span>
					) : (
						row.tracks.map((track) => (
							<div
								key={track.targetNodeId}
								className="relative h-3 rounded bg-[var(--ak-studio-hover)]"
								data-testid="ak-timeline-track"
								data-target={track.targetNodeId}
							>
								{track.segments.map((segment) => {
									const { left, width } = span(segment, timeline.durationMs);
									return (
										<div
											key={`${segment.startMs}-${segment.properties.join()}`}
											className={cn(
												"absolute top-0 h-3 rounded bg-[var(--ak-studio-accent,#3b82f6)]",
												// A spring settles rather than stopping at a
												// fixed time, so its end is nominal — drawn
												// dashed instead of implying a hard stop.
												segment.nominalEnd &&
													"opacity-70 [border-right:2px_dashed]",
											)}
											style={{ left, width }}
											title={segment.properties.join(", ")}
											data-testid="ak-timeline-segment"
											data-nominal-end={segment.nominalEnd ? "true" : "false"}
											data-properties={segment.properties.join(",")}
										/>
									);
								})}
							</div>
						))
					)}
				</div>
			))}

			{reducedMotion ? (
				<span
					className="text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-timeline-reduced-motion"
				>
					{msg("studio.editor.timeline.reducedMotion")}
				</span>
			) : null}
		</div>
	);
}
