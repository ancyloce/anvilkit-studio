"use client";

/**
 * The factual progress timeline of one operation (plan 0005 §4.1–§4.4,
 * §5): the committed facts as lines, grouped by attempt (outer repair
 * rounds are new groups, internal rounds stay inside), the stream state, a
 * marker where history is unavailable after a reset, and the outcome read
 * from the authoritative snapshot. Every text is a message key translated
 * at render; a controlled code appears as diagnostic metadata; model prose
 * never reaches this component.
 */

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Card } from "@anvilkit/ui/card";
import type { ReactElement } from "react";
import type { OperationView } from "@/lib/agent/operation-client";
import {
	currentEntry,
	deriveMessage,
	groupEntries,
	isCompleted,
	type Severity,
	type Timeline,
	type TimelineEntry,
	type TimelineMessage,
} from "@/lib/agent/timeline";
import type { OperationState } from "@/lib/agent/use-operation";
import { useDemoLocale, useDemoT } from "@/lib/i18n/client";
import {
	type DemoMessageKey,
	type DemoTranslator,
	formatDateTime,
	formatNumber,
} from "@/lib/i18n/messages";

const SEVERITY_CLASS: Record<Severity, string> = {
	info: "bg-muted-foreground/60",
	success: "bg-emerald-500",
	warning: "bg-amber-500",
	error: "bg-destructive",
};

function text(t: DemoTranslator, message: TimelineMessage): string {
	return t(message.key, message.params);
}

/** The headline of a snapshot without stream history yet (`OperationView.progress`, §4.3). */
function snapshotHeadline(
	view: OperationView,
	timeline: Timeline,
): TimelineMessage | null {
	if (timeline.entries.length > 0)
		return currentEntry(timeline)?.message ?? null;
	const progress = view.progress;
	const derived = deriveMessage(
		{
			lifecycle: view.lifecycle,
			phase: view.phase,
			control: view.control,
			cleanup: view.cleanup,
			finance: view.finance,
			...(view.failureCode !== undefined
				? { failureCode: view.failureCode }
				: {}),
			...(progress
				? {
						step: progress.step,
						visit: progress.visit,
						attemptOrdinal: progress.attemptOrdinal,
						...(progress.node ? { node: progress.node } : {}),
						...(progress.nodeState ? { nodeState: progress.nodeState } : {}),
						...(progress.round ? { round: progress.round } : {}),
					}
				: {}),
		},
		timeline.role,
	);
	return derived.message;
}

function Outcome({
	view,
	role,
}: {
	readonly view: OperationView;
	readonly role: Timeline["role"];
}): ReactElement | null {
	const t = useDemoT();
	if (role === "generation" && isCompleted(view)) {
		return (
			<Alert data-testid="progress-outcome" data-outcome="completed">
				<AlertTitle>{t("progress.stage.generationDone")}</AlertTitle>
			</Alert>
		);
	}
	if (role === "preparation" && view.lifecycle === "succeeded") {
		return (
			<Alert data-testid="progress-outcome" data-outcome="completed">
				<AlertTitle>{t("progress.stage.analysisDone")}</AlertTitle>
			</Alert>
		);
	}
	if (view.lifecycle === "failed") {
		const code = view.failureCode ?? "UNKNOWN";
		return (
			<Alert
				variant="destructive"
				data-testid="progress-outcome"
				data-outcome="failed"
			>
				<AlertTitle>
					{t(
						role === "preparation"
							? "progress.outcome.preparationFailed"
							: "progress.outcome.failed",
						{ code },
					)}
				</AlertTitle>
			</Alert>
		);
	}
	if (view.lifecycle === "canceled") {
		return (
			<Alert data-testid="progress-outcome" data-outcome="canceled">
				<AlertTitle>
					{t(
						role === "preparation"
							? "progress.outcome.preparationCanceled"
							: "progress.outcome.canceled",
					)}
				</AlertTitle>
			</Alert>
		);
	}
	if (view.lifecycle === "reconciling") {
		return (
			<Alert data-testid="progress-outcome" data-outcome="unresolved">
				<AlertTitle>
					{t("progress.outcome.unresolved", {
						code: view.failureCode ?? "EFFECT_UNCERTAIN",
					})}
				</AlertTitle>
			</Alert>
		);
	}
	return null;
}

function Entry({
	entry,
}: {
	readonly entry: TimelineEntry;
}): ReactElement | null {
	const t = useDemoT();
	const { locale } = useDemoLocale();
	const message = entry.message;
	if (!message) return null;
	return (
		<li
			className="flex gap-3 text-sm"
			data-testid="progress-entry"
			data-event-seq={entry.eventSeq}
			data-message-key={message.key}
			data-severity={entry.severity}
		>
			<span
				aria-hidden="true"
				className={`mt-1.5 size-2 shrink-0 rounded-full ${SEVERITY_CLASS[entry.severity]}`}
			/>
			<div className="flex min-w-0 flex-1 flex-col gap-0.5">
				<span>{text(t, message)}</span>
				{entry.detail ? (
					<span className="text-muted-foreground">{text(t, entry.detail)}</span>
				) : null}
				<span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
					<time dateTime={entry.occurredAt}>
						{formatDateTime(locale, entry.occurredAt)}
					</time>
					{entry.code ? (
						<span>
							{t("progress.diagnostic.code")}:{" "}
							<code className="font-mono" data-testid="progress-code">
								{entry.code}
							</code>
						</span>
					) : null}
				</span>
			</div>
		</li>
	);
}

export function ProgressTimeline({
	state,
	title,
	testId = "progress-timeline",
}: {
	readonly state: OperationState;
	readonly title: string;
	readonly testId?: string;
}): ReactElement | null {
	const t = useDemoT();
	const { locale } = useDemoLocale();
	const { view, timeline, stream, waitMs, streamError } = state;
	if (!view || !timeline) return null;
	const groups = groupEntries(timeline.entries, timeline.role);
	const headline = snapshotHeadline(view, timeline);
	const gap = timeline.historyUnavailableBefore;
	let gapShown = false;
	return (
		<Card
			className="gap-4 p-6"
			data-testid={testId}
			data-operation-id={view.operationId}
			data-stream={stream}
			data-entries={timeline.entries.length}
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-lg font-semibold">{title}</h2>
				<Badge variant="secondary" data-testid={`${testId}-stream`}>
					{t(`progress.stream.${stream}` as DemoMessageKey)}
				</Badge>
				{waitMs !== null ? (
					<span
						className="text-xs text-muted-foreground"
						data-testid={`${testId}-busy`}
					>
						{t("progress.error.busy", {
							seconds: formatNumber(locale, Math.ceil(waitMs / 1000)),
						})}
					</span>
				) : null}
			</div>
			{headline ? (
				<p className="text-sm font-medium" data-testid={`${testId}-current`}>
					{text(t, headline)}
				</p>
			) : null}
			<Outcome view={view} role={timeline.role} />
			{streamError ? (
				<Alert variant="destructive" data-testid={`${testId}-error`}>
					<AlertTitle>
						{streamError.status === 401 || streamError.status === 403
							? t("progress.error.notPermitted")
							: streamError.status === 404
								? t("progress.error.notFound")
								: t("progress.error.generic", {
										code:
											streamError.envelope?.error.code ??
											`HTTP_${streamError.status}`,
									})}
					</AlertTitle>
					{streamError.envelope ? (
						<AlertDescription>
							<code className="font-mono text-xs">
								{streamError.envelope.error.code}
							</code>
						</AlertDescription>
					) : null}
				</Alert>
			) : null}
			<ol className="flex flex-col gap-4" data-testid={`${testId}-groups`}>
				{groups.map((group) => {
					const items: ReactElement[] = [];
					for (const entry of group.entries) {
						if (gap && !gapShown && BigInt(entry.eventSeq) > BigInt(gap)) {
							gapShown = true;
							items.push(
								<li
									key="history-gap"
									className="text-xs italic text-muted-foreground"
									data-testid="progress-history-gap"
								>
									{t("progress.history.unavailable")}
								</li>,
							);
						}
						if (entry.message)
							items.push(<Entry key={entry.eventSeq} entry={entry} />);
					}
					if (items.length === 0) return null;
					return (
						<li
							key={group.key}
							data-testid="progress-group"
							data-group={group.key}
						>
							{group.label ? (
								<h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									{text(t, group.label)}
								</h3>
							) : null}
							<ul className="flex flex-col gap-2">{items}</ul>
						</li>
					);
				})}
			</ol>
		</Card>
	);
}
