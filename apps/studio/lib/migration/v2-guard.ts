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
	  }
	| {
			readonly kind: "blocked";
			readonly diagnostics: readonly MigrationDiagnostic[];
	  };

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
		return {
			kind: "migrated",
			data: result.data,
			diagnostics: result.diagnostics,
		};
	}
	return { kind: "blocked", diagnostics: result.diagnostics };
}
