/**
 * The timeline reducer (plan 0005 §4.1–§4.2, §4.7; verification row B2):
 * the recorded fact sequences of the Phase 2 regression (dev cluster,
 * 2026-10-23) in synthetic form, plus internal repair, outer repair, review
 * skip, duplicate and late frames, model-output errors and the reset marker.
 */
import { describe, expect, it } from "vitest";
import {
	appendFrame,
	appendFrames,
	currentEntry,
	emptyTimeline,
	errorMessage,
	groupEntries,
	isCompleted,
	markHistoryGap,
	type OperationEventFrame,
	type TimelineEntry,
} from "../agent/timeline";

type Payload = OperationEventFrame["payload"];

let counter = 0;
function frame(
	seq: number,
	payload: Partial<Payload> & {
		lifecycle?: Payload["lifecycle"];
		phase?: string;
	},
	operationId = "op_gen",
): OperationEventFrame {
	counter += 1;
	return {
		operationId,
		eventSeq: String(seq),
		transitionId: `tr_${seq}_${counter}`,
		eventType: "operation.changed",
		revision: String(seq),
		occurredAt: `2026-10-23T19:51:${String(seq % 60).padStart(2, "0")}Z`,
		payload: {
			lifecycle: "running",
			phase: "running",
			control: "none",
			cleanup: "not_required",
			finance: "funded",
			...payload,
		},
	};
}

const att = (step: string, visit = "0", attemptOrdinal = "1") => ({
	step,
	visit,
	attemptOrdinal,
});
const node = (
	n: Payload["node"],
	nodeState: Payload["nodeState"],
	round?: string,
	outcomeCode?: string,
) => ({
	...att("codegen"),
	phase: "running",
	node: n,
	nodeState,
	...(round ? { round } : {}),
	...(outcomeCode ? { outcomeCode } : {}),
});

/** The NoticeStrip run of 2026-10-23 (`20261023T195131Z`), 31 events. */
function successSequence(): OperationEventFrame[] {
	return [
		frame(1, { lifecycle: "accepted", phase: "intake", finance: "not_funded" }),
		frame(2, {
			lifecycle: "accepted",
			phase: "accepted",
			finance: "not_funded",
		}),
		frame(3, {
			lifecycle: "accepted",
			phase: "scheduled",
			finance: "not_funded",
		}),
		frame(4, { phase: "admitted", finance: "not_funded" }),
		frame(5, { phase: "admitted" }),
		frame(6, { phase: "admitted" }),
		frame(7, { ...att("codegen"), phase: "attempt_open" }),
		frame(8, { ...att("codegen"), phase: "launch_prepared" }),
		frame(9, { ...att("codegen"), phase: "running" }),
		frame(10, node("planner", "started")),
		frame(11, node("planner", "completed")),
		frame(12, node("retrieve", "started")),
		frame(
			13,
			node("retrieve", "completed", undefined, "INSUFFICIENT_EVIDENCE"),
		),
		frame(14, node("code", "started", "1")),
		frame(15, node("code", "completed", "1")),
		frame(16, node("review", "started", "1")),
		frame(17, node("review", "completed", "1")),
		frame(18, node("validate", "started", "1")),
		frame(19, node("validate", "completed", "1", "certified")),
		frame(20, {
			...att("codegen"),
			phase: "result_accepted",
			verdict: "certified",
		}),
		frame(21, { ...att("codegen"), phase: "attempt_closed" }),
		frame(22, { ...att("validate"), phase: "attempt_open" }),
		frame(23, { ...att("validate"), phase: "launch_prepared" }),
		frame(24, { ...att("validate"), phase: "running" }),
		frame(25, {
			...att("validate"),
			phase: "result_accepted",
			verdict: "certified",
		}),
		frame(26, { ...att("validate"), phase: "attempt_closed" }),
		frame(27, { ...att("register_candidate"), phase: "attempt_open" }),
		frame(28, { phase: "attempt_open" }),
		frame(29, { ...att("register_candidate"), phase: "attempt_closed" }),
		frame(30, { phase: "attempt_closed" }),
		frame(31, { lifecycle: "succeeded", phase: "candidate_ready" }),
	];
}

const visible = (entries: readonly TimelineEntry[]) =>
	entries
		.filter((e) => e.message)
		.map((e) =>
			e.message?.params
				? `${e.message.key} ${JSON.stringify(e.message.params)}`
				: (e.message?.key ?? ""),
		);

describe("timeline reducer", () => {
	it("renders the recorded success run as the seven stages in execution order, without stutter", () => {
		const t = appendFrames(
			emptyTimeline("op_gen", "generation"),
			successSequence(),
		);
		expect(t.entries).toHaveLength(31);
		expect(visible(t.entries)).toEqual([
			"progress.stage.accepted",
			"progress.stage.admitted",
			"progress.stage.schedulingJob",
			"progress.stage.jobRunning",
			"progress.stage.planning",
			"progress.stage.planningDone",
			"progress.stage.retrieving",
			"progress.stage.retrievedNone",
			"progress.stage.coding",
			"progress.stage.codingDone",
			"progress.stage.reviewing",
			"progress.stage.reviewDone",
			"progress.stage.teamChecks",
			'progress.stage.codingRoundDone {"round":"1"}',
			"progress.stage.stageAccepted",
			"progress.stage.validating",
			"progress.stage.validationPassed",
			"progress.stage.registering",
			"progress.stage.generationDone",
		]);
		expect(currentEntry(t)?.message?.key).toBe("progress.stage.generationDone");
		const groups = groupEntries(t.entries, "generation");
		expect(groups.map((g) => g.key)).toEqual([
			"intake",
			"codegen/0/1",
			"validate/0/1",
			"register_candidate/0/1",
		]);
		expect(groups[1]?.label).toEqual({ key: "progress.group.initial" });
		expect(groups[2]?.label).toEqual({ key: "progress.group.validate" });
		// Frames without a step (the candidate effect, the lease) stay in the current attempt's group.
		expect(groups[3]?.entries.map((e) => e.eventSeq)).toEqual([
			"27",
			"28",
			"29",
			"30",
			"31",
		]);
	});

	it("an internal repair shows the team's classification and the repair only when the next round starts", () => {
		const frames = [
			frame(14, node("code", "started", "1")),
			frame(15, node("code", "completed", "1")),
			frame(16, node("review", "skipped", "1")),
			frame(18, node("validate", "started", "1")),
			frame(19, node("validate", "completed", "1", "CANDIDATE_TEST_FAILED")),
			frame(20, node("code", "started", "2")),
			frame(21, node("code", "completed", "2")),
			frame(22, node("validate", "started", "2")),
			frame(23, node("validate", "completed", "2", "certified")),
		];
		const t = appendFrames(emptyTimeline("op_gen", "generation"), frames);
		expect(visible(t.entries)).toEqual([
			"progress.stage.coding",
			"progress.stage.codingDone",
			"progress.stage.reviewSkipped",
			"progress.stage.teamChecks",
			'progress.stage.internalCheckFailed {"code":"CANDIDATE_TEST_FAILED"}',
			"progress.stage.repairStarting",
			"progress.stage.codingDone",
			"progress.stage.teamChecks",
			'progress.stage.codingRoundDone {"round":"2"}',
		]);
		const repair = t.entries.find((e) => e.eventSeq === "20");
		expect(repair?.detail).toEqual({
			key: "progress.stage.internalRepair",
			params: { round: "2" },
		});
		expect(repair?.severity).toBe("warning");
		const failed = t.entries.find((e) => e.eventSeq === "19");
		expect(failed?.code).toBe("CANDIDATE_TEST_FAILED");
		expect(failed?.severity).toBe("warning");
	});

	it("an outer repair after an independent repairable verdict opens a new group named by the visit", () => {
		const frames = [
			frame(22, { ...att("validate"), phase: "attempt_open" }),
			frame(25, {
				...att("validate"),
				phase: "result_accepted",
				verdict: "repairable",
				verdictCode: "CANDIDATE_TEST_FAILED",
			}),
			frame(26, { ...att("validate"), phase: "attempt_closed" }),
			frame(27, { ...att("codegen", "1"), phase: "attempt_open" }),
			frame(28, { ...att("codegen", "1"), phase: "running" }),
			frame(29, {
				...att("codegen", "1"),
				phase: "running",
				node: "code",
				nodeState: "started",
				round: "1",
			}),
		];
		const t = appendFrames(emptyTimeline("op_gen", "generation"), frames);
		expect(visible(t.entries)).toEqual([
			"progress.stage.validating",
			'progress.stage.validationFailed {"code":"CANDIDATE_TEST_FAILED"}',
			"progress.stage.repairStarting",
			"progress.stage.jobRunning",
			"progress.stage.coding",
		]);
		expect(t.entries.find((e) => e.eventSeq === "27")?.detail).toEqual({
			key: "progress.stage.outerRepair",
			params: { visit: "1" },
		});
		const groups = groupEntries(t.entries, "generation");
		expect(groups.map((g) => g.label)).toEqual([
			{ key: "progress.group.validate" },
			{ key: "progress.group.repair", params: { visit: "1" } },
		]);
		// A rerun of the same visit (hold/resume) is a third counter.
		const rerun = appendFrame(
			t,
			frame(30, { ...att("codegen", "1", "2"), phase: "attempt_open" }),
		);
		expect(groupEntries(rerun.entries, "generation").at(-1)?.label).toEqual({
			key: "progress.group.rerun",
			params: { attemptOrdinal: "2" },
		});
	});

	it("drops duplicates, places late frames in sequence order and ignores other operations", () => {
		const base = appendFrames(emptyTimeline("op_gen", "generation"), [
			frame(10, node("planner", "started")),
			frame(12, node("retrieve", "started")),
		]);
		const dup = appendFrame(base, frame(10, node("planner", "started")));
		expect(dup.entries).toHaveLength(2);
		const late = appendFrame(dup, frame(11, node("planner", "completed")));
		expect(late.entries.map((e) => e.eventSeq)).toEqual(["10", "11", "12"]);
		expect(visible(late.entries)).toEqual([
			"progress.stage.planning",
			"progress.stage.planningDone",
			"progress.stage.retrieving",
		]);
		const other = appendFrame(
			late,
			frame(13, node("code", "started", "1"), "op_other"),
		);
		expect(other).toBe(late);
		expect(appendFrame(late, { ...frame(14, {}), eventSeq: "x" })).toBe(late);
	});

	it("a node failed by the model's own output is a localized model-output error; unknown codes are generic with the code as metadata", () => {
		const t = appendFrames(emptyTimeline("op_gen", "generation"), [
			frame(16, node("review", "started", "1")),
			frame(
				17,
				node("review", "failed", "1", "UPSTREAM_TOOL_ARGUMENTS_INVALID"),
			),
			frame(18, {
				...att("codegen"),
				phase: "result_accepted",
				verdict: "infrastructure_failed",
				verdictCode: "OBSERVER_FAILED",
			}),
			frame(19, { ...att("codegen"), phase: "attempt_closed" }),
			frame(20, {
				lifecycle: "failed",
				phase: "attempt_closed",
				failureCode: "OBSERVER_FAILED",
			}),
		]);
		const failed = t.entries.find((e) => e.eventSeq === "17");
		expect(failed?.message).toEqual({
			key: "progress.error.modelOutput",
			params: { code: "UPSTREAM_TOOL_ARGUMENTS_INVALID" },
		});
		expect(failed?.code).toBe("UPSTREAM_TOOL_ARGUMENTS_INVALID");
		expect(failed?.severity).toBe("error");
		expect(visible(t.entries)).toEqual([
			"progress.stage.reviewing",
			'progress.error.modelOutput {"code":"UPSTREAM_TOOL_ARGUMENTS_INVALID"}',
			'progress.error.generic {"code":"OBSERVER_FAILED"}',
			'progress.outcome.failed {"code":"OBSERVER_FAILED"}',
		]);
		expect(errorMessage("SOMETHING_NEW").message.key).toBe(
			"progress.error.generic",
		);
		expect(errorMessage("not a code!").code).toBe("UNKNOWN");
		expect(errorMessage(undefined).message.params).toEqual({ code: "UNKNOWN" });
	});

	it("renders the preparation stream as requirements analysis facts", () => {
		const t = appendFrames(emptyTimeline("op_prep", "preparation"), [
			frame(
				1,
				{ lifecycle: "accepted", phase: "intake", finance: "not_funded" },
				"op_prep",
			),
			frame(2, { lifecycle: "accepted", phase: "scheduled" }, "op_prep"),
			frame(3, { ...att("analysis"), phase: "attempt_open" }, "op_prep"),
			frame(4, { lifecycle: "waiting", phase: "awaiting_input" }, "op_prep"),
			frame(5, { phase: "answered" }, "op_prep"),
			frame(6, { ...att("analysis"), phase: "attempt_closed" }, "op_prep"),
			frame(7, { phase: "brief_frozen" }, "op_prep"),
			frame(8, { lifecycle: "succeeded", phase: "brief_frozen" }, "op_prep"),
		]);
		expect(visible(t.entries)).toEqual([
			"progress.stage.accepted",
			"progress.stage.analyzing",
			"progress.stage.awaitingAnswers",
			"progress.stage.analyzing",
			"progress.stage.analysisDone",
		]);
		const failed = appendFrame(
			emptyTimeline("op_prep", "preparation"),
			frame(
				9,
				{
					lifecycle: "failed",
					phase: "attempt_closed",
					failureCode: "DEADLINE_EXCEEDED",
				},
				"op_prep",
			),
		);
		expect(visible(failed.entries)).toEqual([
			'progress.outcome.preparationFailed {"code":"DEADLINE_EXCEEDED"}',
		]);
	});

	it("terminal frames: only succeeded with candidate_ready is a completion; failed, canceled and reconciling carry their codes", () => {
		expect(
			isCompleted({ lifecycle: "succeeded", phase: "candidate_ready" }),
		).toBe(true);
		expect(
			isCompleted({ lifecycle: "succeeded", phase: "attempt_closed" }),
		).toBe(false);
		expect(
			isCompleted({ lifecycle: "running", phase: "candidate_ready" }),
		).toBe(false);
		const t = appendFrames(emptyTimeline("op_gen", "generation"), [
			frame(40, { lifecycle: "canceled", phase: "attempt_closed" }),
			frame(41, {
				lifecycle: "reconciling",
				phase: "attempt_closed",
				failureCode: "EFFECT_UNCERTAIN",
			}),
			frame(42, { lifecycle: "succeeded", phase: "attempt_closed" }),
			frame(43, {
				lifecycle: "succeeded",
				phase: "candidate_ready",
				finance: "settled",
			}),
			frame(44, {
				lifecycle: "succeeded",
				phase: "candidate_ready",
				finance: "settled",
			}),
		]);
		expect(visible(t.entries)).toEqual([
			"progress.outcome.canceled",
			'progress.outcome.unresolved {"code":"EFFECT_UNCERTAIN"}',
			"progress.stage.generationDone",
		]);
	});

	it("marks missing history only when events before the reset baseline are absent", () => {
		const partial = appendFrames(emptyTimeline("op_gen", "generation"), [
			frame(10, node("planner", "started")),
			frame(11, node("planner", "completed")),
		]);
		expect(markHistoryGap(partial, "11").historyUnavailableBefore).toBe("11");
		const complete = appendFrames(emptyTimeline("op_gen", "generation"), [
			frame(1, { lifecycle: "accepted", phase: "intake" }),
			frame(2, { lifecycle: "accepted", phase: "accepted" }),
			frame(3, { phase: "admitted" }),
		]);
		expect(markHistoryGap(complete, "3").historyUnavailableBefore).toBeNull();
		expect(markHistoryGap(complete, "0").historyUnavailableBefore).toBeNull();
		expect(markHistoryGap(complete, "9").historyUnavailableBefore).toBe("9");
	});
});
