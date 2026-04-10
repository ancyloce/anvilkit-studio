/**
 * @file Compile-time type tests for `src/types/ir.ts`.
 *
 * Enforced by `tsc --noEmit -p tsconfig.test.json`. Every valid
 * shape must compile; every `@ts-expect-error` comment must still
 * refer to a genuinely broken line. The single
 * `expect(true).toBe(true)` exists so vitest reports the suite as
 * passing rather than empty.
 */

import { describe, expect, it } from "vitest";

import type {
	PageIR,
	PageIRAsset,
	PageIRMetadata,
	PageIRNode,
} from "../ir.js";

describe("PageIR type contract", () => {
	it("accepts a minimal single-node PageIR", () => {
		const ir: PageIR = {
			version: "1",
			root: {
				id: "root",
				type: "Root",
				props: {},
			},
			assets: [],
			metadata: {},
		};
		void ir;
		expect(true).toBe(true);
	});

	it("accepts a deeply nested PageIRNode tree", () => {
		const leaf: PageIRNode = {
			id: "leaf",
			type: "Button",
			props: { label: "Click me" },
		};
		const branch: PageIRNode = {
			id: "branch",
			type: "Stack",
			props: { direction: "column" },
			children: [leaf],
		};
		const root: PageIRNode = {
			id: "root",
			type: "Root",
			props: {},
			children: [branch],
			assets: [
				{ id: "hero-bg", kind: "image", url: "/hero.jpg" },
			],
		};
		const ir: PageIR = {
			version: "1",
			root,
			assets: [
				{
					id: "hero-bg",
					kind: "image",
					url: "/hero.jpg",
					meta: { width: 1600, height: 900 },
				},
				{
					id: "inter",
					kind: "font",
					url: "/fonts/inter.woff2",
				},
			],
			metadata: {
				title: "Home",
				description: "Landing page",
				createdAt: "2026-04-09T12:00:00Z",
				updatedAt: "2026-04-09T12:00:00Z",
			},
		};
		void ir;
	});

	it("PageIRAsset.kind is restricted to the closed union", () => {
		const asset: PageIRAsset = {
			id: "a",
			kind: "video",
			url: "/v.mp4",
		};
		void asset;

		// @ts-expect-error — `"audio"` is not in the closed kind union.
		const invalidKind: PageIRAsset["kind"] = "audio";
		void invalidKind;
	});

	it("PageIR.version is the literal string `\"1\"`", () => {
		// @ts-expect-error — numeric `1` is not the string literal.
		const numericVersion: PageIR["version"] = 1;
		void numericVersion;

		// @ts-expect-error — future version `"2"` not yet valid.
		const futureVersion: PageIR["version"] = "2";
		void futureVersion;
	});

	it("PageIRNode rejects an object missing required fields", () => {
		// @ts-expect-error — `props` is required.
		const missingProps: PageIRNode = {
			id: "x",
			type: "X",
		};
		void missingProps;

		// @ts-expect-error — `type` is required.
		const missingType: PageIRNode = {
			id: "x",
			props: {},
		};
		void missingType;
	});

	it("PageIRMetadata makes every field optional", () => {
		const empty: PageIRMetadata = {};
		void empty;

		const partial: PageIRMetadata = { title: "Only a title" };
		void partial;
	});

	it("PageIR rejects a tree missing `assets` or `metadata`", () => {
		// @ts-expect-error — `assets` is required (even if empty).
		const missingAssets: PageIR = {
			version: "1",
			root: { id: "r", type: "Root", props: {} },
			metadata: {},
		};
		void missingAssets;

		// @ts-expect-error — `metadata` is required (even if empty).
		const missingMetadata: PageIR = {
			version: "1",
			root: { id: "r", type: "Root", props: {} },
			assets: [],
		};
		void missingMetadata;
	});
});
