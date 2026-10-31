"use client";

/**
 * @file The operation view's live state (P20, plan 0005 Phase 3): one
 * committed snapshot (`GET /operations/{id}`) and the durable event stream
 * (`GET /operations/{id}/events`, SSE through the Studio proxy) read with
 * the fetch-based client. The first open replays from the beginning so the
 * timeline carries the history; every reconnect resumes with
 * `Last-Event-ID` = the last processed `eventSeq`; a `reset_required` frame
 * refetches the snapshot, takes its `coveredEventSeq` as the baseline and
 * marks the missing history. A frame that moves the operation into
 * `waiting` refetches the snapshot, the only carrier of the posed question
 * set. A terminal frame triggers the authoritative
 * snapshot refresh at once (§4.4) while the stream keeps draining
 * settlement until the server closes it; stream closure is never read as
 * success. Closing the view never cancels the operation. Control commands
 * are tracked: each command keeps its `commandId` until Control's receipt
 * settles, so a retry after a lost response resolves to the original
 * receipt.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readEventStream, type StreamStop } from "./event-stream";
import {
	agentPath,
	applyFrame,
	asErrorEnvelope,
	type CommandKind,
	type CommandReceipt,
	type ErrorEnvelope,
	isTerminal,
	needsSnapshot,
	newCommandId,
	type OperationView,
	readJson,
} from "./operation-client";
import {
	appendFrame,
	emptyTimeline,
	markHistoryGap,
	roleOf,
	type Timeline,
} from "./timeline";

export type StreamState = "connecting" | "live" | "reconnecting" | "closed";

export type StreamError = Extract<StreamStop, { reason: "error" }>;

export interface OperationState {
	readonly view: OperationView | null;
	readonly error: ErrorEnvelope | null;
	readonly stream: StreamState;
	/** The bounded wait the reader is in after a retryable 429/503 (ms), else `null`. */
	readonly waitMs: number | null;
	/** Why the stream stopped on an error (401/403/404, exhausted waits); `null` otherwise. */
	readonly streamError: StreamError | null;
	/** Every frame received, as facts and derived lines (§4.2); `null` before the snapshot. */
	readonly timeline: Timeline | null;
	readonly refresh: () => Promise<void>;
	readonly command: (
		kind: CommandKind,
	) => Promise<CommandReceipt | ErrorEnvelope>;
	readonly pendingCommand: {
		readonly kind: CommandKind;
		readonly commandId: string;
	} | null;
}

export function useOperation(operationId: string | null): OperationState {
	const [view, setView] = useState<OperationView | null>(null);
	const [error, setError] = useState<ErrorEnvelope | null>(null);
	const [stream, setStream] = useState<StreamState>("closed");
	const [waitMs, setWaitMs] = useState<number | null>(null);
	const [streamError, setStreamError] = useState<StreamError | null>(null);
	const [timeline, setTimeline] = useState<Timeline | null>(null);
	const [generation, setGeneration] = useState(0);
	const [pendingCommand, setPending] = useState<{
		kind: CommandKind;
		commandId: string;
	} | null>(null);
	const viewRef = useRef<OperationView | null>(null);
	viewRef.current = view;

	const fetchView = useCallback(async (): Promise<OperationView | null> => {
		if (!operationId) return null;
		const response = await fetch(
			agentPath(`operations/${encodeURIComponent(operationId)}`),
			{ cache: "no-store" },
		);
		const body = await readJson(response);
		if (response.ok) {
			const next = body as OperationView;
			setView(next);
			setError(null);
			return next;
		}
		setError(asErrorEnvelope(body));
		return null;
	}, [operationId]);

	const refresh = useCallback(async () => {
		await fetchView();
	}, [fetchView]);

	useEffect(() => {
		setView(null);
		setError(null);
		setTimeline(null);
		setStreamError(null);
		setWaitMs(null);
		void fetchView().then((v) => {
			if (v) setGeneration((g) => g + 1);
		});
	}, [fetchView]);

	// One reader per snapshot generation. The first open carries no
	// Last-Event-ID (the whole history is replayed into the timeline); the
	// reader resumes from the last processed id itself. The URL never
	// carries `after`.
	useEffect(() => {
		const current = viewRef.current;
		if (!operationId || !current || generation === 0) return;
		const controller = new AbortController();
		const terminal = { value: isTerminal(current.lifecycle) };
		setTimeline((t) => t ?? emptyTimeline(operationId, roleOf(current.kind)));
		setStreamError(null);
		void readEventStream(
			{
				url: agentPath(`operations/${encodeURIComponent(operationId)}/events`),
				lastEventId: null,
				signal: controller.signal,
			},
			{
				onFrame(frame) {
					const before = viewRef.current;
					setTimeline((t) => (t ? appendFrame(t, frame) : t));
					setView((v) => (v ? applyFrame(v, frame) : v));
					// The question set of a waiting operation is in the snapshot only.
					if (before && needsSnapshot(before, frame)) void fetchView();
					if (isTerminal(frame.payload.lifecycle) && !terminal.value) {
						// §4.4: the terminal fact triggers the authoritative snapshot
						// at once; completion is read from that snapshot, never from
						// the stream's closure or its settlement frames.
						terminal.value = true;
						void fetchView();
					}
				},
				async onReset() {
					// The baseline is the refreshed snapshot's cursor, not the frame's (§4.3).
					const v = await fetchView();
					if (!v) return null;
					const baseline = v.coveredEventSeq;
					setTimeline((t) => (t ? markHistoryGap(t, baseline) : t));
					terminal.value = isTerminal(v.lifecycle);
					return baseline;
				},
				shouldResume(cause) {
					// EOF (or a drop) after the terminal snapshot: the server sent
					// its last event; before it: resume from the last id. A server
					// shutdown is always resumed.
					if (cause === "end") return true;
					return !terminal.value;
				},
				onPhase(phase, detail) {
					if (controller.signal.aborted) return;
					setWaitMs(phase === "waiting" ? (detail?.waitMs ?? null) : null);
					setStream(phase === "waiting" ? "reconnecting" : phase);
				},
			},
		).then((stop) => {
			if (controller.signal.aborted) return;
			setStream("closed");
			setWaitMs(null);
			if (stop.reason === "error") setStreamError(stop);
			// The stream's own end adds nothing to the outcome: the snapshot does.
			if (stop.reason === "done") void fetchView();
		});
		return () => {
			controller.abort();
			setStream("closed");
		};
	}, [operationId, generation, fetchView]);

	const command = useCallback(
		async (kind: CommandKind): Promise<CommandReceipt | ErrorEnvelope> => {
			const current = viewRef.current;
			if (!operationId || !current) {
				return {
					error: {
						code: "INVALID_ARGUMENT",
						message: "No operation.",
						requestId: "studio",
						retryable: false,
					},
				};
			}
			const tracked =
				pendingCommand?.kind === kind
					? pendingCommand
					: { kind, commandId: newCommandId(kind) };
			setPending(tracked);
			const response = await fetch(
				agentPath(`operations/${encodeURIComponent(operationId)}/commands`),
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: tracked.commandId,
						kind,
						expectedRevision: current.revision,
					}),
				},
			);
			const body = await readJson(response);
			const envelope = asErrorEnvelope(body);
			if (envelope) {
				// A retryable refusal keeps the identity for the retry; a decided one releases it.
				if (!envelope.error.retryable) setPending(null);
				if (envelope.error.code === "REVISION_CONFLICT") await refresh();
				return envelope;
			}
			const receipt = body as CommandReceipt;
			if (receipt.outcome !== "pending") setPending(null);
			await refresh();
			return receipt;
		},
		[operationId, pendingCommand, refresh],
	);

	return {
		view,
		error,
		stream,
		waitMs,
		streamError,
		timeline,
		refresh,
		command,
		pendingCommand,
	};
}
