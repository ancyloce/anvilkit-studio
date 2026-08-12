/**
 * @file PLAN-0025 P1-01 — v2 appearance/design-system/metadata schema
 * coverage: parse round-trips, canonicalization semantics, and
 * allowlist rejection.
 */

import type { AnvilAppearance, DesignSystem } from "@anvilkit/contracts/editor";
import { describe, expect, it } from "vitest";
import {
	AnvilAppearanceSchema,
	ComponentMetadataSchema,
	canonicalizeAppearance,
	DesignSystemSchema,
} from "../editor/appearance.js";

const appearance: AnvilAppearance = {
	version: "1",
	targets: {
		root: {
			style: {
				base: {
					layout: {
						display: "flex",
						gap: { kind: "unit", value: 8, unit: "px" },
					},
				},
				overrides: { "bp-tablet": { layout: { display: "block" } } },
			},
			styleRefs: { base: ["sd-card"] },
			hidden: { overrides: { "bp-tablet": true } },
		},
	},
};

const designSystem: DesignSystem = {
	version: "1",
	breakpoints: [
		{
			id: "bp-tablet",
			label: "Tablet",
			maxWidth: 1024,
			order: 0,
			enabled: true,
		},
	],
	tokens: {},
	tokenModes: { light: { id: "light", name: "Light" } },
	defaultTokenMode: "light",
	styleDefinitions: {},
};

describe("appearance schema (P1-01)", () => {
	it("round-trips a populated appearance", () => {
		const parsed = AnvilAppearanceSchema.safeParse(appearance);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data.targets?.root?.styleRefs?.base).toEqual(["sd-card"]);
		}
	});

	it("tolerates a stale version key and round-trips it unchanged", () => {
		// PLAN-0026 §5 / `p1-006`: the canonical appearance has no version
		// dimension, so `version` is no longer a discriminator — it is an
		// unknown key that `looseObject` preserves. This replaces the old
		// "rejects a wrong version literal" assertion, whose behaviour was
		// deliberately removed in `p1-001`: a canonical, version-free
		// appearance had to stop failing validation. `p7-002` stripped the
		// key from the store, so what this asserts now is the general
		// `looseObject` rule — an unknown key survives a round trip — not
		// a migration window.
		const stale = {
			version: "1",
			targets: { root: { hidden: { base: true } } },
		};
		const parsed = AnvilAppearanceSchema.safeParse(stale);
		expect(parsed.success).toBe(true);
		if (parsed.success) {
			expect(parsed.data).toStrictEqual(stale);
		}

		// An unknown *major* is tolerated on exactly the same terms — there
		// is no version branch left to reject it.
		expect(
			AnvilAppearanceSchema.safeParse({ version: "2", targets: {} }).success,
		).toBe(true);
	});

	it("never re-emits a version key when canonicalizing", () => {
		const canonical = canonicalizeAppearance({
			version: "1",
			targets: { root: { hidden: { base: true } } },
		});
		expect(canonical).toBeDefined();
		expect(Object.hasOwn(canonical as object, "version")).toBe(false);
	});

	it("canonicalizes empty shells to undefined", () => {
		expect(canonicalizeAppearance(undefined)).toBeUndefined();
		expect(canonicalizeAppearance({ version: "1" })).toBeUndefined();
		expect(
			canonicalizeAppearance({ version: "1", targets: {} }),
		).toBeUndefined();
		expect(
			canonicalizeAppearance({
				version: "1",
				targets: { root: {}, media: { style: {} } },
			}),
		).toBeUndefined();
	});

	it("canonicalization keeps content-bearing targets and drops empty ones", () => {
		const canonical = canonicalizeAppearance({
			version: "1",
			targets: { ...appearance.targets, empty: {} },
		});
		expect(canonical).toBeDefined();
		expect(Object.keys(canonical?.targets ?? {})).toEqual(["root"]);
	});

	it("does not mutate its input", () => {
		const input = {
			version: "1",
			targets: { root: appearance.targets?.root ?? {}, empty: {} },
		} as AnvilAppearance;
		const before = JSON.stringify(input);
		canonicalizeAppearance(input);
		expect(JSON.stringify(input)).toBe(before);
	});
});

describe("design system schema (P1-01)", () => {
	it("round-trips a minimal design system", () => {
		expect(DesignSystemSchema.safeParse(designSystem).success).toBe(true);
	});

	it("requires defaultTokenMode", () => {
		const { defaultTokenMode: _omit, ...rest } = designSystem;
		expect(DesignSystemSchema.safeParse(rest).success).toBe(false);
	});
});

describe("component metadata v2 schema (P1-01)", () => {
	it("accepts named targets with allowlisted properties", () => {
		const parsed = ComponentMetadataSchema.safeParse({
			version: "2",
			styleTargets: {
				root: {
					label: "Card",
					responsive: true,
					properties: ["gap", "padding"],
				},
			},
			inlineText: [{ id: "label", propPath: "label", format: "plain" }],
			interactions: true,
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects a property outside the authorable allowlist", () => {
		// `zIndex` was the example here until `p1-004` widened
		// `AuthorableStyleProperty` from 23 to 40 members and made it
		// authorable. The assertion is unchanged in strength — only the
		// example moved to a property that is still genuinely outside the
		// allowlist. `float` is not one of the 40.
		expect(
			ComponentMetadataSchema.safeParse({
				styleTargets: { root: { label: "X", properties: ["float"] } },
			}).success,
		).toBe(false);
	});

	it("accepts the properties `p1-004` added to the allowlist", () => {
		// Guards the widening from silently regressing: these are members
		// the pre-`p1-004` 23-property vocabulary did not contain.
		expect(
			ComponentMetadataSchema.safeParse({
				styleTargets: {
					root: {
						label: "X",
						properties: ["zIndex", "overflow", "inset", "filter", "blendMode"],
					},
				},
			}).success,
		).toBe(true);
	});
});
