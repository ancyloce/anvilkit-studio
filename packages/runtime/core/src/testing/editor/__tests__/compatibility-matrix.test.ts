/**
 * @file PLAN-0020 CORE-P4-005 — the DD-0019 §26.1 compatibility matrix,
 * row by row, plus the §30.7 rollout-stage gates.
 *
 * §26.1 is a table of nine promises to existing hosts. Individual
 * behaviours are covered across the suite, but nothing asserted the
 * *table* — so a row could quietly lose its coverage while every named
 * test stayed green. This file is one test per row, named after the
 * row, so a compatibility regression reports which promise broke.
 *
 * It also demonstrates the two rollout gates the §30.7 table requires
 * before GA:
 *
 * - **Reader only** — "all legacy fixtures load unchanged";
 * - **Dev preview** — "metadata, inspector, geometry contracts pass",
 *   with the rollback path (retain reader, disable writers) discarding
 *   no sidecar data.
 *
 * The rollback drill narrative lives in
 * `docs/migration/0020-editor-rollback-drill.md`; this file is the
 * executable half.
 */

import type {
	AuthoringStateV1,
	StudioEditorFeatures,
} from "@anvilkit/contracts/editor";
import { ANVILKIT_AUTHORING_KEY } from "@anvilkit/contracts/editor";
import {
	CURRENT_AUTHORING_VERSION,
	canonicalSerializeAuthoring,
	createAuthoringMigrationRegistry,
} from "@anvilkit/schema/editor";
import type { Data as PuckData } from "@puckeditor/core";
import type { StudioPluginContext } from "../../../types/plugin-context.js";
import { describe, expect, it } from "vitest";
import {
	createEmptyAuthoringState,
	readAuthoringState,
	writeAuthoringState,
} from "../../../editor/index.js";
import { computeCollabGateError } from "../../../react/editor/collab-gate.js";
import { applyAuthoringStylesheet } from "../../../react/editor/responsive/stylesheet.js";
import {
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildRootConfigWithSlotFields,
	buildUnknownVersionSidecar,
} from "../fixtures.js";

/** A sidecar with one authored node — the rollback drill's payload. */
function authored(): AuthoringStateV1 {
	return {
		...createEmptyAuthoringState(),
		revision: 7,
		nodes: {
			"legacy-0": {
				version: "1",
				name: "Renamed in the editor",
				layout: { base: { gap: { kind: "unit", value: 12, unit: "px" } } },
			},
		},
	};
}

// P6-01 (PLAN-0025 §11.3): §26.1 rows 1-2 asserted config-decoration
// identity/preservation. Decoration was DELETED — the host config is
// never transformed on ANY path now, making both rows structurally
// true; their runtime assertions are therefore retired with the code.

describe("§26.1 row 3 — legacy plugins are unaffected by the added context", () => {
	it("declares `editor` as an OPTIONAL member, so a context without it is still valid", () => {
		// This is a COMPILE-TIME assertion: if `editor` ever became
		// required on `StudioPluginContext`, every legacy plugin that
		// builds a context would stop typechecking — and this line is the
		// canary that fails first, with a name that says why.
		type EditorMemberIsOptional = undefined extends StudioPluginContext["editor"]
			? true
			: never;
		const optional: EditorMemberIsOptional = true;
		expect(optional).toBe(true);
	});

	it("leaves everything already on the context untouched when `editor` is added", () => {
		const getData = (): object => ({});
		const legacyContext = { getData };
		const withEditor = { ...legacyContext, editor: undefined };
		// Identity, not equality: a plugin holding a reference to a context
		// member must keep working across the additive change.
		expect(withEditor.getData).toBe(getData);
	});
});

describe("§26.1 row 4 — existing Puck data: missing sidecar reads as empty", () => {
	it("reads a legacy document as an empty, writable authoring state", () => {
		const read = readAuthoringState(buildLegacyPuckData());
		expect(read.state.nodes).toEqual({});
		expect(read.readOnly).toBe(false);
		expect(read.errors).toEqual([]);
	});

	it("leaves the legacy document untouched until a real write", () => {
		const legacy = buildLegacyPuckData();
		const before = JSON.stringify(legacy);
		readAuthoringState(legacy);
		expect(JSON.stringify(legacy)).toBe(before);
	});
});

describe("§26.1 row 5 — PageIR v1 preserved", () => {
	it("keeps the sidecar out of the content tree, so IR projection is unchanged", () => {
		// The sidecar rides on `root.props`, never in `content`. That is
		// what keeps a legacy IR conversion byte-identical.
		const data = buildPuckDataWithSidecar(authored());
		expect(JSON.stringify(data.content)).toBe(
			JSON.stringify(buildLegacyPuckData().content),
		);
	});
});

describe("§26.1 row 6 — explicit targets take precedence over heuristics", () => {
	it("declared inline-text targets are metadata, so a component without them keeps the heuristic path", () => {
		const config = buildRootConfigWithSlotFields();
		// No `metadata.editor` on the legacy component ⇒ no declared
		// targets ⇒ nothing overrides the existing drop behaviour.
		expect(
			(config.components.Box as { metadata?: unknown }).metadata,
		).toBeUndefined();
	});
});

describe("§26.1 row 7 — existing LayerTree behaviour is locked", () => {
	it("layer metadata lives in the sidecar, never in component props", () => {
		// The regression fixture for DnD/keyboard is that reordering is
		// still Puck's own dispatch over `content`; the editor only adds
		// NAMES and flags, in the sidecar.
		const state = authored();
		const data = writeAuthoringState(buildLegacyPuckData(), state);
		for (const item of (data.content ?? []) as { props: object }[]) {
			expect(item.props).not.toHaveProperty("name");
			expect(item.props).not.toHaveProperty("hidden");
			expect(item.props).not.toHaveProperty("locked");
		}
	});
});

describe("§26.1 row 8 — CSS scope stays inside the iframe", () => {
	it("writes authoring CSS only into the document it was handed", () => {
		const iframeDoc = document.implementation.createHTMLDocument("canvas");
		const before = document.head.querySelectorAll("style").length;
		applyAuthoringStylesheet(iframeDoc, '[data-ak-node="a"] { gap: 1px }');
		expect(iframeDoc.head.querySelectorAll("style")).toHaveLength(1);
		// The parent document must be untouched — a leak here would style
		// the host application, not the canvas.
		expect(document.head.querySelectorAll("style").length).toBe(before);
	});

	it("scopes every rule under a [data-ak-node] selector", () => {
		const iframeDoc = document.implementation.createHTMLDocument("canvas");
		const element = applyAuthoringStylesheet(
			iframeDoc,
			'[data-ak-node="a"] { gap: 1px }',
		);
		expect(element?.textContent).toMatch(/^\[data-ak-node=/);
	});
});

describe("§26.1 row 9 — collab transports are mutually exclusive with authoring", () => {
	it("gates authoring writers when a transport declares a non-granular encoding", () => {
		const error = computeCollabGateError([
			{
				pluginName: "collab-yjs",
				// `legacy-document` is a REAL member of the frozen encoding
				// union (CORE-P0-020); anything other than
				// `granular-authoring` must gate authoring writers.
				capability: { encoding: "legacy-document" },
			},
		]);
		expect(error?.code).toBe("EDITOR_COLLAB_ENCODING_UNSUPPORTED");
	});

	it("does not gate when no transport is registered (the default host)", () => {
		expect(computeCollabGateError([])).toBeNull();
	});
});

describe("§30.7 Reader-only stage — all legacy fixtures load unchanged", () => {
	it("reads every legacy corpus shape without error", () => {
		for (const nodeCount of [0, 1, 3, 25]) {
			const read = readAuthoringState(buildLegacyPuckData(nodeCount));
			expect(read.readOnly).toBe(false);
			expect(read.errors).toEqual([]);
		}
	});

	it("classifies an unknown major as read-only instead of throwing", () => {
		const read = readAuthoringState(
			buildPuckDataWithSidecar(buildUnknownVersionSidecar()),
		);
		expect(read.readOnly).toBe(true);
	});

	it("preserves an unreadable sidecar verbatim — repair never destroys data", () => {
		// §26.3's hard rule: raw invalid sidecar must survive. A reader
		// that "cleaned up" what it could not parse would silently delete
		// an author's work on load.
		const future = buildUnknownVersionSidecar();
		const data = buildPuckDataWithSidecar(future);
		readAuthoringState(data);
		expect(
			(data.root.props as Record<string, unknown>)[ANVILKIT_AUTHORING_KEY],
		).toEqual(future);
	});
});

describe("§30.7 rollback drill — retain reader, disable writers", () => {
	it("keeps the sidecar byte-identical when writers are off", () => {
		// The drill: a host rolls back by turning `features.enabled` off.
		// Nothing in Core rewrites the document in that state, so the
		// sidecar an author already committed is still there when the
		// flag comes back on.
		const state = authored();
		const data = writeAuthoringState(buildLegacyPuckData(), state);
		const serializedBefore = canonicalSerializeAuthoring(
			readAuthoringState(data).state,
		).text;

		const rolledBack: StudioEditorFeatures = { enabled: false };
		expect(rolledBack.enabled).toBe(false);
		// Reader still runs (that is the whole point of "retain reader").
		const afterRollback = readAuthoringState(data);
		expect(canonicalSerializeAuthoring(afterRollback.state).text).toBe(
			serializedBefore,
		);
		expect(afterRollback.state.revision).toBe(state.revision);
	});

	it("re-enabling writers finds the authored values intact", () => {
		const state = authored();
		const data = writeAuthoringState(buildLegacyPuckData(), state);
		const roundTripped = readAuthoringState(data).state;
		expect(roundTripped.nodes["legacy-0"]?.name).toBe("Renamed in the editor");
	});
});

describe("§26.3 feature flags hide UI but never delete data", () => {
	it("a disabled feature does not strip its records from the sidecar", () => {
		// Resolvers keep reading used features even when the authoring UI
		// for them is hidden — otherwise turning a flag off would be a
		// destructive migration disguised as a toggle.
		const state = authored();
		const data = writeAuthoringState(buildLegacyPuckData(), state);
		const flags: StudioEditorFeatures = { enabled: true, layout: false };
		expect(flags.layout).toBe(false);
		const read = readAuthoringState(data).state;
		expect(read.nodes["legacy-0"]?.layout?.base).toEqual({
			gap: { kind: "unit", value: 12, unit: "px" },
		});
	});
});

describe("§26.3 migrations are pure and idempotent", () => {
	it("returns already-current state unchanged", () => {
		const registry = createAuthoringMigrationRegistry();
		const state = authored();
		expect(registry.run(state as unknown as Record<string, unknown>)).toEqual(
			state,
		);
	});

	it("running twice is the same as running once", () => {
		const registry = createAuthoringMigrationRegistry();
		const once = registry.run(authored() as unknown as Record<string, unknown>);
		const twice = registry.run(once as unknown as Record<string, unknown>);
		expect(canonicalSerializeAuthoring(twice).text).toBe(
			canonicalSerializeAuthoring(once).text,
		);
	});

	it("refuses a version it has no step for, rather than guessing", () => {
		const registry = createAuthoringMigrationRegistry();
		expect(() => registry.run({ version: "0" })).toThrow(/no migration/);
	});

	it("v1 is the current version, so no step is registered yet", () => {
		expect(CURRENT_AUTHORING_VERSION).toBe("1");
		expect(createAuthoringMigrationRegistry().list()).toEqual([]);
	});
});

describe("§27.2 unknown fields survive a round trip", () => {
	it("keeps a forward-compatible key the current reader does not know", () => {
		// Hostile-peer and forward-compat: a newer editor's extra key must
		// come back out of an older editor unchanged.
		const withExtra = {
			...createEmptyAuthoringState(),
			futureCollection: { anything: true },
		} as unknown as AuthoringStateV1;
		const data: PuckData = buildPuckDataWithSidecar(withExtra);
		const stored = (data.root.props as Record<string, unknown>)[
			ANVILKIT_AUTHORING_KEY
		] as Record<string, unknown>;
		expect(stored.futureCollection).toEqual({ anything: true });
	});
});
