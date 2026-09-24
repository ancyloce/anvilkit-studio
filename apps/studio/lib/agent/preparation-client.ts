/**
 * @file Shared shapes and pure helpers of the Studio preparation entry point
 * (AnvilKit development plan S2, 2026-09-13). The browser talks only to the
 * Studio server routes under `/api/agent/preparations`, which forward to the
 * Agent API with the server-held platform credential; these types mirror the
 * Agent OpenAPI's `PreparationCommand`, `PreparationAnswersCommand`,
 * `PreparationDetail` and the `urn:anvilkit:preparation:v1` records the
 * detail carries. Nothing here fetches.
 */

/** `urn:anvilkit:values:v1#/$defs/artifactRef` in its public JSON form. */
export interface ArtifactRef {
	readonly kind: "evidence" | "preparation-input";
	readonly refId: string;
	readonly subjectDigest: string;
	readonly contentDigest: string;
	readonly sizeBytes: string;
	readonly objectVersion: string;
}

/** A user-selectable controlled reference (S2-T04/T05 fixture material). */
export interface ControlledReference {
	readonly id: string;
	readonly label: string;
	readonly ref: ArtifactRef;
}

const SUBJECT =
	"sha256:3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e";

/**
 * Controlled brand and asset references the user may attach. They are the
 * fixed demo materials of the preparation fixtures — frozen digests the user
 * supplies or selects, never a live brand library or asset search (those are
 * S2-T04/T05 with their Pagix capabilities); Control validates their shape and
 * the brief carries them verbatim.
 */
export const CONTROLLED_BRAND_REFS: readonly ControlledReference[] = [
	{
		id: "brand-spring-2026",
		label: "Spring 2026 brand kit (fixture)",
		ref: {
			kind: "evidence",
			refId: "brand-spring-2026",
			subjectDigest: SUBJECT,
			contentDigest:
				"sha256:7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a",
			sizeBytes: "1320",
			objectVersion: "v1",
		},
	},
];

export const CONTROLLED_ASSET_REFS: readonly ControlledReference[] = [
	{
		id: "asset-hero-spring-svg",
		label: "Spring hero illustration (fixture SVG)",
		ref: {
			kind: "evidence",
			refId: "asset-hero-spring-svg",
			subjectDigest: SUBJECT,
			contentDigest:
				"sha256:7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b7b",
			sizeBytes: "2048",
			objectVersion: "v1",
		},
	},
];

/** `urn:anvilkit:preparation:v1#/$defs/PreparationInputV1`. */
export interface PreparationInput {
	readonly schemaVersion: 1;
	readonly prompt: { readonly text: string };
	readonly brandRefs?: readonly ArtifactRef[];
	readonly assetRefs?: readonly ArtifactRef[];
}

export interface PreparationCommand {
	readonly schemaVersion: 1;
	readonly commandId: string;
	readonly intakeSource: "ui";
	readonly input: PreparationInput;
}

export interface Question {
	readonly questionId: string;
	readonly text: string;
	readonly options?: readonly string[];
	readonly materialUnknown?: string;
}

export interface QuestionSet {
	readonly schemaVersion: 1;
	readonly operationId: string;
	readonly questionSetRevision: string;
	readonly round: string;
	readonly questions: readonly Question[];
}

export interface AnswerSet {
	readonly schemaVersion: 1;
	readonly operationId: string;
	readonly questionSetRevision: string;
	readonly answers: readonly { questionId: string; answer: string }[];
}

export interface PreparationAnswersCommand {
	readonly commandId: string;
	readonly expectedOperationRevision: string;
	readonly questionSetRef: ArtifactRef;
	readonly answerSet: AnswerSet;
}

export interface Requirements {
	readonly purpose: string;
	readonly content: readonly string[];
	readonly structure: readonly string[];
	readonly interactions: readonly string[];
	readonly editableFields: readonly {
		name: string;
		kind: string;
		description?: string;
	}[];
	readonly constraints: readonly string[];
	readonly acceptancePoints: readonly string[];
	readonly materialUnknowns: readonly { key: string; question: string }[];
}

/** `urn:anvilkit:preparation:v1#/$defs/BriefV1`. */
export interface Brief {
	readonly schemaVersion: 1;
	readonly operationId: string;
	readonly briefRevision: string;
	readonly inputRef: ArtifactRef;
	readonly requirements: Requirements;
	readonly resolvedAnswers: readonly {
		questionId: string;
		key: string;
		answer: string;
	}[];
	readonly brandRefs: readonly ArtifactRef[];
	readonly assetRefs: readonly ArtifactRef[];
}

export type PreparationStage =
	| "admission_pending"
	| "queued"
	| "analyzing"
	| "awaiting_input"
	| "brief_ready"
	| "expired"
	| "failed"
	| "canceled";

export interface PreparationProjection {
	readonly round: string;
	readonly questionSetRef?: ArtifactRef;
	readonly questionSetRevision?: string;
	readonly questionSetExpiresAt?: string;
	readonly acceptedAnswerSetRef?: ArtifactRef;
	readonly briefRef?: ArtifactRef;
	readonly briefRevision?: string;
	readonly contentRejections?: string;
}

/** `GET /v1/operations/{id}/preparation` — the Agent API's `PreparationDetail`. */
export interface PreparationDetail {
	readonly operationId: string;
	readonly status:
		| "pending"
		| "running"
		| "blocked"
		| "succeeded"
		| "failed"
		| "canceled"
		| "expired";
	readonly businessStage: PreparationStage;
	readonly operationRevision: string;
	readonly preparation: PreparationProjection;
	readonly input: PreparationInput;
	readonly questionSet?: QuestionSet;
	readonly acceptedAnswerSet?: AnswerSet;
	readonly brief?: Brief;
}

/** The Agent API's `OperationAccepted`. */
export interface OperationAccepted {
	readonly operationId: string;
	readonly operationRevision: string;
	readonly acceptedAt: string;
	readonly existing: boolean;
	readonly fundingAuthority?: string;
	readonly authorizedFundingRef?: string;
}

/** The Agent API's error envelope (`urn:anvilkit:error-envelope:v1`). */
export interface ErrorEnvelope {
	readonly code: string;
	readonly message: string;
	readonly operationId?: string;
	readonly retryable: boolean;
	readonly requestId?: string;
}

/** Stages after which the task changes no more. */
export function isTerminalStage(stage: PreparationStage): boolean {
	return (
		stage === "brief_ready" ||
		stage === "expired" ||
		stage === "failed" ||
		stage === "canceled"
	);
}

/**
 * True while the posed question set still accepts an answer set: the task
 * awaits input, its clock has not run out and no answer set was accepted yet
 * (an accepted set leaves the stage at `awaiting_input` until the Workflow
 * records the next round; the projection then carries `acceptedAnswerSetRef`).
 */
export function acceptsAnswers(
	detail: PreparationDetail,
	now: Date = new Date(),
): boolean {
	const projection = detail.preparation;
	if (
		detail.businessStage !== "awaiting_input" ||
		!detail.questionSet ||
		!projection.questionSetRef ||
		!projection.questionSetExpiresAt ||
		projection.acceptedAnswerSetRef
	) {
		return false;
	}
	return new Date(projection.questionSetExpiresAt).getTime() > now.getTime();
}

/** Prompt bound of `preparation.promptMaxBytes` (UTF-8 bytes, not characters). */
export const PROMPT_MAX_BYTES = 8192;

export function promptByteLength(text: string): number {
	return new TextEncoder().encode(text).length;
}

/** Build the intake command; the caller keeps `commandId` stable across retries. */
export function buildPreparationCommand(
	commandId: string,
	prompt: string,
	brandRefs: readonly ArtifactRef[],
	assetRefs: readonly ArtifactRef[],
): PreparationCommand {
	const input: {
		schemaVersion: 1;
		prompt: { text: string };
		brandRefs?: readonly ArtifactRef[];
		assetRefs?: readonly ArtifactRef[];
	} = { schemaVersion: 1, prompt: { text: prompt.trim() } };
	if (brandRefs.length > 0) input.brandRefs = brandRefs;
	if (assetRefs.length > 0) input.assetRefs = assetRefs;
	return { schemaVersion: 1, commandId, intakeSource: "ui", input };
}

/**
 * Build the answers command for the question set the detail currently poses:
 * every posed question answered once, in question order, bound to the exact
 * question-set reference and the operation revision the detail was read at,
 * so a superseded question set or revision is refused by Control rather than
 * silently applied. Returns `null` while any answer is blank.
 */
export function buildAnswersCommand(
	commandId: string,
	detail: PreparationDetail,
	answers: Readonly<Record<string, string>>,
): PreparationAnswersCommand | null {
	const questionSet = detail.questionSet;
	const questionSetRef = detail.preparation.questionSetRef;
	if (!questionSet || !questionSetRef) return null;
	const collected: { questionId: string; answer: string }[] = [];
	for (const question of questionSet.questions) {
		const answer = (answers[question.questionId] ?? "").trim();
		if (answer === "") return null;
		collected.push({ questionId: question.questionId, answer });
	}
	return {
		commandId,
		expectedOperationRevision: detail.operationRevision,
		questionSetRef,
		answerSet: {
			schemaVersion: 1,
			operationId: detail.operationId,
			questionSetRevision: questionSet.questionSetRevision,
			answers: collected,
		},
	};
}

/** Poll cadence: quick while the task moves, nothing once it is terminal. */
export function nextPollDelayMs(
	detail: PreparationDetail | null,
): number | null {
	if (!detail) return 2000;
	if (isTerminalStage(detail.businessStage)) return null;
	return detail.businessStage === "awaiting_input" ? 5000 : 2000;
}

/** Narrow an unknown JSON body to the error envelope, if it is one. */
export function asErrorEnvelope(body: unknown): ErrorEnvelope | null {
	if (typeof body !== "object" || body === null) return null;
	const candidate = body as { code?: unknown; message?: unknown };
	if (
		typeof candidate.code !== "string" ||
		typeof candidate.message !== "string"
	) {
		return null;
	}
	return body as ErrorEnvelope;
}
