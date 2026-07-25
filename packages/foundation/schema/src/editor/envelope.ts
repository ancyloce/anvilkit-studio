/**
 * @file Authoring sidecar envelope schema and version detection
 * (PLAN-0020 CORE-P0-005A; DD-0019 §7.1–§7.2, §26.3).
 *
 * The envelope schema validates the outer `AuthoringStateV1` shape —
 * version, revision, and the collection slots — with collections as
 * loose containers. Deep per-family validation composes in
 * `authoring-state.ts` (CORE-P0-005F); this split lets readers
 * detect and classify a sidecar cheaply before full validation.
 */

import { z } from "zod";
import { NonNegativeIntegerSchema } from "./primitives.js";

/**
 * Shallow envelope: exact major version, non-negative revision, and
 * the eight collection slots. Unknown keys are preserved
 * (`looseObject`), including at the envelope level.
 */
export const AuthoringEnvelopeSchema = z.looseObject({
	version: z.literal("1"),
	revision: NonNegativeIntegerSchema,
	breakpoints: z.array(z.unknown()),
	nodes: z.record(z.string(), z.unknown()),
	tokens: z.record(z.string(), z.unknown()),
	tokenModes: z.record(z.string(), z.unknown()),
	styleDefinitions: z.record(z.string(), z.unknown()),
	componentDefinitions: z.record(z.string(), z.unknown()),
	interactions: z.record(z.string(), z.unknown()),
	bindings: z.record(z.string(), z.unknown()),
});

/**
 * Classification of a candidate sidecar value before deep parsing
 * (DD-0019 §24.1 read semantics):
 *
 * - `"absent"` — no sidecar (`undefined`/`null`): readers substitute
 *   an empty state.
 * - `"v1"` — the supported major version; deep validation applies.
 * - `"unsupported-major"` — a structurally plausible sidecar whose
 *   `version` major is not `"1"`: read-only safe mode,
 *   `EDITOR_CONTRACT_UNSUPPORTED_VERSION`, raw value preserved
 *   verbatim and never overwritten (invariant 9).
 * - `"invalid"` — not a plausible sidecar object: read-only failure
 *   preserving the raw value.
 */
export type AuthoringVersionDetection =
	| { readonly kind: "absent" }
	| { readonly kind: "v1" }
	| { readonly kind: "unsupported-major"; readonly version: string }
	| { readonly kind: "invalid" };

/**
 * Classify a candidate sidecar value without deep parsing. Never
 * throws.
 */
export function detectAuthoringVersion(
	value: unknown,
): AuthoringVersionDetection {
	if (value === undefined || value === null) {
		return { kind: "absent" };
	}
	if (typeof value !== "object" || Array.isArray(value)) {
		return { kind: "invalid" };
	}
	const version = (value as { readonly version?: unknown }).version;
	if (typeof version !== "string" || version.length === 0) {
		return { kind: "invalid" };
	}
	if (version === "1" || version.startsWith("1.")) {
		return { kind: "v1" };
	}
	return { kind: "unsupported-major", version };
}

/**
 * Safe-parse the shallow envelope. Callers classify with
 * {@link detectAuthoringVersion} first; an `"unsupported-major"`
 * value must not be handed to this schema (its `version` literal
 * would fail as a plain shape error rather than a version
 * diagnostic).
 */
export function safeParseAuthoringEnvelope(value: unknown) {
	return AuthoringEnvelopeSchema.safeParse(value);
}
