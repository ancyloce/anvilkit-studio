/**
 * @file PLAN-0025 P0-04 — the legacy fixture pack.
 *
 * Deterministic v1 documents covering every category the Puck-native
 * migration must carry: content, slots, old zones, tokens (literal +
 * alias + modes), style definitions + styleRefs, hidden state,
 * interactions, bindings, and dynamic component definitions. These
 * are the inputs for the P0-05 CSS parity goldens and the P1-06 /
 * §14.5 migration suites.
 *
 * Builds on the existing `../fixtures.js` builders instead of
 * duplicating them. Lives in `__tests__` deliberately: nothing here
 * joins the public testing API or the api-snapshot; P1-06 may promote
 * it when the migration suites need it exported.
 */

import type { NodeAuthoringStateV1 } from "@anvilkit/contracts/editor";
import type { Data, Config as PuckConfig } from "@puckeditor/core";
import {
	ANVILKIT_AUTHORING_KEY,
	type LegacyAuthoringState as AuthoringStateV1,
} from "../../../migrations/legacy-sidecar.js";
import {
	buildLegacyPuckData,
	buildPuckDataWithSidecar,
	buildUnknownVersionSidecar,
} from "../fixtures.js";

const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

const FIXED_DATE = "2026-08-04T00:00:00.000Z";

const heroNode: NodeAuthoringStateV1 = {
	version: "1",
	name: "Hero",
	layout: {
		base: { display: "flex", gap: px(16), padding: { top: px(24) } },
		overrides: { "bp-tablet": { gap: px(8) } },
	},
	style: {
		base: {
			opacity: 0.9,
			background: {
				kind: "solid",
				color: {
					kind: "literal",
					value: { kind: "rgba", r: 20, g: 40, b: 80, a: 1 },
				},
			},
		},
	},
	typography: {
		base: {
			// KNOWN PRE-EXISTING DEFECT captured on purpose (P0-05
			// discovery): length-type tokens materialize BARE, but
			// TokenOrLiteral slots like fontSize need a {kind:"literal"}
			// wrapper, so this reference can never resolve in the current
			// pipelines and emits one EDITOR_INVALID_CSS_VALUE warning.
			// The goldens lock that behavior; Phase 1 decides fix-vs-parity.
			fontSize: { kind: "token", tokenId: "tok-space" },
			// Color tokens DO resolve (literal-wrapped) — mode-dependent.
			color: { kind: "token", tokenId: "tok-ink" },
			textAlign: "left",
		},
	},
	hidden: { base: false, overrides: { "bp-tablet": true } },
};

const cardNode: NodeAuthoringStateV1 = {
	version: "1",
	name: "Card",
	styleRefs: { base: ["sd-card"] },
	layout: { base: { padding: { top: px(12), left: px(12) } } },
};

const zoneChildNode: NodeAuthoringStateV1 = {
	version: "1",
	name: "Zone child",
	hidden: { base: true },
};

/** The full v1 sidecar: every collection non-empty, all deterministic. */
export const legacyAuthoringSidecar: AuthoringStateV1 = {
	version: "1",
	revision: 7,
	breakpoints: [
		{
			id: "bp-tablet",
			label: "Tablet",
			maxWidth: 1024,
			order: 0,
			enabled: true,
		},
	],
	nodes: {
		"hero-1": heroNode,
		"card-1": cardNode,
		"zone-child-1": zoneChildNode,
	},
	tokens: {
		"tok-space": {
			id: "tok-space",
			path: ["legacy", "space", "tok-space"],
			name: "Space",
			type: "length",
			values: {
				light: { kind: "literal", value: px(16) },
				dark: { kind: "literal", value: px(20) },
			},
			description: "Legacy spacing token",
		},
		"tok-space-alias": {
			id: "tok-space-alias",
			path: ["legacy", "space", "tok-space-alias"],
			name: "Space alias",
			type: "length",
			values: {
				light: { kind: "alias", tokenId: "tok-space" },
				dark: { kind: "alias", tokenId: "tok-space" },
			},
			description: "Alias exercising token indirection",
		},
		"tok-ink": {
			id: "tok-ink",
			path: ["legacy", "color", "tok-ink"],
			name: "Ink",
			type: "color",
			values: {
				light: {
					kind: "literal",
					value: { kind: "rgba", r: 17, g: 34, b: 68, a: 1 },
				},
				dark: {
					kind: "literal",
					value: { kind: "rgba", r: 230, g: 236, b: 245, a: 1 },
				},
			},
			description: "Mode-dependent text color",
		},
	},
	tokenModes: {
		light: { id: "light", name: "Light" },
		dark: { id: "dark", name: "Dark" },
	},
	styleDefinitions: {
		"sd-card": {
			version: "1",
			id: "sd-card",
			name: "Card style",
			appliesTo: "any",
			layout: { base: { gap: px(8) } },
			createdAt: FIXED_DATE,
			updatedAt: FIXED_DATE,
		},
	},
	componentDefinitions: {
		"cdef-badge": {
			version: "1",
			id: "cdef-badge",
			name: "Badge",
			root: { type: "Box", props: { id: "def-root-badge", label: "Badge" } },
			exposedProps: [
				{
					id: "prop-label",
					name: "Label",
					type: "text",
					sourcePath: ["label"],
				},
			],
			variantAxes: [],
			variants: [],
			revision: 1,
			createdAt: FIXED_DATE,
			updatedAt: FIXED_DATE,
		},
	},
	interactions: {
		"int-cta": {
			version: "1",
			id: "int-cta",
			name: "CTA click",
			sourceNodeId: "hero-1",
			trigger: { type: "click" },
			actions: [{ type: "url", url: "https://example.com/cta" }],
			enabled: true,
		},
	},
	bindings: {
		"bind-title": {
			version: "1",
			id: "bind-title",
			nodeId: "card-1",
			target: { type: "prop", path: ["label"] },
			expression: { type: "path", root: "data", path: ["title"] },
			fallback: "Untitled",
		},
	},
};

/**
 * The full legacy document: sidecar plus content, a slot-bearing
 * component with a nested child, and an OLD-FORMAT zones entry.
 */
export function buildFullLegacyDocument(): Data {
	return {
		content: [
			{ type: "Box", props: { id: "hero-1", label: "Hero" } },
			{
				type: "Card",
				props: {
					id: "card-1",
					body: [
						{ type: "Box", props: { id: "slot-child-1", label: "In slot" } },
					],
				},
			},
		],
		root: {
			props: {
				title: "Legacy fixture page",
				[ANVILKIT_AUTHORING_KEY]: legacyAuthoringSidecar,
			},
		},
		zones: {
			"hero-1:cta": [
				{ type: "Box", props: { id: "zone-child-1", label: "Zone child" } },
			],
		},
	} as unknown as Data;
}

/**
 * Config matching the document. `Box` declares a `cta` slot so Puck's
 * `migrate()` can normalize the legacy `zones["hero-1:cta"]` entry
 * into `hero-1.props.cta` — raw legacy zones are INVISIBLE to
 * `walkTree` until that migration runs (locked by the pack's tests;
 * plan §10.2 step 1 depends on this ordering).
 */
export function buildLegacyFixtureConfig(): PuckConfig {
	return {
		components: {
			Box: {
				fields: { label: { type: "text" }, cta: { type: "slot" } },
				render: () => null,
			},
			Card: { fields: { body: { type: "slot" } }, render: () => null },
		},
	} as unknown as PuckConfig;
}

export interface LegacyFixture {
	readonly name: string;
	readonly data: Data;
	readonly expectReadOnly: boolean;
}

/** The pack: every migration-relevant document shape, deterministic. */
export function buildLegacyFixturePack(): readonly LegacyFixture[] {
	return [
		{
			name: "empty-document",
			data: { content: [], root: { props: {} }, zones: {} } as unknown as Data,
			expectReadOnly: false,
		},
		{
			name: "content-only-no-sidecar",
			data: buildLegacyPuckData(3),
			expectReadOnly: false,
		},
		{
			name: "full-sidecar-with-slots-and-zones",
			data: buildFullLegacyDocument(),
			expectReadOnly: false,
		},
		{
			name: "unknown-major-sidecar",
			data: buildPuckDataWithSidecar(buildUnknownVersionSidecar()),
			expectReadOnly: true,
		},
	];
}
