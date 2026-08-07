/**
 * @file Editor fixture builders (PLAN-0020 CORE-P0-017; DD-0019
 * §27.2, §30.1 "compatibility fixtures").
 *
 * Deterministic by construction: ids and values derive from indices,
 * never from randomness or clocks, so fixture-based benchmarks and
 * snapshots are reproducible.
 */

import type {
	DesignToken,
	NodeAuthoringStateV1,
} from "@anvilkit/contracts/editor";
import type {
	AuthoringStateV1,
} from "../../editor/legacy/index.js";
import {
	EDITOR_COUNT_LIMITS,
} from "@anvilkit/contracts/editor";
import {
	ANVILKIT_AUTHORING_KEY,
} from "../../editor/legacy/index.js";
import type { Data, Config as PuckConfig } from "@puckeditor/core";

/** Sizing knobs for {@link buildAuthoringStateAtLimits}. */
export interface LimitFixtureOptions {
	readonly nodeRecords?: number;
	readonly tokens?: number;
	readonly styleDefinitions?: number;
	readonly componentDefinitions?: number;
	readonly interactions?: number;
	readonly breakpoints?: number;
}

/** The frozen §7.3 maxima, exposed for benchmark call sites. */
export const LIMIT_FIXTURE_DEFAULTS: Required<LimitFixtureOptions> = {
	nodeRecords: EDITOR_COUNT_LIMITS.nodeRecords,
	tokens: EDITOR_COUNT_LIMITS.tokens,
	styleDefinitions: EDITOR_COUNT_LIMITS.styleDefinitions,
	componentDefinitions: EDITOR_COUNT_LIMITS.componentDefinitions,
	interactions: EDITOR_COUNT_LIMITS.interactions,
	breakpoints: EDITOR_COUNT_LIMITS.breakpoints,
};

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

function makeNodeRecord(index: number): NodeAuthoringStateV1 {
	return {
		version: "1",
		name: `Node ${index}`,
		layout: {
			base: {
				display: index % 2 === 0 ? "flex" : "block",
				gap: px(index % 32),
				padding: { top: px(index % 24), left: px(index % 16) },
			},
			overrides: {
				"bp-0": { gap: px(index % 12) },
			},
		},
		style: {
			base: {
				opacity: (index % 10) / 10,
				background: {
					kind: "solid",
					color: {
						kind: "literal",
						value: {
							kind: "rgba",
							r: index % 255,
							g: (index * 7) % 255,
							b: (index * 13) % 255,
							a: 1,
						},
					},
				},
			},
		},
		typography: {
			base: {
				fontSize: { kind: "token", tokenId: `token-${index % 100}` },
				textAlign: "left",
			},
		},
	};
}

function makeToken(index: number): DesignToken {
	return {
		id: `token-${index}`,
		path: ["generated", `group-${index % 20}`, `token-${index}`],
		name: `Token ${index}`,
		type: index % 2 === 0 ? "color" : "length",
		values: {
			light:
				index % 10 === 9
					? { kind: "alias", tokenId: `token-${(index + 1) % 100}` }
					: { kind: "literal", value: px(index % 64) },
			dark: { kind: "literal", value: px((index + 8) % 64) },
		},
		description: `Generated token ${index}`,
	};
}

/**
 * Build a realistic authoring state at (or near) the frozen §7.3
 * count limits — the byte-limit benchmark input (CORE-P0-014) and
 * the worst-case dispatch payload (CORE-P0-015).
 */
export function buildAuthoringStateAtLimits(
	options?: LimitFixtureOptions,
): AuthoringStateV1 {
	const sizes = { ...LIMIT_FIXTURE_DEFAULTS, ...options };
	const nodes: Record<string, NodeAuthoringStateV1> = {};
	for (let index = 0; index < sizes.nodeRecords; index += 1) {
		nodes[`node-${index}`] = makeNodeRecord(index);
	}
	const tokens: Record<string, DesignToken> = {};
	for (let index = 0; index < sizes.tokens; index += 1) {
		const token = makeToken(index);
		tokens[token.id] = token;
	}
	const styleDefinitions: AuthoringStateV1["styleDefinitions"] =
		Object.fromEntries(
			Array.from({ length: sizes.styleDefinitions }, (_, index) => [
				`sd-${index}`,
				{
					version: "1" as const,
					id: `sd-${index}`,
					name: `Style ${index}`,
					appliesTo: "any" as const,
					layout: { base: { gap: px(index % 40) } },
					createdAt: "2026-07-22T00:00:00.000Z",
					updatedAt: "2026-07-22T00:00:00.000Z",
				},
			]),
		);
	const componentDefinitions: AuthoringStateV1["componentDefinitions"] =
		Object.fromEntries(
			Array.from({ length: sizes.componentDefinitions }, (_, index) => [
				`cdef-${index}`,
				{
					version: "1" as const,
					id: `cdef-${index}`,
					name: `Component ${index}`,
					root: {
						type: "Box",
						props: { id: `def-root-${index}`, label: `Component ${index}` },
					},
					exposedProps: [
						{
							id: `prop-${index}`,
							name: "Label",
							type: "text" as const,
							sourcePath: ["label"],
						},
					],
					variantAxes: [],
					variants: [],
					revision: 1,
					createdAt: "2026-07-22T00:00:00.000Z",
					updatedAt: "2026-07-22T00:00:00.000Z",
				},
			]),
		);
	const interactions: AuthoringStateV1["interactions"] = Object.fromEntries(
		Array.from({ length: sizes.interactions }, (_, index) => [
			`int-${index}`,
			{
				version: "1" as const,
				id: `int-${index}`,
				name: `Interaction ${index}`,
				sourceNodeId: `node-${index % Math.max(sizes.nodeRecords, 1)}`,
				trigger: { type: "click" as const },
				actions: [
					{
						type: "url" as const,
						url: `https://example.com/${index}`,
					},
				],
				enabled: true,
			},
		]),
	);
	return {
		version: "1",
		revision: 1,
		breakpoints: Array.from({ length: sizes.breakpoints }, (_, index) => ({
			id: `bp-${index}`,
			label: `Breakpoint ${index}`,
			maxWidth: 7680 - index * 640,
			order: index,
			enabled: true,
		})),
		nodes,
		tokens,
		tokenModes: {
			light: { id: "light", name: "Light" },
			dark: { id: "dark", name: "Dark" },
		},
		styleDefinitions,
		componentDefinitions,
		interactions,
		bindings: {},
	};
}

/**
 * A legacy Puck document with **no** sidecar — the compatibility
 * baseline every editor build must read as empty authoring state.
 */
export function buildLegacyPuckData(nodeCount = 3): Data {
	return {
		content: Array.from({ length: nodeCount }, (_, index) => ({
			type: "Box",
			props: { id: `legacy-${index}`, label: `Legacy ${index}` },
		})),
		root: { props: { title: "Legacy page" } },
		zones: {},
	} as unknown as Data;
}

/** A Puck document carrying an arbitrary sidecar value. */
export function buildPuckDataWithSidecar(
	sidecar: unknown,
	nodeCount = 3,
): Data {
	const legacy = buildLegacyPuckData(nodeCount);
	return {
		...legacy,
		root: {
			...legacy.root,
			props: {
				...legacy.root?.props,
				[ANVILKIT_AUTHORING_KEY]: sidecar,
			},
		},
	} as Data;
}

/** An unknown-major-version sidecar (read-only safe mode fixture). */
export function buildUnknownVersionSidecar(): Record<string, unknown> {
	return {
		version: "2",
		revision: 41,
		nodes: {},
		futureCollection: { anything: true },
	};
}

/**
 * A root config **with slot fields** — the invariant-11 fixture
 * (§7.2): decoration must tolerate ordinary root slot fields and
 * fail fast only on a slot field named `__anvilkit`.
 */
export function buildRootConfigWithSlotFields(options?: {
	readonly collideWithSidecarKey?: boolean;
}): PuckConfig {
	return {
		components: {
			Box: {
				fields: { label: { type: "text" } },
				render: () => null,
			},
		},
		root: {
			fields: {
				content: { type: "slot" },
				...(options?.collideWithSidecarKey === true
					? { [ANVILKIT_AUTHORING_KEY]: { type: "slot" } }
					: {}),
			},
		},
	} as unknown as PuckConfig;
}
