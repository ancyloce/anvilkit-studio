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
 * ## Time-boxed: this whole module closes in `p7-002` / `p7-004`
 *
 * PLAN-0026 §5 gives the canonical document **no version dimension**,
 * so the end state has exactly one shape and no guard. Two facts keep
 * this module alive until then, both verified 2026-08-10 and both
 * recorded here so the window reads as a decision rather than
 * inertia:
 *
 * 1. **The classification is marker-driven, and the marker is still
 *    load-bearing.** `migrateToPuckNativeV2` answers `already-v2`
 *    only for a document carrying `root.props.authoringSchemaVersion`
 *    (`packages/runtime/core/src/migrations/puck-native-v2.ts:305`) —
 *    a key `p1-001` removed from the contract and no canonical writer
 *    emits. A canonical snapshot therefore classifies as `migrated`
 *    and the migration stamps the marker back on. That looks like a
 *    defect to remove, and it is **not safe to remove yet**: the
 *    legacy command port routes on the same marker
 *    (`core/src/react/editor/command-port.ts:387` and `:537`) and
 *    falls through to the *sidecar write path* without it, so a
 *    document stripped of the marker would gain a sidecar the first
 *    time a legacy command committed. The marker's last reader dies
 *    with the command engine in `p3-009`; the store loses it in
 *    `p7-002`; this module is deleted in `p7-004`. Until then the
 *    stamp is the safe behaviour, and `convertedLegacyState` on the
 *    `migrated` result is how a caller tells "nothing was converted"
 *    from "a pre-carrier snapshot was".
 * 2. **Both shapes must still be readable.** Snapshots written before
 *    the carrier cutover carry the sidecar; snapshots written since
 *    carry the canonical carriers, possibly with stale `version` keys
 *    that the `looseObject` schemas preserve and nothing reads. The
 *    tolerant parse is what accepts both, and `p7-002` closes it.
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
			 * did not already carry. That is what a canonical document
			 * looks like coming out of a marker-driven classifier: the
			 * only delta is the routing marker described in the file doc.
			 * Callers use it so they do not report a canonical restore as
			 * a legacy one.
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
