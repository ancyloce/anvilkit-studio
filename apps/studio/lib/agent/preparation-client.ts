/**
 * @file Pure helpers of the Studio preparation entry point (P20 on the V4
 * Agent API). A prompt and an answer are uploaded by the Studio server as
 * `prompt` and `answer` artifacts (text/plain) and bound to the command by
 * their finalized transfer and digest; the durable task is an ordinary
 * `OperationView` whose `clarification` carries the open question set.
 * Nothing here fetches.
 */
import type { components } from "./generated/agent";
import type { OperationView } from "./operation-client";

type Schemas = components["schemas"];

export type Clarification = Schemas["Clarification"];
export type SourceReference = Schemas["SourceReference"];
export type AnswerReceipt = Schemas["AnswerReceipt"];

/** The body the Studio route `POST /api/agent/preparations` accepts. */
export interface PreparationRequest {
	readonly commandId: string;
	readonly prompt: string;
	readonly brandReferences?: readonly SourceReference[];
	readonly assetReferences?: readonly SourceReference[];
}

/** The body the Studio route `POST /api/agent/preparations/{id}/answers` accepts. */
export interface AnswerRequest {
	readonly commandId: string;
	readonly questionSetId: string;
	readonly questionSetRevision: string;
	readonly answer: string;
}

/** Prompt bound (UTF-8 bytes, not characters) of the development preparation profile. */
export const PROMPT_MAX_BYTES = 8192;
export const ANSWER_MAX_BYTES = 8192;

export function byteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

/**
 * True while the posed question set accepts an answer: the operation waits,
 * carries a clarification and the round has not run out. Control decides; a
 * superseded revision comes back as REVISION_CONFLICT.
 */
export function acceptsAnswers(
	view: OperationView,
	now: Date = new Date(),
): boolean {
	const c = view.clarification;
	if (view.lifecycle !== "waiting" || !c) return false;
	return new Date(c.expiresAt).getTime() > now.getTime();
}

/**
 * Formats the answers to the posed questions as the one answer text: one
 * line per question in question order. Returns `null` while any answer is
 * blank.
 */
export function formatAnswer(
	clarification: Clarification,
	answers: Readonly<Record<string, string>>,
): string | null {
	const lines: string[] = [];
	for (const q of clarification.questions) {
		const a = (answers[q.questionId] ?? "").trim();
		if (a === "") return null;
		lines.push(`- ${q.questionId}: ${a.replace(/\r?\n/g, " ")}`);
	}
	return `${lines.join("\n")}\n`;
}

/** Parses "sourceId@revision" references typed by the user; `null` when one is malformed. */
export function parseReferences(text: string): SourceReference[] | null {
	const out: SourceReference[] = [];
	for (const token of text.split(/[\s,]+/).filter(Boolean)) {
		const m = /^([A-Za-z0-9][A-Za-z0-9._:-]{0,127})@(0|[1-9][0-9]{0,19})$/.exec(
			token,
		);
		if (!m?.[1] || !m[2]) return null;
		out.push({ sourceId: m[1], revision: m[2] });
	}
	return out;
}
