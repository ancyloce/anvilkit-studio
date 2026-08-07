/**
 * @file Fixed performance profiles for the §28 benchmark harness
 * (PLAN-0020 CORE-P4-001; DD-0019 §28, plan §14 "test document
 * profiles").
 *
 * §14 pins two shapes the harness must always measure against:
 *
 * - **P-1k "normal"** — 1,000 tree nodes, mixed capabilities, 3
 *   breakpoints, 200 authoring records;
 * - **P-10k "stress"** — 10,000 tree nodes, same mix.
 *
 * (P-max — every §7.3 count at its cap — already exists as
 * {@link buildAuthoringStateAtLimits} and stays the byte/dispatch
 * fixture; it is a *limits* profile, not a *load* profile.)
 *
 * Everything here is derived from indices — no randomness, no clock —
 * because a benchmark whose input drifts cannot detect a 10%
 * regression. The same profile object feeds every scenario so a
 * measurement difference is a code difference.
 */

import type {
	BreakpointDefinition,
	AnvilComponentMetadata,
	NodeAuthoringStateV1,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../editor/legacy/index.js";
import {
	ANVILKIT_AUTHORING_KEY,
} from "../../editor/legacy/index.js";
import type { Data } from "@puckeditor/core";
import type { EditorCapabilityRegistry } from "../../types/editor-api.js";

/** Component types the profiles cycle through (mixed capabilities). */
export const PERF_COMPONENT_TYPES = [
	"Box",
	"Heading",
	"Image",
	"Button",
] as const;

/** One generated tree node, before it becomes a Puck item. */
interface PerfNodeSeed {
	readonly id: string;
	readonly type: (typeof PERF_COMPONENT_TYPES)[number];
	readonly props: Record<string, unknown>;
}

/** Sizing knobs for {@link buildPerfProfile}. */
export interface PerfProfileOptions {
	/** Puck tree nodes (the §28 "1,000 / 10,000 nodes" column). */
	readonly treeNodes: number;
	/** Sidecar node records (§7.3 caps this at 5,000). */
	readonly authoringRecords: number;
	/** Enabled breakpoints (§14 uses 3). */
	readonly breakpoints: number;
	/** Design tokens in the sidecar. */
	readonly tokens: number;
	/** Direct children per container in the generated layer tree. */
	readonly childrenPerContainer?: number;
}

/**
 * A layer row. Structurally identical to the Layers module's
 * `LayerNode`/`LayerChildZone` (deliberately re-declared rather than
 * imported: the testing entry must not pull the Studio chrome graph
 * into its type surface). The shape is pinned by a compile-time
 * assignability check in the harness.
 */
export interface PerfLayerNode {
	readonly id: string;
	readonly type: string;
	readonly label: string;
	readonly zone: string;
	readonly index: number;
	readonly depth: number;
	readonly childZones: readonly PerfLayerChildZone[];
}

/** One child slot of a {@link PerfLayerNode}. */
export interface PerfLayerChildZone {
	readonly zoneKey: string;
	readonly slotName: string;
	readonly items: readonly PerfLayerNode[];
}

/** A complete, self-consistent benchmark input. */
export interface PerfProfile {
	readonly id: string;
	readonly options: Required<PerfProfileOptions>;
	/** Puck document **with** the sidecar attached to `root.props`. */
	readonly data: Data;
	/** The same document **without** a sidecar (write-path target). */
	readonly bareData: Data;
	readonly authoring: AuthoringStateV1;
	readonly breakpoints: readonly BreakpointDefinition[];
	/** Capability registry covering {@link PERF_COMPONENT_TYPES}. */
	readonly capabilities: EditorCapabilityRegistry;
	/** Layer rows for the search scenario (one row per tree node). */
	readonly layerRoots: readonly PerfLayerNode[];
	/** A node id guaranteed to carry an authoring record. */
	readonly authoredNodeId: string;
}

/** The two §14 load profiles, frozen. */
export const PERF_PROFILE_PRESETS = {
	"1k": {
		treeNodes: 1_000,
		authoringRecords: 200,
		breakpoints: 3,
		tokens: 200,
		childrenPerContainer: 10,
	},
	"10k": {
		treeNodes: 10_000,
		authoringRecords: 2_000,
		breakpoints: 3,
		tokens: 200,
		childrenPerContainer: 10,
	},
} as const satisfies Record<string, Required<PerfProfileOptions>>;

/** Preset key type (`"1k" | "10k"`). */
export type PerfProfileId = keyof typeof PERF_PROFILE_PRESETS;

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

/**
 * Capability metadata per generated component type. Deliberately
 * mixed: `Box` is a plain container, `Heading`/`Button` declare inline
 * text, `Image` declares an image target — so the accessibility scan
 * and the inspector both have real work to do.
 */
const PERF_METADATA: Readonly<
	Record<string, AnvilComponentMetadata | undefined>
> = {
	Box: {
		styleTargets: {
			root: {
				label: "Box",
				properties: [
					"display",
					"gap",
					"padding",
					"width",
					"height",
					"background",
					"borderRadius",
				],
				responsive: true,
			},
		},
	},
	Heading: {
		styleTargets: {
			root: {
				label: "Heading",
				properties: ["width", "margin", "fontSize", "fontWeight", "color"],
				responsive: true,
			},
		},
		inlineText: [{ id: "text", propPath: "text", format: "plain" }],
	},
	Image: {
		styleTargets: {
			root: {
				label: "Image",
				properties: ["width", "height", "borderRadius", "opacity"],
			},
		},
		images: [{ id: "media", srcPropPath: "src", altPropPath: "alt" }],
	},
	Button: {
		styleTargets: {
			root: {
				label: "Button",
				properties: ["width", "padding", "fontSize", "color", "background"],
			},
		},
		interactions: true,
	},
};

function seedProps(
	type: PerfNodeSeed["type"],
	index: number,
): Record<string, unknown> {
	switch (type) {
		case "Heading":
			// Every 40th heading skips a level, so `skipped-heading-level`
			// has real findings to report rather than an empty fast path.
			return {
				text: `Heading ${index}`,
				level: index % 40 === 39 ? 4 : (index % 3) + 1,
			};
		case "Image":
			// Every 25th image is missing its alt text — the scan's
			// `image-missing-alt` rule needs positives to cost anything.
			return {
				src: `https://cdn.example.com/${index}.avif`,
				alt: index % 25 === 24 ? "" : `Image ${index}`,
			};
		case "Button":
			return { label: index % 30 === 29 ? "" : `Action ${index}` };
		default:
			return { label: `Box ${index}` };
	}
}

function buildSeeds(count: number): PerfNodeSeed[] {
	const seeds: PerfNodeSeed[] = [];
	for (let index = 0; index < count; index += 1) {
		const type = PERF_COMPONENT_TYPES[
			index % PERF_COMPONENT_TYPES.length
		] as (typeof PERF_COMPONENT_TYPES)[number];
		seeds.push({
			id: `perf-${index}`,
			type,
			props: { id: `perf-${index}`, ...seedProps(type, index) },
		});
	}
	return seeds;
}

function buildNodeRecord(
	index: number,
	breakpointIds: readonly string[],
): NodeAuthoringStateV1 {
	const overrideId = breakpointIds[index % breakpointIds.length];
	return {
		version: "1",
		name: `Perf node ${index}`,
		layout: {
			base: {
				display: index % 3 === 0 ? "flex" : "block",
				gap: px(index % 24),
				padding: { top: px(index % 16), left: px(index % 12) },
			},
			...(overrideId === undefined
				? {}
				: { overrides: { [overrideId]: { gap: px(index % 8) } } }),
		},
		style: {
			base: {
				opacity: ((index % 10) + 1) / 10,
				background: {
					kind: "solid",
					color:
						index % 4 === 0
							? { kind: "token", tokenId: `perf-token-${index % 50}` }
							: {
									kind: "literal",
									value: {
										kind: "rgba",
										r: index % 255,
										g: (index * 5) % 255,
										b: (index * 11) % 255,
										a: 1,
									},
								},
				},
			},
		},
		typography: {
			base: {
				fontSize: { kind: "token", tokenId: `perf-token-${index % 50}` },
				textAlign: index % 2 === 0 ? "left" : "center",
			},
		},
	};
}

/**
 * Build one fixed benchmark profile. Pass a preset key for the frozen
 * §14 shapes; pass explicit options only for harness self-tests.
 */
export function buildPerfProfile(
	profile: PerfProfileId | Required<PerfProfileOptions>,
	id?: string,
): PerfProfile {
	const options: Required<PerfProfileOptions> =
		typeof profile === "string" ? PERF_PROFILE_PRESETS[profile] : profile;
	const profileId = id ?? (typeof profile === "string" ? profile : "custom");

	const breakpoints: readonly BreakpointDefinition[] = Array.from(
		{ length: options.breakpoints },
		(_, index) => ({
			id: `perf-bp-${index}`,
			label: `Breakpoint ${index}`,
			maxWidth: 1440 - index * 320,
			order: index,
			enabled: true,
		}),
	);
	const breakpointIds = breakpoints.map((breakpoint) => breakpoint.id);

	const seeds = buildSeeds(options.treeNodes);

	const nodes: Record<string, NodeAuthoringStateV1> = {};
	// Authoring records are spread evenly across the tree rather than
	// clustered at the head: a resolver that short-circuits on the first
	// unauthored node must not look fast.
	const stride = Math.max(
		1,
		Math.floor(options.treeNodes / Math.max(options.authoringRecords, 1)),
	);
	for (let index = 0; index < options.authoringRecords; index += 1) {
		const seedIndex = (index * stride) % options.treeNodes;
		const seed = seeds[seedIndex];
		if (seed === undefined) {
			continue;
		}
		nodes[seed.id] = buildNodeRecord(index, breakpointIds);
	}

	const tokens: AuthoringStateV1["tokens"] = Object.fromEntries(
		Array.from({ length: options.tokens }, (_, index) => [
			`perf-token-${index}`,
			{
				id: `perf-token-${index}`,
				path: ["perf", `group-${index % 10}`, `token-${index}`],
				name: `Perf token ${index}`,
				type: index % 2 === 0 ? ("color" as const) : ("length" as const),
				values: {
					light:
						index % 9 === 8
							? {
									kind: "alias" as const,
									tokenId: `perf-token-${(index + 1) % options.tokens}`,
								}
							: { kind: "literal" as const, value: px(index % 48) },
				},
			},
		]),
	);

	const authoring: AuthoringStateV1 = {
		version: "1",
		revision: 1,
		breakpoints,
		nodes,
		tokens,
		tokenModes: { light: { id: "light", name: "Light" } },
		styleDefinitions: {},
		componentDefinitions: {},
		interactions: {},
		bindings: {},
	};

	const content = seeds.map((seed) => ({ type: seed.type, props: seed.props }));
	const bareData = {
		content,
		root: { props: { title: `Perf profile ${profileId}` } },
		zones: {},
	} as unknown as Data;
	const data = {
		...bareData,
		root: {
			...bareData.root,
			props: {
				...bareData.root?.props,
				[ANVILKIT_AUTHORING_KEY]: authoring,
			},
		},
	} as Data;

	const metadataByType = PERF_METADATA;
	const typeByNodeId = new Map(seeds.map((seed) => [seed.id, seed.type]));
	const capabilities: EditorCapabilityRegistry = {
		forComponent(componentType) {
			return metadataByType[componentType];
		},
		forNode(nodeId) {
			const type = typeByNodeId.get(nodeId);
			return type === undefined ? undefined : metadataByType[type];
		},
		listUsedFeatures() {
			// The profiles author responsive overrides and token refs; they
			// deliberately do not use components, variants, interactions,
			// bindings, or rich text (those have their own CFX fixtures).
			return ["responsive", "tokens"];
		},
	};

	return {
		id: profileId,
		options,
		data,
		bareData,
		authoring,
		breakpoints,
		capabilities,
		layerRoots: buildLayerRoots(seeds, options.childrenPerContainer),
		authoredNodeId: Object.keys(nodes)[0] ?? seeds[0]?.id ?? "perf-0",
	};
}

/**
 * Group the flat seed list into containers so the search scenario
 * walks a real two-level tree (ancestor retention is the expensive
 * part of {@link filterLayerTree}, and a flat list never exercises it).
 */
function buildLayerRoots(
	seeds: readonly PerfNodeSeed[],
	childrenPerContainer: number,
): readonly PerfLayerNode[] {
	const size = Math.max(1, childrenPerContainer);
	const roots: PerfLayerNode[] = [];
	for (let start = 0; start < seeds.length; start += size) {
		const group = seeds.slice(start, start + size);
		const head = group[0];
		if (head === undefined) {
			continue;
		}
		const rootIndex = roots.length;
		roots.push({
			id: head.id,
			type: head.type,
			label: `Perf node ${start}`,
			zone: "root:default-zone",
			index: rootIndex,
			depth: 0,
			childZones: [
				{
					zoneKey: `${head.id}:content`,
					slotName: "content",
					items: group.slice(1).map((seed, offset) => ({
						id: seed.id,
						type: seed.type,
						label: `Perf node ${start + offset + 1}`,
						zone: `${head.id}:content`,
						index: offset,
						depth: 1,
						childZones: [],
					})),
				},
			],
		});
	}
	return roots;
}
