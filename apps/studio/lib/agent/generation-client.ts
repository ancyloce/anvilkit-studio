/**
 * @file Starting a component generation from a frozen brief (plan 0005
 * §4.5). One user intent is one `CreateOperationRequest`: its `commandId`
 * is minted once, its `subjectDigest` is the SHA-256 of the canonical JSON
 * `{briefId, intent, preparationOperationId}`, and both are persisted with
 * the brief id (in `sessionStorage`) before the request leaves, so a lost
 * response is retried with the identical body and id and the API returns
 * the original operation. A 202 stores the `operationId` and the intent is
 * no longer pending; "Generate again" is a new intent with a new id and a
 * new digest. Locale switches, refreshes and stream reconnects never post:
 * only {@link startGeneration} does, and only when called.
 */
import type { components } from "./generated/agent";
import {
	agentPath,
	asErrorEnvelope,
	type ErrorEnvelope,
	newCommandId,
	readJson,
} from "./operation-client";

type Schemas = components["schemas"];
export type CreateOperationRequest = Schemas["CreateOperationRequest"];
type OperationView = Schemas["OperationView"];

/** The Control definition profile of a generation (`profiles.generation`). */
export const GENERATION_PROFILE_ID = "generation-v1";

/** `sessionStorage`'s shape (so tests pass a Map-backed double). */
export interface IntentStore {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface GenerationIntent {
	readonly briefId: string;
	readonly preparationOperationId: string;
	/** The ordinal of this intent for the brief ("Generate again" increments it). */
	readonly intent: number;
	readonly commandId: string;
	readonly subjectDigest: string;
	/** Set once the API accepted the intent; absent while the intent is pending. */
	readonly operationId?: string;
}

export function intentKey(briefId: string): string {
	return `anvilkit.generation.${briefId}`;
}

export function loadIntent(
	store: IntentStore,
	briefId: string,
): GenerationIntent | null {
	let raw: string | null;
	try {
		raw = store.getItem(intentKey(briefId));
	} catch {
		return null;
	}
	if (!raw) return null;
	try {
		const value = JSON.parse(raw) as Partial<GenerationIntent>;
		if (
			value.briefId !== briefId ||
			typeof value.preparationOperationId !== "string" ||
			typeof value.intent !== "number" ||
			typeof value.commandId !== "string" ||
			typeof value.subjectDigest !== "string"
		)
			return null;
		return value as GenerationIntent;
	} catch {
		return null;
	}
}

export function saveIntent(store: IntentStore, intent: GenerationIntent): void {
	try {
		store.setItem(intentKey(intent.briefId), JSON.stringify(intent));
	} catch {
		// Storage refused (quota, private mode): the intent still runs; only
		// the retry-after-reload guarantee is lost.
	}
}

export function clearIntent(store: IntentStore, briefId: string): void {
	try {
		store.removeItem(intentKey(briefId));
	} catch {
		// nothing to clear
	}
}

/**
 * The canonical subject digest of one intent: SHA-256 of the JSON object with
 * keys in lexicographic order and no whitespace.
 */
export async function canonicalSubjectDigest(input: {
	readonly briefId: string;
	readonly preparationOperationId: string;
	readonly intent: number;
}): Promise<string> {
	const canonical = JSON.stringify({
		briefId: input.briefId,
		intent: input.intent,
		preparationOperationId: input.preparationOperationId,
	});
	const bytes = new TextEncoder().encode(canonical);
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return `sha256:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** The request body of an intent: identical for every retry of the same intent. */
export function generationRequest(
	intent: GenerationIntent,
): CreateOperationRequest {
	return {
		commandId: intent.commandId,
		kind: "generation",
		subject: {
			profileId: GENERATION_PROFILE_ID,
			briefId: intent.briefId,
			subjectDigest: intent.subjectDigest,
		},
	};
}

export type StartResult =
	| {
			readonly ok: true;
			readonly operationId: string;
			readonly intent: GenerationIntent;
			/** The intent had already been accepted: nothing was posted. */
			readonly reused: boolean;
	  }
	| {
			readonly ok: false;
			readonly status: number;
			readonly error: ErrorEnvelope;
			readonly intent: GenerationIntent;
	  };

/**
 * Posts the generation of a brief, or resolves the intent already accepted
 * for it. `again` starts a new intent (new command id and digest) even when
 * one exists; without it a pending intent is retried with the identical body
 * and an accepted one is returned without a request.
 */
export async function startGeneration(input: {
	readonly store: IntentStore;
	readonly briefId: string;
	readonly preparationOperationId: string;
	readonly again?: boolean;
	readonly fetch?: typeof fetch;
	readonly signal?: AbortSignal;
}): Promise<StartResult> {
	const existing = loadIntent(input.store, input.briefId);
	let intent: GenerationIntent;
	if (existing && !input.again) {
		if (existing.operationId) {
			return {
				ok: true,
				operationId: existing.operationId,
				intent: existing,
				reused: true,
			};
		}
		intent = existing;
	} else {
		const ordinal = (existing?.intent ?? 0) + 1;
		intent = {
			briefId: input.briefId,
			preparationOperationId: input.preparationOperationId,
			intent: ordinal,
			commandId: newCommandId("gen"),
			subjectDigest: await canonicalSubjectDigest({
				briefId: input.briefId,
				preparationOperationId: input.preparationOperationId,
				intent: ordinal,
			}),
		};
		saveIntent(input.store, intent);
	}
	const doFetch = input.fetch ?? fetch;
	let response: Response;
	try {
		response = await doFetch(agentPath("operations"), {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(generationRequest(intent)),
			signal: input.signal,
		});
	} catch {
		// The outcome is unknown: the intent stays pending and the next call
		// retries the identical body and command id.
		return {
			ok: false,
			status: 0,
			intent,
			error: {
				error: {
					code: "DEPENDENCY_UNAVAILABLE",
					message:
						"The Studio server did not answer; retry to learn the outcome.",
					requestId: "studio",
					retryable: true,
				},
			},
		};
	}
	const body = await readJson(response);
	if (response.ok) {
		const view = body as OperationView;
		const accepted: GenerationIntent = {
			...intent,
			operationId: view.operationId,
		};
		saveIntent(input.store, accepted);
		return {
			ok: true,
			operationId: view.operationId,
			intent: accepted,
			reused: false,
		};
	}
	const error = asErrorEnvelope(body) ?? {
		error: {
			code: "DEPENDENCY_UNAVAILABLE",
			message: `HTTP ${response.status}`,
			requestId: "studio",
			retryable: response.status >= 500,
		},
	};
	// A decided refusal releases the identity, except an idempotency conflict:
	// a new id is never minted on the user's behalf (§4.5).
	if (!error.error.retryable && error.error.code !== "IDEMPOTENCY_CONFLICT")
		clearIntent(input.store, input.briefId);
	return { ok: false, status: response.status, error, intent };
}
