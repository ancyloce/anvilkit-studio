/**
 * @file Frozen `EditorByteLimits` defaults and the tighten-only host
 * override clamp (PLAN-0020 CORE-P0-014; DD-0019 §7.3; decision
 * item 8).
 *
 * Numbers are **measured, not invented** (§7.3 rule). Evidence —
 * `scripts/bench-editor-limits.mjs` against the `testing/editor`
 * max-limit fixtures, 2026-07-23:
 *
 * - canonical sidecar at every §7.3 count limit: 3,852,100 B;
 * - heavy-but-typical document (500 nodes, 200 tokens, 50 styles,
 *   50 definitions, 100 interactions): 371,694 B;
 * - worst-case 200-command batch payload: 39,249 B.
 *
 * Frozen defaults: warn at 2 MiB (≈5.6× heavy-typical — early,
 * actionable signal); hard-cap at 8 MiB (≈2.2× the count-limit
 * ceiling — real props are fatter than generated fixtures);
 * per-definition 256 KiB; rich text 1 MiB (aligned with the §17
 * 1 MiB paste block); command 256 KiB (≈6.7× the measured worst
 * batch). Exceeding warn surfaces a persistent diagnostic; exceeding
 * a hard cap rejects the write with `EDITOR_LIMIT_EXCEEDED`.
 */

import type { EditorByteLimits, EditorError } from "@anvilkit/contracts/editor";
import { makeEditorError } from "./diagnostics.js";

/** The frozen byte-limit defaults (measured 2026-07-23; see @file). */
export const EDITOR_BYTE_LIMIT_DEFAULTS: EditorByteLimits = {
	sidecarWarnBytes: 2_097_152,
	sidecarMaxBytes: 8_388_608,
	componentDefinitionMaxBytes: 262_144,
	richTextValueMaxBytes: 1_048_576,
	commandMaxBytes: 262_144,
};

/** The result of resolving host byte-limit overrides. */
export interface ResolvedByteLimits {
	readonly limits: EditorByteLimits;
	readonly errors: readonly EditorError[];
}

/**
 * Resolve `EditorPolicies.byteLimits` against the frozen defaults.
 * Overrides MAY only tighten (§7.3): a value above the frozen cap is
 * **rejected with a diagnostic** and the default is kept — never
 * silently clamped, never applied (decision item 8, frozen here).
 * Non-positive values are rejected the same way.
 */
export function resolveByteLimits(
	overrides?: Partial<EditorByteLimits>,
): ResolvedByteLimits {
	if (overrides === undefined) {
		return { limits: EDITOR_BYTE_LIMIT_DEFAULTS, errors: [] };
	}
	const errors: EditorError[] = [];
	const limits: Record<keyof EditorByteLimits, number> = {
		...EDITOR_BYTE_LIMIT_DEFAULTS,
	};
	for (const key of Object.keys(
		EDITOR_BYTE_LIMIT_DEFAULTS,
	) as (keyof EditorByteLimits)[]) {
		const override = overrides[key];
		if (override === undefined) {
			continue;
		}
		if (!Number.isFinite(override) || override <= 0) {
			errors.push(
				makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`byte-limit override "${key}" must be a positive number`,
					{
						severity: "warning",
						details: { key, override, kept: EDITOR_BYTE_LIMIT_DEFAULTS[key] },
					},
				),
			);
			continue;
		}
		if (override > EDITOR_BYTE_LIMIT_DEFAULTS[key]) {
			errors.push(
				makeEditorError(
					"EDITOR_LIMIT_EXCEEDED",
					`byte-limit override "${key}" (${override}) is looser than the frozen default (${EDITOR_BYTE_LIMIT_DEFAULTS[key]}) — hosts may only tighten`,
					{
						severity: "warning",
						details: { key, override, kept: EDITOR_BYTE_LIMIT_DEFAULTS[key] },
					},
				),
			);
			continue;
		}
		limits[key] = override;
	}
	return { limits, errors };
}
