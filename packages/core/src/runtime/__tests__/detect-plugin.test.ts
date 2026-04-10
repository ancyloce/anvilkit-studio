/**
 * @file Runtime tests for the `isStudioPlugin` / `isPuckPlugin`
 * structural guards.
 *
 * The two guards must be mutually exclusive: no value should pass
 * both checks, otherwise `compilePlugins` would double-register a
 * plugin into both code paths.
 */

import { describe, expect, it } from "vitest";

import type { StudioPlugin } from "../../types/plugin.js";
import { isPuckPlugin, isStudioPlugin } from "../detect-plugin.js";

function makeStudioPlugin(): StudioPlugin {
	return {
		meta: {
			id: "com.example.telemetry",
			name: "Telemetry",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		},
		register() {
			return { meta: { ...this.meta } };
		},
	};
}

describe("isStudioPlugin", () => {
	it("returns true for a minimal valid plugin", () => {
		expect(isStudioPlugin(makeStudioPlugin())).toBe(true);
	});

	it("returns false for an empty object", () => {
		expect(isStudioPlugin({})).toBe(false);
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["string", "plugin"],
		["number", 42],
		["array", []],
		["function", () => undefined],
	])("returns false for %s", (_label, value) => {
		expect(isStudioPlugin(value)).toBe(false);
	});

	it("returns false when `meta.id` is missing", () => {
		expect(
			isStudioPlugin({
				meta: { coreVersion: "^0.1.0-alpha" },
				register: () => ({}),
			}),
		).toBe(false);
	});

	it("returns false when `meta.coreVersion` is missing", () => {
		expect(
			isStudioPlugin({
				meta: { id: "com.example.x" },
				register: () => ({}),
			}),
		).toBe(false);
	});

	it("returns false when `register` is not a function", () => {
		expect(
			isStudioPlugin({
				meta: { id: "com.example.x", coreVersion: "^0.1.0-alpha" },
				register: "not-a-function",
			}),
		).toBe(false);
	});

	it("returns false when `meta.id` is an empty string", () => {
		expect(
			isStudioPlugin({
				meta: { id: "", coreVersion: "^0.1.0-alpha" },
				register: () => ({}),
			}),
		).toBe(false);
	});
});

describe("isPuckPlugin", () => {
	it("returns true for a plugin with an `overrides` bag", () => {
		expect(isPuckPlugin({ overrides: { header: () => null } })).toBe(true);
	});

	it("returns true for a plugin with `fieldTransforms`", () => {
		expect(isPuckPlugin({ fieldTransforms: { text: () => null } })).toBe(true);
	});

	it("returns true for a plugin with a `render` function", () => {
		expect(isPuckPlugin({ render: () => null })).toBe(true);
	});

	it("returns false for an empty object", () => {
		expect(isPuckPlugin({})).toBe(false);
	});

	it("returns false for a StudioPlugin (discriminated by `register`)", () => {
		expect(isPuckPlugin(makeStudioPlugin())).toBe(false);
	});

	it("returns false for a plain object with only a `name`", () => {
		expect(isPuckPlugin({ name: "looks-pucky" })).toBe(false);
	});

	it.each([
		["null", null],
		["undefined", undefined],
		["array", []],
	])("returns false for %s", (_label, value) => {
		expect(isPuckPlugin(value)).toBe(false);
	});
});

describe("guard mutual exclusion", () => {
	it("no value passes both guards", () => {
		const candidates: unknown[] = [
			makeStudioPlugin(),
			{ overrides: {} },
			{ fieldTransforms: {} },
			{ render: () => null },
			{},
			null,
		];
		for (const value of candidates) {
			const studio = isStudioPlugin(value);
			const puck = isPuckPlugin(value);
			expect(studio && puck).toBe(false);
		}
	});
});
