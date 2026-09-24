import { describe, expect, it } from "vitest";
import {
	acceptsAnswers,
	asErrorEnvelope,
	buildAnswersCommand,
	buildPreparationCommand,
	CONTROLLED_ASSET_REFS,
	CONTROLLED_BRAND_REFS,
	isTerminalStage,
	nextPollDelayMs,
	type PreparationDetail,
	promptByteLength,
} from "../agent/preparation-client";

const questionSetRef = {
	kind: "evidence" as const,
	refId: "question-set-1",
	subjectDigest:
		"sha256:3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e",
	contentDigest:
		"sha256:7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c",
	sizeBytes: "612",
	objectVersion: "v1",
};

function awaiting(
	overrides: Partial<PreparationDetail> = {},
): PreparationDetail {
	return {
		operationId: "op-prep-1",
		status: "pending",
		businessStage: "awaiting_input",
		operationRevision: "3",
		preparation: {
			round: "1",
			questionSetRef,
			questionSetRevision: "1",
			questionSetExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
		},
		input: { schemaVersion: 1, prompt: { text: "A section" } },
		questionSet: {
			schemaVersion: 1,
			operationId: "op-prep-1",
			questionSetRevision: "1",
			round: "1",
			questions: [
				{
					questionId: "q-1-cta",
					text: "CTA?",
					options: ["Yes", "No call to action"],
				},
				{ questionId: "q-1-image", text: "Image?" },
			],
		},
		...overrides,
	};
}

const brandRef = CONTROLLED_BRAND_REFS[0]?.ref;
const assetRef = CONTROLLED_ASSET_REFS[0]?.ref;
if (!brandRef || !assetRef)
	throw new Error("controlled references are fixtures");

describe("preparation client helpers", () => {
	it("builds the intake command with only the selected controlled references", () => {
		const command = buildPreparationCommand(
			"cmd-1",
			"  A launch hero.  ",
			[brandRef],
			[],
		);
		expect(command).toEqual({
			schemaVersion: 1,
			commandId: "cmd-1",
			intakeSource: "ui",
			input: {
				schemaVersion: 1,
				prompt: { text: "A launch hero." },
				brandRefs: [brandRef],
			},
		});
		expect("assetRefs" in command.input).toBe(false);
		expect(assetRef.kind).toBe("evidence");
	});

	it("counts the prompt bound in UTF-8 bytes", () => {
		expect(promptByteLength("abc")).toBe(3);
		expect(promptByteLength("日本")).toBe(6);
	});

	it("binds answers to the posed question set and the read revision, every question once", () => {
		const detail = awaiting();
		expect(
			buildAnswersCommand("cmd-a", detail, { "q-1-cta": "Yes" }),
		).toBeNull();
		const command = buildAnswersCommand("cmd-a", detail, {
			"q-1-image": " Imageless result ",
			"q-1-cta": "Yes",
			"q-unknown": "ignored",
		});
		expect(command).toEqual({
			commandId: "cmd-a",
			expectedOperationRevision: "3",
			questionSetRef,
			answerSet: {
				schemaVersion: 1,
				operationId: "op-prep-1",
				questionSetRevision: "1",
				answers: [
					{ questionId: "q-1-cta", answer: "Yes" },
					{ questionId: "q-1-image", answer: "Imageless result" },
				],
			},
		});
	});

	it("accepts answers only while the posed set is open", () => {
		expect(acceptsAnswers(awaiting())).toBe(true);
		expect(
			acceptsAnswers(
				awaiting({
					preparation: {
						...awaiting().preparation,
						acceptedAnswerSetRef: questionSetRef,
					},
				}),
			),
		).toBe(false);
		expect(
			acceptsAnswers(
				awaiting({
					preparation: {
						...awaiting().preparation,
						questionSetExpiresAt: new Date(Date.now() - 1000).toISOString(),
					},
				}),
			),
		).toBe(false);
		expect(
			acceptsAnswers(
				awaiting({ businessStage: "brief_ready", status: "succeeded" }),
			),
		).toBe(false);
		expect(acceptsAnswers(awaiting({ questionSet: undefined }))).toBe(false);
	});

	it("stops polling at a terminal stage and slows down while waiting for input", () => {
		expect(nextPollDelayMs(null)).toBe(2000);
		expect(nextPollDelayMs(awaiting())).toBe(5000);
		expect(
			nextPollDelayMs(
				awaiting({ businessStage: "analyzing", status: "running" }),
			),
		).toBe(2000);
		expect(
			nextPollDelayMs(
				awaiting({ businessStage: "brief_ready", status: "succeeded" }),
			),
		).toBeNull();
		expect(isTerminalStage("canceled")).toBe(true);
		expect(isTerminalStage("awaiting_input")).toBe(false);
	});

	it("recognises the error envelope and nothing else", () => {
		expect(
			asErrorEnvelope({
				code: "REVISION_CONFLICT",
				message: "stale",
				retryable: false,
			})?.code,
		).toBe("REVISION_CONFLICT");
		expect(asErrorEnvelope({ operationId: "op" })).toBeNull();
		expect(asErrorEnvelope(null)).toBeNull();
	});
});
