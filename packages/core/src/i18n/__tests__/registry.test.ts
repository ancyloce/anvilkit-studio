/**
 * @file Unit tests for the i18n registry merge + formatter (P1-T1).
 *
 * Covers P0 frozen contracts §B:
 * - merge order (core seeds before plugin namespaces)
 * - namespace guard (drops + reports cross-namespace keys; core seeds exempt)
 * - lazy pack resolution (loaded pack overrides English; English fallback)
 * - last-write-wins within a namespace
 * - braceFormatter interpolation (unknown tokens stay literal)
 */

import { describe, expect, it } from "vitest";
import { braceFormatter } from "@/i18n/format";
import {
	loadedPackKey,
	type MessageBundle,
	mergeCatalog,
	type RegistryEntry,
} from "@/i18n/registry";

const EMPTY_LOADED: ReadonlyMap<string, MessageBundle> = new Map();

const studioEntry: RegistryEntry = {
	namespace: "studio",
	en: { "studio.publish": "Publish", "studio.back": "Back" },
};

const pluginEntry: RegistryEntry = {
	namespace: "versionHistory",
	en: {
		"versionHistory.action.save": "Save snapshot",
		"versionHistory.list.empty": "No snapshots yet.",
	},
};

describe("mergeCatalog", () => {
	it("merges core seeds and plugin namespaces into one flat catalog", () => {
		const catalog = mergeCatalog(
			[studioEntry, pluginEntry],
			"en",
			EMPTY_LOADED,
		);
		expect(catalog["studio.publish"]).toBe("Publish");
		expect(catalog["versionHistory.action.save"]).toBe("Save snapshot");
	});

	it("applies entries in order — core first so plugins cannot shadow chrome keys", () => {
		const shadow: RegistryEntry = {
			// Illegal: writes a `studio.*` key from a plugin namespace.
			namespace: "evil",
			en: { "studio.publish": "HACKED" },
		};
		const violations: Array<[string, string]> = [];
		const catalog = mergeCatalog(
			[studioEntry, shadow],
			"en",
			EMPTY_LOADED,
			(ns, key) => violations.push([ns, key]),
		);
		// The shadow key is dropped by the namespace guard; core value survives.
		expect(catalog["studio.publish"]).toBe("Publish");
		expect(violations).toEqual([["evil", "studio.publish"]]);
	});

	it("drops + reports keys outside a plugin's own namespace", () => {
		const offender: RegistryEntry = {
			namespace: "versionHistory",
			en: {
				"versionHistory.ok": "kept",
				"other.bad": "dropped",
			},
		};
		const violations: Array<[string, string]> = [];
		const catalog = mergeCatalog([offender], "en", EMPTY_LOADED, (ns, key) =>
			violations.push([ns, key]),
		);
		expect(catalog["versionHistory.ok"]).toBe("kept");
		expect(catalog["other.bad"]).toBeUndefined();
		expect(violations).toEqual([["versionHistory", "other.bad"]]);
	});

	it("exempts reserved core namespaces (studio, assetManager) from the prefix guard", () => {
		const assetManagerEntry: RegistryEntry = {
			namespace: "assetManager",
			// Flat/legacy keys that don't strictly start with `assetManager.`
			en: { "assetManager.unsplash.theme.nature": "Nature" },
		};
		const violations: string[] = [];
		const catalog = mergeCatalog(
			[assetManagerEntry],
			"en",
			EMPTY_LOADED,
			(ns) => violations.push(ns),
		);
		expect(catalog["assetManager.unsplash.theme.nature"]).toBe("Nature");
		expect(violations).toEqual([]);
	});

	it("uses a resolved lazy pack over English for the active locale", () => {
		const loaded = new Map<string, MessageBundle>([
			[
				loadedPackKey("versionHistory", "zh"),
				{ "versionHistory.action.save": "保存快照" },
			],
		]);
		const catalog = mergeCatalog([pluginEntry], "zh", loaded);
		expect(catalog["versionHistory.action.save"]).toBe("保存快照");
		// A key absent from the pack falls back to the English baseline.
		expect(catalog["versionHistory.list.empty"]).toBe("No snapshots yet.");
	});

	it("falls back to English when no pack is loaded for the locale", () => {
		const catalog = mergeCatalog([pluginEntry], "zh", EMPTY_LOADED);
		expect(catalog["versionHistory.action.save"]).toBe("Save snapshot");
	});

	it("resolves last-write-wins within a namespace", () => {
		const first: RegistryEntry = {
			namespace: "exportHtml",
			en: { "exportHtml.action.download": "Download" },
		};
		const second: RegistryEntry = {
			namespace: "exportHtml",
			en: { "exportHtml.action.download": "Download HTML" },
		};
		const catalog = mergeCatalog([first, second], "en", EMPTY_LOADED);
		expect(catalog["exportHtml.action.download"]).toBe("Download HTML");
	});
});

describe("braceFormatter", () => {
	it("interpolates known {tokens}", () => {
		expect(braceFormatter("Saved {n} ago", { n: 5 }, "en")).toBe("Saved 5 ago");
	});

	it("leaves unknown tokens literal (no throw)", () => {
		expect(braceFormatter("Hi {name}", {}, "en")).toBe("Hi {name}");
	});

	it("coerces numbers and supports multiple tokens", () => {
		expect(braceFormatter("{a} of {b}", { a: 2, b: "ten" }, "en")).toBe(
			"2 of ten",
		);
	});
});
