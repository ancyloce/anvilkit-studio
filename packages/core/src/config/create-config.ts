/**
 * @file The layered {@link StudioConfig} factory — the entry point
 * host apps use to turn a partial override object and a pile of env
 * vars into a fully validated Studio configuration.
 *
 * ### Architecture §9 layering model
 *
 * Four layers exist in theory; this file owns the first three. Layer
 * 4 (plugin-local options) is deliberately **not** merged into the
 * central config — plugin factories take their own options objects
 * at the call site, so options stay colocated with the plugin that
 * uses them and cannot collide across plugins.
 *
 * | Layer | Source                                           | Who owns it |
 * | ----- | ------------------------------------------------ | ----------- |
 * | 1     | {@link StudioConfigSchema} defaults              | this file   |
 * | 2     | `ANVILKIT_*` env vars via {@link parseStudioEnv} | this file   |
 * | 3     | `overrides` argument passed by the host app      | this file   |
 * | 4     | Plugin factory options                           | plugin      |
 *
 * ### Precedence
 *
 * Layers are passed to {@link deepMerge} in ascending order, so
 * **later layers win**. Layer 3 (explicit host overrides) therefore
 * beats Layer 2 (env), which in turn beats Layer 1 (defaults). A
 * single value from Layer 3 does **not** wipe an entire section —
 * `deepMerge` preserves sibling keys at every nesting level.
 *
 * ### Array semantics
 *
 * `deepMerge` **replaces** arrays rather than concatenating them
 * (see its file-level docs). That is the correct choice for layered
 * config — a host that overrides `experimental.plugins` wants the
 * exact array they passed, not the defaults tail-concatenated.
 *
 * ### Error surface
 *
 * Every validation failure is wrapped in {@link StudioConfigError}
 * with the underlying `ZodError` attached via the ES2022 `cause`
 * field. The message is a purpose-built, stable format —
 * `z.prettifyError` is available but its shape is not contractually
 * frozen across Zod point releases, and tests string-match on the
 * message. Keeping the format inline makes the contract explicit.
 *
 * ### Zero React, zero React Server Component imports
 *
 * This file is importable from any runtime context — server
 * components, edge runtimes, Node, browser. It only reads
 * `process.env` indirectly, through {@link parseStudioEnv}'s lazy
 * default, so it never throws a `ReferenceError` at import time.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-011-config-runtime.md | core-011}
 */

import { deepMerge, type DeepPartial } from "@anvilkit/utils";
import { z } from "zod";

import { StudioConfigError } from "../runtime/errors.js";
import type { StudioConfig } from "../types/config.js";
import { parseStudioEnv } from "./env-parser.js";
import { StudioConfigSchema } from "./schema.js";

/**
 * Options bag for {@link createStudioConfig}.
 *
 * A nested options object (instead of a second positional arg for
 * the env bag directly) leaves room for future knobs —
 * deprecation handling, plugin discovery overrides, strict mode
 * toggles — without breaking the public signature.
 */
export interface CreateStudioConfigOptions {
	/**
	 * Environment variable bag to consume for Layer 2.
	 *
	 * Defaults to `process.env` when that global is available. Tests
	 * and non-Node runtimes can inject a synthetic bag so the factory
	 * stays deterministic and never touches the real process env.
	 */
	readonly env?: Record<string, string | undefined>;
}

/**
 * Build a fully validated {@link StudioConfig} by layering schema
 * defaults, env vars, and explicit host overrides — in that order.
 *
 * ### Layering
 *
 * 1. **Layer 1 — defaults.** `StudioConfigSchema.parse({})` produces
 *    the fully-populated default shape. This is the base target for
 *    {@link deepMerge}, so missing keys in higher layers fall back
 *    to real values rather than `undefined`.
 * 2. **Layer 2 — env.** {@link parseStudioEnv} walks the env bag
 *    for `ANVILKIT_*` entries and produces a `DeepPartial` patch.
 * 3. **Layer 3 — host overrides.** The caller's `overrides` argument
 *    is treated as an opaque `DeepPartial` and layered last, so it
 *    beats both defaults and env.
 *
 * After merging, the result is re-parsed through the schema. This
 * re-parse is load-bearing: it re-runs every validator (URL format,
 * integer bounds, enum membership) against the merged shape and
 * catches env-induced type mismatches that layers 1 and 3 would
 * have passed cleanly on their own.
 *
 * ### Errors
 *
 * Any `ZodError` raised during the final parse is wrapped in a
 * {@link StudioConfigError} whose message lists every failing field
 * in `path: reason` form. The underlying `ZodError` is attached via
 * `cause` so host apps that need structured access can drill in
 * with `err.cause as z.ZodError`.
 *
 * @param overrides - Layer 3 host overrides.
 * @param opts - Optional {@link CreateStudioConfigOptions} bag.
 * @returns The merged, validated {@link StudioConfig}.
 *
 * @example
 * ```ts
 * const config = createStudioConfig({
 *   features: { enableExport: true },
 *   theme: { defaultMode: "dark" },
 * });
 * ```
 *
 * @example
 * ```ts
 * // Test-friendly: inject a synthetic env bag.
 * const config = createStudioConfig(undefined, {
 *   env: { ANVILKIT_THEME__DEFAULT_MODE: "dark" },
 * });
 * ```
 */
export function createStudioConfig(
	overrides?: DeepPartial<StudioConfig>,
	opts?: CreateStudioConfigOptions,
): StudioConfig {
	// Layer 1: schema defaults. Always a fully-populated StudioConfig
	// — we rely on this for the deepMerge target so holes in layers
	// 2 and 3 are backed by real values.
	const layer1 = StudioConfigSchema.parse({});

	// Layer 2: env. Pure function, safe to call with opts?.env being
	// undefined — parseStudioEnv falls back to process.env (or {} in
	// non-Node runtimes).
	const layer2 = parseStudioEnv(opts?.env);

	// Layer 3: host overrides. Forwarded to deepMerge as-is;
	// `undefined` sources are ignored by deepMerge so no guard is
	// needed here.
	const merged = deepMerge(layer1, layer2, overrides);

	// Re-validate. The merge may have introduced bad types (env
	// coercion is best-effort) or unknown top-level keys (a typo in
	// an env var or override), so we run the full schema again.
	try {
		return StudioConfigSchema.parse(merged);
	} catch (error) {
		if (error instanceof z.ZodError) {
			throw new StudioConfigError(formatZodIssues(error), { cause: error });
		}
		// Non-Zod errors are unexpected — rethrow unchanged so the
		// host sees the original stack.
		throw error;
	}
}

/**
 * Render a {@link z.ZodError}'s issue list into the stable,
 * test-matchable format promised in the task spec:
 *
 * ```
 * StudioConfig validation failed:
 *   - features.enableExport: expected boolean, received string
 *   - ai.maxRetries: Number must be less than or equal to 10
 * ```
 *
 * A root-level error (empty `path`) is rendered as `<root>` so the
 * output has a non-empty prefix even when the whole object is of
 * the wrong shape.
 */
function formatZodIssues(error: z.ZodError): string {
	const lines = error.issues.map((issue) => {
		const path =
			issue.path.length > 0
				? renderZodPath(issue.path)
				: "<root>";
		return `  - ${path}: ${issue.message}`;
	});
	return `StudioConfig validation failed:\n${lines.join("\n")}`;
}

/**
 * Render a Zod issue path so dotted or otherwise-ambiguous keys stay
 * unambiguous in the rendered error message. Numeric segments become
 * `[0]` / `[1]` (array indices), keys that contain a `.` — legal
 * inside `experimental`'s `z.record(z.string(), z.unknown())` because
 * the record key type is just `string` — are wrapped in brackets with
 * the inner quotes escaped. Everything else joins with `.` so the
 * common case reads the way operators expect.
 */
function renderZodPath(path: readonly PropertyKey[]): string {
	let out = "";
	for (const segment of path) {
		if (typeof segment === "number") {
			out += `[${segment}]`;
			continue;
		}
		const asString = String(segment);
		if (/[.[\]"]/.test(asString)) {
			const escaped = asString.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			out += `["${escaped}"]`;
			continue;
		}
		if (out.length > 0) {
			out += ".";
		}
		out += asString;
	}
	return out;
}
