/**
 * @file The factual timeline of an operation (plan 0005 §4.1–§4.2, §4.7,
 * §5). Every `operation.changed` frame becomes one entry holding the raw
 * facts Control committed (`eventSeq`, `step`, `visit`, `attemptOrdinal`,
 * `node`, `nodeState`, `round`, verdicts and controlled codes) plus a
 * derived message key with its parameters. Translation happens at render,
 * so a locale switch re-renders every entry without touching the entries,
 * the cursor or the operation. Entries are deduplicated by
 * `(operationId, eventSeq)` and ordered by `BigInt(eventSeq)`; a frame of
 * another operation is ignored. Nothing here fetches, times or animates:
 * a stage appears only when a committed fact says so.
 */
import type { DemoMessageKey } from "../i18n/messages";
import type { components } from "./generated/agent";

type Schemas = components["schemas"];
export type OperationEventFrame = Schemas["OperationEventFrame"];
type Payload = OperationEventFrame["payload"];
export type Lifecycle = Schemas["Lifecycle"];
export type ProgressNode = Schemas["ProgressNode"];
export type ProgressNodeState = Schemas["ProgressNodeState"];
export type StageVerdict = Schemas["StageVerdict"];

/** Which operation the entries describe; the preparation renders §4.7, the generation §4.1–§4.2. */
export type OperationRole = "preparation" | "generation";

export interface TimelineMessage {
	readonly key: DemoMessageKey;
	readonly params?: Readonly<Record<string, string>>;
}

export type Severity = "info" | "success" | "warning" | "error";

export interface TimelineEntry {
	readonly operationId: string;
	readonly eventSeq: string;
	readonly transitionId: string;
	readonly occurredAt: string;
	readonly lifecycle: Lifecycle;
	readonly phase: string;
	readonly step?: string;
	readonly visit?: string;
	readonly attemptOrdinal?: string;
	readonly node?: ProgressNode;
	readonly nodeState?: ProgressNodeState;
	readonly round?: string;
	readonly verdict?: StageVerdict;
	readonly verdictCode?: string;
	readonly outcomeCode?: string;
	readonly failureCode?: string;
	/** What the entry says; `null` for a fact without its own line (kept for grouping and cursors). */
	readonly message: TimelineMessage | null;
	readonly detail?: TimelineMessage;
	/** The controlled code behind the message, shown as diagnostic metadata only (never model text). */
	readonly code?: string;
	readonly severity: Severity;
}

export interface Timeline {
	readonly operationId: string;
	readonly role: OperationRole;
	readonly entries: readonly TimelineEntry[];
	/**
	 * Set after a reset whose baseline left earlier events unknown: the
	 * `coveredEventSeq` the stream resumed from. Rendered as one "Earlier
	 * history unavailable" marker above the first entry after it.
	 */
	readonly historyUnavailableBefore: string | null;
}

export function emptyTimeline(
	operationId: string,
	role: OperationRole,
): Timeline {
	return { operationId, role, entries: [], historyUnavailableBefore: null };
}

export function roleOf(kind: string): OperationRole {
	return kind === "preparation" ? "preparation" : "generation";
}

const seq = (value: string): bigint => {
	try {
		return BigInt(value);
	} catch {
		return -1n;
	}
};

/** The controlled code a failed send of the model's own making carries (Model Proxy classification). */
export const MODEL_OUTPUT_CODES: ReadonlySet<string> = new Set([
	"UPSTREAM_TOOL_ARGUMENTS_INVALID",
]);

/** A localized summary of a controlled error code: a model-output fault has its own text, anything else the generic one. */
export function errorMessage(code: string | undefined): {
	message: TimelineMessage;
	code: string;
} {
	const c = code && /^[A-Z][A-Z0-9_]{0,63}$/.test(code) ? code : "UNKNOWN";
	return {
		message: {
			key: MODEL_OUTPUT_CODES.has(c)
				? "progress.error.modelOutput"
				: "progress.error.generic",
			params: { code: c },
		},
		code: c,
	};
}

interface Derived {
	readonly message: TimelineMessage | null;
	readonly detail?: TimelineMessage;
	readonly code?: string;
	readonly severity: Severity;
}

const info = (
	key: DemoMessageKey,
	params?: Record<string, string>,
): Derived => ({
	message: { key, ...(params ? { params } : {}) },
	severity: "info",
});
const success = (
	key: DemoMessageKey,
	params?: Record<string, string>,
): Derived => ({
	message: { key, ...(params ? { params } : {}) },
	severity: "success",
});
const warning = (
	key: DemoMessageKey,
	params: Record<string, string>,
	code: string,
): Derived => ({ message: { key, params }, code, severity: "warning" });
const failure = (code: string | undefined): Derived => {
	const e = errorMessage(code);
	return { message: e.message, code: e.code, severity: "error" };
};
const silent: Derived = { message: null, severity: "info" };

function terminal(p: Payload, role: OperationRole): Derived | null {
	switch (p.lifecycle) {
		case "succeeded":
			if (role === "preparation") return success("progress.stage.analysisDone");
			// Only `candidate_ready` is a completed generation (§4.4); another
			// terminal phase is a fact without a completion claim.
			return p.phase === "candidate_ready"
				? success("progress.stage.generationDone")
				: silent;
		case "failed": {
			const code = p.failureCode ?? "UNKNOWN";
			return {
				message: {
					key:
						role === "preparation"
							? "progress.outcome.preparationFailed"
							: "progress.outcome.failed",
					params: { code },
				},
				code,
				severity: "error",
			};
		}
		case "canceled":
			return {
				message: {
					key:
						role === "preparation"
							? "progress.outcome.preparationCanceled"
							: "progress.outcome.canceled",
				},
				severity: "warning",
			};
		case "reconciling": {
			const code = p.failureCode ?? "EFFECT_UNCERTAIN";
			return {
				message: { key: "progress.outcome.unresolved", params: { code } },
				code,
				severity: "warning",
			};
		}
		default:
			return null;
	}
}

function preparation(p: Payload): Derived {
	const t = terminal(p, "preparation");
	if (t) return t;
	if (p.lifecycle === "waiting") return info("progress.stage.awaitingAnswers");
	if (p.phase === "brief_frozen") return success("progress.stage.analysisDone");
	if (p.step === "analysis" || p.phase === "analysis" || p.phase === "answered")
		return info("progress.stage.analyzing");
	if (p.lifecycle === "accepted") return info("progress.stage.accepted");
	return silent;
}

function progressNode(p: Payload): Derived {
	const round = p.round ?? "1";
	const code = p.outcomeCode;
	switch (p.node) {
		case "planner":
			if (p.nodeState === "started") return info("progress.stage.planning");
			if (p.nodeState === "completed")
				return success("progress.stage.planningDone");
			return failure(code);
		case "retrieve":
			if (p.nodeState === "started") return info("progress.stage.retrieving");
			if (p.nodeState === "completed")
				return code === "INSUFFICIENT_EVIDENCE"
					? info("progress.stage.retrievedNone")
					: success("progress.stage.retrieved");
			return failure(code);
		case "code":
			if (p.nodeState === "started") {
				// A later round is a repair the team starts after its own check
				// classified the previous round repairable (§4.2).
				if (seq(round) > 1n) {
					return {
						message: { key: "progress.stage.repairStarting" },
						detail: { key: "progress.stage.internalRepair", params: { round } },
						severity: "warning",
					};
				}
				return info("progress.stage.coding");
			}
			if (p.nodeState === "completed")
				return success("progress.stage.codingDone");
			return failure(code);
		case "review":
			if (p.nodeState === "started") return info("progress.stage.reviewing");
			if (p.nodeState === "completed")
				return success("progress.stage.reviewDone");
			if (p.nodeState === "skipped")
				return info("progress.stage.reviewSkipped");
			return failure(code);
		case "validate":
			if (p.nodeState === "started") return info("progress.stage.teamChecks");
			if (p.nodeState === "completed") {
				if (code === "certified" || code === undefined)
					return success("progress.stage.codingRoundDone", { round });
				return warning("progress.stage.internalCheckFailed", { code }, code);
			}
			return failure(code);
		default:
			return silent;
	}
}

function stage(p: Payload): Derived {
	const code = p.verdictCode;
	if (p.step === "codegen") {
		switch (p.verdict) {
			case "certified":
				return success("progress.stage.stageAccepted");
			case "repairable":
			case "invalid":
				return warning(
					"progress.stage.internalCheckFailed",
					{ code: code ?? "CANDIDATE_TEST_FAILED" },
					code ?? "CANDIDATE_TEST_FAILED",
				);
			default:
				return failure(code);
		}
	}
	if (p.step === "validate") {
		switch (p.verdict) {
			case "certified":
				return success("progress.stage.validationPassed");
			case "repairable":
			case "invalid":
				return warning(
					"progress.stage.validationFailed",
					{ code: code ?? "CANDIDATE_TEST_FAILED" },
					code ?? "CANDIDATE_TEST_FAILED",
				);
			default:
				return failure(code);
		}
	}
	return silent;
}

function generation(p: Payload): Derived {
	const t = terminal(p, "generation");
	if (t) return t;
	if (p.node) return progressNode(p);
	if (p.verdict) return stage(p);
	if (p.step === "codegen") {
		if (p.phase === "attempt_open") {
			const visit = p.visit ?? "0";
			if (seq(visit) > 0n) {
				return {
					message: { key: "progress.stage.repairStarting" },
					detail: { key: "progress.stage.outerRepair", params: { visit } },
					severity: "warning",
				};
			}
			return info("progress.stage.schedulingJob");
		}
		if (p.phase === "launch_prepared")
			return info("progress.stage.schedulingJob");
		if (p.phase === "running") return info("progress.stage.jobRunning");
		return silent;
	}
	if (p.step === "validate") {
		return p.phase === "attempt_closed"
			? silent
			: info("progress.stage.validating");
	}
	if (p.step === "register_candidate") {
		return p.phase === "attempt_closed"
			? silent
			: info("progress.stage.registering");
	}
	if (p.step) return silent;
	if (p.phase === "queued") return info("progress.stage.queued");
	if (p.phase === "admitted")
		return p.finance === "funded" ? info("progress.stage.admitted") : silent;
	if (p.lifecycle === "accepted") return info("progress.stage.accepted");
	return silent;
}

/** The display of one frame's facts, before deduplication against its predecessor. */
export function deriveMessage(payload: Payload, role: OperationRole): Derived {
	return role === "preparation" ? preparation(payload) : generation(payload);
}

function entryOf(
	frame: OperationEventFrame,
	role: OperationRole,
): TimelineEntry {
	const p = frame.payload;
	const d = deriveMessage(p, role);
	const entry: TimelineEntry = {
		operationId: frame.operationId,
		eventSeq: frame.eventSeq,
		transitionId: frame.transitionId,
		occurredAt: frame.occurredAt,
		lifecycle: p.lifecycle,
		phase: p.phase,
		message: d.message,
		severity: d.severity,
	};
	const optional: { -readonly [K in keyof TimelineEntry]?: TimelineEntry[K] } =
		{};
	if (p.step !== undefined) optional.step = p.step;
	if (p.visit !== undefined) optional.visit = p.visit;
	if (p.attemptOrdinal !== undefined)
		optional.attemptOrdinal = p.attemptOrdinal;
	if (p.node !== undefined) optional.node = p.node;
	if (p.nodeState !== undefined) optional.nodeState = p.nodeState;
	if (p.round !== undefined) optional.round = p.round;
	if (p.verdict !== undefined) optional.verdict = p.verdict;
	if (p.verdictCode !== undefined) optional.verdictCode = p.verdictCode;
	if (p.outcomeCode !== undefined) optional.outcomeCode = p.outcomeCode;
	if (p.failureCode !== undefined) optional.failureCode = p.failureCode;
	if (d.detail) optional.detail = d.detail;
	if (d.code) optional.code = d.code;
	return { ...entry, ...optional };
}

const sameMessage = (a: TimelineMessage | null, b: TimelineMessage | null) =>
	a !== null &&
	b !== null &&
	a.key === b.key &&
	JSON.stringify(a.params ?? {}) === JSON.stringify(b.params ?? {});

/**
 * Hides a line that repeats the previous visible line (a lease renewal, a
 * settlement frame after the terminal one, `launch_prepared` after
 * `attempt_open`): the facts stay, the display does not stutter.
 */
function dedupeMessages(entries: TimelineEntry[]): TimelineEntry[] {
	let previous: TimelineMessage | null = null;
	return entries.map((e) => {
		const derived = deriveMessage(payloadOf(e), roleHint(e));
		if (derived.message === null)
			return e.message === null ? e : { ...e, message: null };
		if (sameMessage(derived.message, previous)) return { ...e, message: null };
		previous = derived.message;
		return e.message === null ? { ...e, message: derived.message } : e;
	});
}

// The entry keeps the payload facts; rebuilding the payload lets the dedupe
// pass re-derive each line after an insertion changed the order.
function payloadOf(e: TimelineEntry): Payload {
	const p: Payload = {
		lifecycle: e.lifecycle,
		phase: e.phase,
		control: "none",
		cleanup: "not_required",
		finance: e.phase === "admitted" ? "funded" : "not_funded",
	};
	if (e.step !== undefined) p.step = e.step;
	if (e.visit !== undefined) p.visit = e.visit;
	if (e.attemptOrdinal !== undefined) p.attemptOrdinal = e.attemptOrdinal;
	if (e.node !== undefined) p.node = e.node;
	if (e.nodeState !== undefined) p.nodeState = e.nodeState;
	if (e.round !== undefined) p.round = e.round;
	if (e.verdict !== undefined) p.verdict = e.verdict;
	if (e.verdictCode !== undefined) p.verdictCode = e.verdictCode;
	if (e.outcomeCode !== undefined) p.outcomeCode = e.outcomeCode;
	if (e.failureCode !== undefined) p.failureCode = e.failureCode;
	return p;
}

let roleForDedupe: OperationRole = "generation";
const roleHint = (_e: TimelineEntry): OperationRole => roleForDedupe;

/**
 * Adds one frame: ignored when it belongs to another operation or its
 * `eventSeq` is already present; otherwise inserted in sequence order (a late
 * frame lands where it belongs) and the visible lines are recomputed.
 */
export function appendFrame(
	timeline: Timeline,
	frame: OperationEventFrame,
): Timeline {
	if (frame.operationId !== timeline.operationId) return timeline;
	if (!/^(0|[1-9][0-9]{0,19})$/.test(frame.eventSeq)) return timeline;
	if (timeline.entries.some((e) => e.eventSeq === frame.eventSeq))
		return timeline;
	const entry = entryOf(frame, timeline.role);
	const next = [...timeline.entries];
	const at = next.findIndex((e) => seq(e.eventSeq) > seq(entry.eventSeq));
	if (at === -1) next.push(entry);
	else next.splice(at, 0, entry);
	roleForDedupe = timeline.role;
	return { ...timeline, entries: dedupeMessages(next) };
}

export function appendFrames(
	timeline: Timeline,
	frames: readonly OperationEventFrame[],
): Timeline {
	return frames.reduce(appendFrame, timeline);
}

/**
 * Records that the stream resumed from `baseline` (`coveredEventSeq` of the
 * refreshed snapshot) while the events up to it are not all in memory: the
 * marker is shown; when every earlier event is present nothing is marked.
 */
export function markHistoryGap(timeline: Timeline, baseline: string): Timeline {
	const have = new Set(timeline.entries.map((e) => e.eventSeq));
	const base = seq(baseline);
	// Events are numbered from 1; a gap exists when some sequence up to the
	// baseline is absent. Scanning is bounded by the baseline's magnitude
	// relative to what is held, so a large baseline with little history marks
	// at once.
	if (base <= 0n) return timeline;
	if (BigInt(have.size) >= base) {
		let complete = true;
		for (let i = 1n; i <= base; i += 1n) {
			if (!have.has(i.toString())) {
				complete = false;
				break;
			}
		}
		if (complete) return timeline;
	}
	return { ...timeline, historyUnavailableBefore: baseline };
}

/** The latest visible line, for a headline; `null` before any. */
export function currentEntry(timeline: Timeline): TimelineEntry | null {
	for (let i = timeline.entries.length - 1; i >= 0; i -= 1) {
		const e = timeline.entries[i];
		if (e?.message) return e;
	}
	return null;
}

export interface TimelineGroup {
	/** `(step, visit, attemptOrdinal)` or `intake` for frames before the first attempt. */
	readonly key: string;
	readonly label: TimelineMessage | null;
	readonly entries: readonly TimelineEntry[];
}

/** Groups consecutive entries by attempt (§4.2): `(operationId, step, visit, attemptOrdinal)`; frames without a step join the current group. */
export function groupEntries(
	entries: readonly TimelineEntry[],
	role: OperationRole,
): TimelineGroup[] {
	const groups: {
		key: string;
		label: TimelineMessage | null;
		entries: TimelineEntry[];
	}[] = [];
	for (const e of entries) {
		const key = e.step
			? `${e.step}/${e.visit ?? "0"}/${e.attemptOrdinal ?? "1"}`
			: null;
		const current = groups[groups.length - 1];
		if (key === null) {
			if (current) current.entries.push(e);
			else groups.push({ key: "intake", label: null, entries: [e] });
			continue;
		}
		if (current?.key === key) {
			current.entries.push(e);
			continue;
		}
		groups.push({ key, label: groupLabel(e, role), entries: [e] });
	}
	return groups;
}

function groupLabel(
	e: TimelineEntry,
	role: OperationRole,
): TimelineMessage | null {
	if (role === "preparation") return { key: "progress.group.preparation" };
	switch (e.step) {
		case "codegen": {
			const visit = e.visit ?? "0";
			const ordinal = e.attemptOrdinal ?? "1";
			if (seq(ordinal) > 1n)
				return {
					key: "progress.group.rerun",
					params: { attemptOrdinal: ordinal },
				};
			if (seq(visit) > 0n)
				return { key: "progress.group.repair", params: { visit } };
			return { key: "progress.group.initial" };
		}
		case "validate":
			return { key: "progress.group.validate" };
		case "register_candidate":
			return { key: "progress.group.register" };
		default:
			return null;
	}
}

/** §4.4: a generation is complete only when the authoritative snapshot reads `succeeded` and `candidate_ready`. */
export function isCompleted(view: {
	readonly lifecycle: Lifecycle;
	readonly phase: string;
}): boolean {
	return view.lifecycle === "succeeded" && view.phase === "candidate_ready";
}
