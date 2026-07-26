/**
 * @file The ADR 0005 Appendix A certification-fixture manifest
 * (PLAN-0020 CORE-P2-011; DD-0019 §27.6).
 *
 * ADR 0005 enforces cross-editor alignment "by normative convention
 * and shared certification fixtures, not by shared code": each
 * fixture is implemented in **both** repos against its own IR, under
 * these shared IDs, "so cross-editor coverage is auditable".
 *
 * This module is deliberately **data only** — no assertions, no test
 * framework import — so the canvas repo can vendor the identical list
 * without taking a dependency on `@anvilkit/core`. The page-editor
 * implementations live in `testing/editor/__tests__/cfx.test.ts`,
 * which fails if any id below goes unexercised.
 */

/** The component-model fixtures (ADR 0005 Appendix A, `CFX-C*`). */
export const CFX_COMPONENT_IDS = [
	"CFX-C01",
	"CFX-C02",
	"CFX-C03",
	"CFX-C04",
	"CFX-C05",
	"CFX-C06",
	"CFX-C07",
	"CFX-C08",
	"CFX-C09",
	"CFX-C10",
	"CFX-C11",
	"CFX-C12",
	"CFX-C13",
	"CFX-C14",
	"CFX-C15",
] as const;

/** The token fixtures (ADR 0005 Appendix A, `CFX-T*`). */
export const CFX_TOKEN_IDS = [
	"CFX-T01",
	"CFX-T02",
	"CFX-T03",
	"CFX-T04",
	"CFX-T05",
] as const;

/** Every shared certification-fixture id. */
export const CFX_IDS = [...CFX_COMPONENT_IDS, ...CFX_TOKEN_IDS] as const;

/** One shared certification fixture. */
export type CfxId = (typeof CFX_IDS)[number];

/** What a fixture certifies, transcribed from ADR 0005 Appendix A. */
export interface CfxFixture {
	readonly id: CfxId;
	/** The Part 1 checklist row / Part 2 decision it derives from. */
	readonly row: string;
	readonly passCriterion: string;
	/**
	 * True when the fixture exercises a layer only the page model has
	 * (breakpoint overrides). The canvas suite implements the same id
	 * without that layer — ADR 0005: "domain-specific layers are noted
	 * where the editors legitimately differ".
	 */
	readonly pageOnlyLayer?: boolean;
}

/** The manifest, in Appendix A order. */
export const CFX_FIXTURES: readonly CfxFixture[] = [
	{
		id: "CFX-C01",
		row: "Definition/instance separation",
		passCriterion:
			"Serialized instances carry reference, variant selection, and overrides only — no resolved subtree; document size does not scale with instance count × definition size",
	},
	{
		id: "CFX-C02",
		row: "Stable override addressing",
		passCriterion:
			"Overrides still apply to the same targets after rename/reorder; an index-keyed override fails schema validation",
	},
	{
		id: "CFX-C03",
		row: "Shared resolution",
		passCriterion:
			"All consumers receive the identical resolved tree; no path re-resolves independently",
	},
	{
		id: "CFX-C04",
		row: "Runtime ID namespacing",
		passCriterion:
			"Generated IDs follow the namespacing scheme, never collide with document node IDs, and none is persisted",
	},
	{
		id: "CFX-C05",
		row: "Resolution precedence",
		passCriterion:
			"Resolved value follows the fixed precedence; removing each layer in turn falls back to the next lower layer",
		pageOnlyLayer: true,
	},
	{
		id: "CFX-C06",
		row: "Atomic creation",
		passCriterion:
			"One undo restores the exact pre-creation document and selection",
	},
	{
		id: "CFX-C07",
		row: "Cycle and depth rejection",
		passCriterion:
			"Both rejected before commit with full-path diagnostics; document unchanged",
	},
	{
		id: "CFX-C08",
		row: "Propagation without copies",
		passCriterion:
			"All instances reflect the edit; overrides intact; command/patch size independent of N",
	},
	{
		id: "CFX-C09",
		row: "Orphan overrides",
		passCriterion:
			"Override retained as diagnosable orphan data with a diagnostic; never applied to another node",
	},
	{
		id: "CFX-C10",
		row: "Detach materialization",
		passCriterion:
			"Visually equivalent output; all-new node IDs; later definition edits do not affect detached nodes; one history entry",
	},
	{
		id: "CFX-C11",
		row: "Variant override compatibility",
		passCriterion:
			"Compatible override preserved; incompatible override becomes a diagnostic, never silently dropped",
	},
	{
		id: "CFX-C12",
		row: "Missing definition",
		passCriterion:
			"Selectable placeholder plus structured warning; no crash, no silent node removal",
	},
	{
		id: "CFX-C13",
		row: "Deletion confirmation",
		passCriterion:
			"Detach-all is one atomic batch and one history entry; blocking policy refuses; no committed state references a deleted definition",
	},
	{
		id: "CFX-C14",
		row: "Source retention",
		passCriterion:
			"Instance data unchanged through the outage; distinct library-unavailable placeholder reason; automatic re-resolution on restore",
	},
	{
		id: "CFX-C15",
		row: "Reset granularity",
		passCriterion:
			"Reset-one removes only its target; reset-all returns to definition-plus-variant resolution; promote updates the definition default, propagates, and removes the redundant override in the same commit",
	},
	{
		id: "CFX-T01",
		row: "Single-resolver idiom",
		passCriterion:
			"Every consumer calls the system's one public resolver; identical results; no duplicated resolution logic",
	},
	{
		id: "CFX-T02",
		row: "No live cross-system aliases",
		passCriterion:
			"Rejected by schema: only `literal` and same-system `alias` kinds parse",
	},
	{
		id: "CFX-T03",
		row: "Import-as-copy provenance",
		passCriterion:
			"Result is a literal plus `source`; resolution is identical with `source` stripped; generated output is byte-identical with and without it",
	},
	{
		id: "CFX-T04",
		row: "Alias depth and cycles",
		passCriterion:
			"At-limit chain resolves; past-limit and cycle fail with stable error codes; export is blocked on the cycle",
	},
	{
		id: "CFX-T05",
		row: "Reserved mode vocabulary",
		passCriterion:
			"Modes resolve per mode; the reserved meaning of light/dark matches the theme system's dark overrides",
	},
];

/** Look up one fixture's manifest entry. */
export function cfxFixture(id: CfxId): CfxFixture {
	const found = CFX_FIXTURES.find((fixture) => fixture.id === id);
	if (found === undefined) {
		throw new Error(`unknown CFX fixture id: ${id}`);
	}
	return found;
}
