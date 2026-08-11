/**
 * @file The last reader of the `__anvilkit` sidecar (`p3-009`).
 *
 * `editor/read-write.ts` was the sanctioned sidecar accessor and is
 * deleted with the rest of the engine. Exactly one consumer outlives
 * it: the v1→v2 document migration, whose entire job is to read a
 * legacy sidecar and write the canonical carriers. It therefore keeps
 * a private, read-only copy of that accessor here — private because
 * nothing else may reach for it, and read-only because the sidecar is
 * never written again by anything.
 *
 * `p7-004` deletes this module together with the migration itself.
 *
 * ### Why the schema cluster survives with it
 *
 * `p1-006`'s consumer audit predicted that deleting `read-write.ts`
 * would free `@anvilkit/schema/editor`'s `envelope.ts` and
 * `compact.ts`. It does not: this module is a second production
 * consumer of both (`detectAuthoringVersion` for the invariant-9
 * unsupported-major guard, `normalizeAuthoringState` for canonical
 * ordering), and `compact.ts` is in any case still imported by
 * `canonical-serialize.ts`, which `p8-006` owns. All four stay.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import {
	createEmptyAuthoringState,
	detectAuthoringVersion,
	normalizeAuthoringState,
	safeParseAuthoringState,
} from "@anvilkit/schema/editor";
import type { Data } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";

/**
 * The root-props key that carried the authoring sidecar. Never
 * written by this build — only detected, read, and stripped.
 */
export const ANVILKIT_AUTHORING_KEY = "__anvilkit" as const;

/**
 * The legacy sidecar shape.
 *
 * Derived from the schema factory rather than imported by name:
 * `@anvilkit/schema/editor` exports `createEmptyAuthoringState` but
 * not the `AuthoringStateV1` type, and re-declaring the interface here
 * would be a third structural mirror of a shape scheduled for
 * deletion.
 */
export type LegacyAuthoringState = ReturnType<
	typeof createEmptyAuthoringState
>;

/** The result of reading the authoring sidecar from Puck data. */
export interface LegacySidecarRead {
	/** The usable state (empty when the sidecar is absent or unreadable). */
	readonly state: LegacyAuthoringState;
	/**
	 * True when the sidecar failed schema validation or carries an
	 * unsupported major version. DD-0019 invariant 9: such data is never
	 * overwritten, so the migration refuses rather than proceeding.
	 */
	readonly readOnly: boolean;
	/** The original value, preserved verbatim, when it could not be parsed. */
	readonly raw?: unknown;
	readonly errors: readonly EditorError[];
}

/**
 * Read and classify the authoring sidecar (DD-0019 §24.1 semantics):
 * missing → empty state; parse failure → read-only failure preserving
 * the raw value; unsupported major →
 * `EDITOR_CONTRACT_UNSUPPORTED_VERSION` read-only; valid → normalized
 * state. Never mutates its input.
 */
export function readLegacySidecar(data: Data): LegacySidecarRead {
	const raw = (data.root?.props as Record<string, unknown> | undefined)?.[
		ANVILKIT_AUTHORING_KEY
	];
	const detection = detectAuthoringVersion(raw);
	switch (detection.kind) {
		case "absent":
			return {
				state: createEmptyAuthoringState(),
				readOnly: false,
				errors: [],
			};
		case "unsupported-major":
			return {
				state: createEmptyAuthoringState(),
				readOnly: true,
				raw,
				errors: [
					makeEditorError(
						"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
						`authoring sidecar version "${detection.version}" is not supported by this build`,
						{
							recoverable: false,
							details: {
								reason: "unsupported-major",
								version: detection.version,
							},
						},
					),
				],
			};
		case "invalid":
			return unreadable(raw, "not a structurally valid sidecar");
		case "v1": {
			const parsed = safeParseAuthoringState(raw);
			if (!parsed.success) {
				return unreadable(
					raw,
					"sidecar failed schema validation",
					parsed.error.issues.length,
				);
			}
			return {
				state: normalizeAuthoringState(parsed.data),
				readOnly: false,
				errors: [],
			};
		}
	}
}

function unreadable(
	raw: unknown,
	reason: string,
	issueCount?: number,
): LegacySidecarRead {
	return {
		state: createEmptyAuthoringState(),
		readOnly: true,
		raw,
		errors: [
			makeEditorError(
				"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
				`authoring sidecar is unreadable: ${reason}`,
				{
					recoverable: false,
					details: {
						reason: "invalid",
						...(issueCount === undefined ? {} : { issueCount }),
					},
				},
			),
		],
	};
}
