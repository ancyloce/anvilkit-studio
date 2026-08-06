/**
 * @file Sidecar read/write (PLAN-0020 CORE-P0-007; DD-0019 §24.1,
 * §7.2 invariants 1–5, 9–11; DD-DEC-003).
 *
 * Follows the verified `page-root-seo.ts` root-props projection
 * precedent: one typed accessor over `root.props.__anvilkit`, width
 * subtyping on write, and documented boundary casts — Puck's
 * `SetDataAction` is not generic over root props (DD-0019 §22.3
 * typing note).
 *
 * Inputs are never mutated. Raw invalid or unsupported-major sidecar
 * data is preserved verbatim in the read result and is never
 * replaced with an empty state (invariant 9, §25).
 */

import type { AuthoringStateV1, EditorError } from "@anvilkit/contracts/editor";
import { ANVILKIT_AUTHORING_KEY } from "@anvilkit/contracts/editor";
import {
	compactAuthoringState,
	createEmptyAuthoringState,
	detectAuthoringVersion,
	normalizeAuthoringState,
	safeParseAuthoringState,
} from "@anvilkit/schema/editor";
import type { Data } from "@puckeditor/core";
import { makeEditorError } from "./diagnostics.js";

export { createEmptyAuthoringState } from "@anvilkit/schema/editor";

/** The result of reading the authoring sidecar from Puck data. */
export interface AuthoringReadResult {
	/** The usable state (empty when the sidecar is absent or unreadable). */
	readonly state: AuthoringStateV1;
	/**
	 * True when writers must stay disabled: the sidecar failed schema
	 * validation or carries an unsupported major version (invariant 9:
	 * such data is never overwritten).
	 */
	readonly readOnly: boolean;
	/**
	 * The original sidecar value, preserved verbatim, whenever it could
	 * not be parsed as v1 state. Absent for clean reads.
	 */
	readonly raw?: unknown;
	readonly errors: readonly EditorError[];
	/** Reserved for the §26.3 migration path; always false in v1. */
	readonly migrated: boolean;
}

/**
 * Read and classify the authoring sidecar (DD-0019 §24.1 semantics):
 * missing → empty state; parse failure → read-only failure
 * preserving the raw value; unsupported major →
 * `EDITOR_CONTRACT_UNSUPPORTED_VERSION` read-only safe mode; valid →
 * normalized state.
 */
export function readAuthoringState(data: Data): AuthoringReadResult {
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
				migrated: false,
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
				migrated: false,
			};
		case "invalid":
			return invalidSidecarResult(raw, "not a structurally valid sidecar");
		case "v1": {
			const parsed = safeParseAuthoringState(raw);
			if (!parsed.success) {
				return invalidSidecarResult(
					raw,
					"sidecar failed schema validation",
					parsed.error.issues.length,
				);
			}
			return {
				state: normalizeAuthoringState(parsed.data),
				readOnly: false,
				errors: [],
				migrated: false,
			};
		}
	}
}

function invalidSidecarResult(
	raw: unknown,
	reason: string,
	issueCount?: number,
): AuthoringReadResult {
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
						reason: "invalid-sidecar",
						...(issueCount !== undefined ? { issueCount } : {}),
					},
				},
			),
		],
		migrated: false,
	};
}

/**
 * Project `next` into a fresh document carrying it under
 * `root.props.__anvilkit`, never mutating the input. Read-only
 * guarding (invariant 9) is the command port's responsibility — this
 * function is a pure projection.
 */
export function writeAuthoringState(data: Data, next: AuthoringStateV1): Data {
	return {
		...data,
		root: {
			...data.root,
			props: {
				...data.root?.props,
				[ANVILKIT_AUTHORING_KEY]: compactAuthoringState(next),
			},
		},
	} as Data;
}
