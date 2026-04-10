/**
 * @file Compile-time type tests for `src/types/plugin.ts`.
 *
 * These tests have no meaningful runtime behavior — vitest does not
 * enforce TypeScript assertions at runtime, and `expectTypeOf` from
 * vitest is a no-op without `vitest typecheck` mode.
 *
 * Instead, every assertion in this file is enforced by `tsc --noEmit`
 * against `tsconfig.test.json` (see `packages/core/package.json`'s
 * `typecheck` script). Valid plugin shapes compile; invalid shapes
 * trigger `@ts-expect-error` comments, which themselves become errors
 * if the underlying line starts compiling — giving us bidirectional
 * safety on the plugin contract.
 *
 * The single `expect(true).toBe(true)` at the bottom exists solely so
 * vitest reports a passing test rather than warning "no tests found".
 */

import { describe, expect, it } from "vitest";

import { StudioConfigSchema } from "../../config/schema.js";
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginLifecycleHooks,
	StudioPluginMeta,
	StudioPluginRegistration,
} from "../plugin.js";

const testStudioConfig = StudioConfigSchema.parse({});

describe("StudioPlugin type contract", () => {
	it("accepts a minimal valid plugin", () => {
		const plugin: StudioPlugin = {
			meta: {
				id: "com.example.minimal",
				name: "Minimal",
				version: "1.0.0",
				coreVersion: "^0.1.0-alpha",
			},
			register() {
				return { meta: plugin.meta };
			},
		};
		void plugin;
		expect(true).toBe(true);
	});

	it("accepts an async register()", () => {
		const plugin: StudioPlugin = {
			meta: {
				id: "com.example.async",
				name: "Async",
				version: "1.0.0",
				coreVersion: "^0.1.0-alpha",
			},
			async register() {
				return { meta: plugin.meta };
			},
		};
		void plugin;
	});

	it("accepts a plugin with every lifecycle hook and artifact", () => {
		const plugin: StudioPlugin = {
			meta: {
				id: "com.example.full",
				name: "Full",
				version: "1.2.3",
				coreVersion: "^0.1.0-alpha",
				description: "Exercises every corner of the plugin contract",
			},
			register(ctx) {
				const hooks: StudioPluginLifecycleHooks = {
					onInit(innerCtx) {
						innerCtx.log("info", "init");
					},
					async onDataChange(innerCtx, data) {
						innerCtx.log("debug", "data", { rootKeys: Object.keys(data.root) });
					},
					onBeforePublish() {
						// may throw `StudioPluginError` — contract permits it
					},
					onAfterPublish: async () => {
						/* no-op */
					},
					onDestroy() {
						ctx.emit("com.example.full:destroyed");
					},
				};
				const registration: StudioPluginRegistration = {
					meta: plugin.meta,
					hooks,
					headerActions: [{ id: "full-action" }],
					exportFormats: [
						{
							id: "html",
							label: "HTML",
							extension: "html",
							mimeType: "text/html",
							async run() {
								return { content: "", filename: "page.html" };
							},
						},
					],
				};
				return registration;
			},
		};
		void plugin;
	});

	it("StudioPluginContext surfaces every required accessor", () => {
		// Assignment-level check — omitting any field fails compilation.
		const ctx: StudioPluginContext = {
			getData: () => ({ content: [], root: {} }),
			getPuckApi: () => {
				throw new Error("test stub");
			},
			studioConfig: testStudioConfig,
			log: () => {
				/* no-op */
			},
			emit: () => {
				/* no-op */
			},
		};
		void ctx;
	});

	it("StudioPluginMeta requires id, name, version, and coreVersion", () => {
		const meta: StudioPluginMeta = {
			id: "com.example.required",
			name: "Required",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		};
		void meta;

		// @ts-expect-error — `coreVersion` is required.
		const missingCoreVersion: StudioPluginMeta = {
			id: "com.example.no-core",
			name: "No core",
			version: "1.0.0",
		};
		void missingCoreVersion;

		// @ts-expect-error — `id` is required.
		const missingId: StudioPluginMeta = {
			name: "No id",
			version: "1.0.0",
			coreVersion: "^0.1.0-alpha",
		};
		void missingId;
	});

	it("StudioPlugin rejects a plugin missing `meta`", () => {
		// @ts-expect-error — `meta` is required on `StudioPlugin`.
		const invalid: StudioPlugin = {
			register() {
				return {
					meta: {
						id: "x",
						name: "x",
						version: "1.0.0",
						coreVersion: "^0.1.0-alpha",
					},
				};
			},
		};
		void invalid;
	});

	it("StudioPluginRegistration rejects an object missing `meta`", () => {
		// @ts-expect-error — `meta` is required on `StudioPluginRegistration`.
		const invalidReg: StudioPluginRegistration = {};
		void invalidReg;
	});

	it("StudioLogLevel is restricted to the four severity levels", () => {
		const level: import("../plugin.js").StudioLogLevel = "info";
		void level;

		// @ts-expect-error — `trace` is not a valid severity level.
		const invalidLevel: import("../plugin.js").StudioLogLevel = "trace";
		void invalidLevel;
	});
});
