/**
 * @file Tests for the canvas drop target-prop resolvers.
 */

import type { ComponentData, Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
	resolveImageTargetProp,
	resolveTextTargetProp,
} from "../resolve-target-prop";

const config = {
	components: {
		Text: { fields: { text: { type: "textarea" } } },
		Image: { fields: { src: { type: "external" } } },
		Hero: {
			fields: {
				heading: { type: "text" },
				backgroundImage: { type: "external" },
				rank: { type: "number" },
			},
		},
		Card: { fields: { coverImage: { type: "select" } } },
	},
} as unknown as Config;

function item(type: string, props: Record<string, unknown>): ComponentData {
	return { type, props: { id: `${type}-1`, ...props } } as ComponentData;
}

describe("resolveTextTargetProp", () => {
	it("matches the locked Text/text predicate without field metadata", () => {
		expect(
			resolveTextTargetProp(item("Text", { text: "hi" }), {
				components: {},
			} as unknown as Config),
		).toBe("text");
	});

	it("rejects a Text whose text prop is not a string", () => {
		expect(resolveTextTargetProp(item("Text", { text: 7 }), config)).toBeNull();
	});

	it("accepts a candidate prop backed by a text field", () => {
		expect(
			resolveTextTargetProp(item("Hero", { heading: "Big" }), config),
		).toBe("heading");
	});

	it("rejects a candidate prop whose field is not text-like", () => {
		expect(
			resolveTextTargetProp(item("Hero", { rank: "first" }), config),
		).toBeNull();
	});

	it("returns null for nullish items", () => {
		expect(resolveTextTargetProp(null, config)).toBeNull();
		expect(resolveTextTargetProp(undefined, config)).toBeNull();
	});
});

describe("resolveImageTargetProp", () => {
	it("always targets src on the Image component", () => {
		expect(resolveImageTargetProp(item("Image", {}), config)).toBe("src");
	});

	it("matches a background-image prop backed by an external field", () => {
		expect(
			resolveImageTargetProp(
				item("Hero", { backgroundImage: "old.png" }),
				config,
			),
		).toBe("backgroundImage");
	});

	it("accepts an allowlisted prop with no registered field", () => {
		expect(
			resolveImageTargetProp(item("Banner", { bgImage: undefined }), config),
		).toBe("bgImage");
	});

	it("rejects an allowlisted prop whose field is not image-like", () => {
		expect(
			resolveImageTargetProp(item("Card", { coverImage: "x.png" }), config),
		).toBeNull();
	});

	it("returns null for nullish items", () => {
		expect(resolveImageTargetProp(null, config)).toBeNull();
	});
});
