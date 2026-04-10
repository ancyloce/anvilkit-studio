/**
 * @file Runtime tests for the Studio error taxonomy.
 *
 * Every subclass must:
 * - Be an instance of `StudioError`, `Error`, and itself.
 * - Expose its stable `code` and `name` strings.
 * - Propagate `message` and (where applicable) the `cause` chain.
 * - Carry the discriminator field (`pluginId` / `formatId`) it was
 *   constructed with.
 */

import { describe, expect, it } from "vitest";

import {
	StudioConfigError,
	StudioError,
	StudioExportError,
	StudioPluginError,
} from "../errors.js";

describe("StudioError taxonomy", () => {
	it("StudioPluginError extends StudioError and Error", () => {
		const err = new StudioPluginError("com.example.plugin", "boom");

		expect(err).toBeInstanceOf(StudioPluginError);
		expect(err).toBeInstanceOf(StudioError);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("StudioPluginError");
		expect(err.code).toBe("StudioPluginError");
		expect(err.pluginId).toBe("com.example.plugin");
		expect(err.message).toBe("boom");
	});

	it("StudioConfigError extends StudioError and Error", () => {
		const err = new StudioConfigError("bad config");

		expect(err).toBeInstanceOf(StudioConfigError);
		expect(err).toBeInstanceOf(StudioError);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("StudioConfigError");
		expect(err.code).toBe("StudioConfigError");
	});

	it("StudioExportError extends StudioError and carries formatId", () => {
		const err = new StudioExportError("html", "render failed");

		expect(err).toBeInstanceOf(StudioExportError);
		expect(err).toBeInstanceOf(StudioError);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("StudioExportError");
		expect(err.code).toBe("StudioExportError");
		expect(err.formatId).toBe("html");
		expect(err.message).toBe("render failed");
	});

	it("propagates the `cause` chain via ES2022 ErrorOptions", () => {
		const root = new Error("root cause");
		const err = new StudioPluginError("com.example.plugin", "wrapped", {
			cause: root,
		});

		expect(err.cause).toBe(root);
	});

	it("subclasses do not cross-match each other via instanceof", () => {
		const plugin = new StudioPluginError("p", "m");
		const config = new StudioConfigError("m");
		const exp = new StudioExportError("f", "m");

		expect(plugin).not.toBeInstanceOf(StudioConfigError);
		expect(plugin).not.toBeInstanceOf(StudioExportError);
		expect(config).not.toBeInstanceOf(StudioPluginError);
		expect(config).not.toBeInstanceOf(StudioExportError);
		expect(exp).not.toBeInstanceOf(StudioPluginError);
		expect(exp).not.toBeInstanceOf(StudioConfigError);
	});
});
