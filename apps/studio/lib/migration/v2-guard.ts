/**
 * @file P5-06 — the v2 editor's document guard (PLAN-0025 §10.4).
 *
 * After the P5-05 cutover the store is 100% v2, and the editor's own
 * page map is seeded v2-native — so the realistic legacy ingress into
 * the v2 editor is a document that arrives from OUTSIDE the store:
 * today that is a version-history restore of a v1-era snapshot
 * (localStorage survives the migration), plus any future import path.
 * Every such document funnels through this guard:
 *
 * - already-v2 → passes through untouched;
 * - legacy but migratable → migrated ON READ, in memory only
 *   (§10.4: "a legacy document may be migrated on read"); the editor
 *   then holds v2 state, so a later save writes v2 — the sidecar form
 *   is NEVER written back;
 * - blocked → refused: the caller must not hand the document to the
 *   editor (§10.4 step 4 — failed records cannot enter the v2
 *   editor).
 *
 * ## `p7-002` closed the version-marker tolerance; `p7-004` deletes
 * this module
 *
 * PLAN-0026 §5 gives the canonical document **no version dimension**,
 * so the end state has exactly one shape and no guard. Both of the
 * facts that kept a *version tolerance* here are now settled:
 *
 * 1. **Classification is no longer marker-driven.** Until `p7-002`,
 *    `migrateToPuckNativeV2` answered `already-v2` only for a document
 *    carrying `root.props.authoringSchemaVersion`, so a canonical
 *    snapshot classified as `migrated` and the migration stamped the
 *    marker back on. That was safe only because the legacy command
 *    port routed on the same marker and fell through to the sidecar
 *    write path without it. `p3-009` deleted the port; `p7-002`
 *    deleted the stamp and moved the classification onto the fact that
 *    decides it — **is there a `__anvilkit` sidecar to convert?** A
 *    canonical document now returns `already-v2` and passes through by
 *    reference. `convertedLegacyState` consequently means what it
 *    says: it is `true` only when a pre-carrier snapshot was actually
 *    converted.
 * 2. **There is one document shape, and it has no version key.**
 *    `p7-002`'s finalization pass runs inside the migration, so a
 *    snapshot that still carried a stale `version`, an
 *    `authoringSchemaVersion` or a `__anvilkitInstance` prop comes back
 *    stripped rather than admitted as a second shape.
 *
 * What survives here is **not** a version tolerance. It is a
 * *structural* one: a snapshot written before the carrier cutover
 * still holds a `__anvilkit` sidecar, and converting it on read is the
 * only reason this module exists. That form dies when `p7-004` runs
 * the migration against production and deletes the migration layer,
 * this module included.
 */

import {
	type MigrationDiagnostic,
	migrateToPuckNativeV2,
} from "@anvilkit/core/editor";
import type { Config, Data } from "@puckeditor/core";

export type V2GuardResult =
	| { readonly kind: "ok"; readonly data: Data }
	| {
			readonly kind: "migrated";
			readonly data: Data;
			readonly diagnostics: readonly MigrationDiagnostic[];
			/**
			 * False when the guard converted **nothing** — no node state,
			 * no orphan, no diagnostic and no root collection the input
			 * did not already carry.
			 *
			 * Since `p7-002` a fully canonical document takes the `"ok"`
			 * arm instead, so the remaining way to reach `"migrated"` with
			 * this `false` is a document whose only delta was a version
			 * marker the finalization pass stripped. Callers use it so they
			 * do not report that as a legacy conversion.
			 */
			readonly convertedLegacyState: boolean;
	  }
	| {
			readonly kind: "blocked";
			readonly diagnostics: readonly MigrationDiagnostic[];
	  };

/** Root props as an untyped bag — `Data["root"]["props"]` is generic. */
function rootPropsOf(data: Data): Record<string, unknown> {
	return (data.root?.props ?? {}) as Record<string, unknown>;
}

/** Admit, migrate-on-read, or refuse a document for the v2 editor. */
export function guardDocumentForV2Editor(
	data: Data,
	config: Config,
): V2GuardResult {
	const result = migrateToPuckNativeV2(data, config);
	if (result.status === "already-v2") {
		return { kind: "ok", data };
	}
	if (result.status === "migrated" && result.data !== undefined) {
		const before = rootPropsOf(data);
		const after = rootPropsOf(result.data);
		const gainedCollection =
			(after.designSystem !== undefined && before.designSystem === undefined) ||
			(after.componentLibrary !== undefined &&
				before.componentLibrary === undefined);
		return {
			kind: "migrated",
			data: result.data,
			diagnostics: result.diagnostics,
			convertedLegacyState:
				result.report.migratedNodes > 0 ||
				result.report.orphanNodeStates.length > 0 ||
				result.diagnostics.length > 0 ||
				gainedCollection,
		};
	}
	return { kind: "blocked", diagnostics: result.diagnostics };
}
