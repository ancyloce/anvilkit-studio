/**
 * @file Layer 2 of the `StudioConfig` layering model (architecture §9).
 *
 * Walks a `Record<string, string | undefined>` of environment variables
 * and projects the ones under the `ANVILKIT_` prefix into a
 * {@link DeepPartial} shape of {@link StudioConfig}. The result is
 * handed to {@link deepMerge} inside {@link createStudioConfig} where
 * it layers on top of Layer 1 (schema defaults) and beneath Layer 3
 * (explicit host overrides).
 *
 * ### Key mapping
 *
 * The `ANVILKIT_` prefix is stripped and the remainder is split on the
 * double-underscore (`__`) separator — each segment becomes one level
 * of the output object's key path. Within a segment, a single
 * underscore marks a camelCase boundary. In other words:
 *
 * | Env var                              | Path                         |
 * | ------------------------------------ | ---------------------------- |
 * | `ANVILKIT_THEME__DEFAULT_MODE`       | `theme.defaultMode`          |
 * | `ANVILKIT_FEATURES__ENABLE_EXPORT`   | `features.enableExport`      |
 * | `ANVILKIT_AI__MAX_RETRIES`           | `ai.maxRetries`              |
 * | `ANVILKIT_EXPERIMENTAL__MY_FLAG`     | `experimental.myFlag`        |
 *
 * The camelCase conversion is tiny — lowercase the whole segment, then
 * replace `_x` with `X`. No dependency on `lodash.camelcase` or a
 * regex-heavy helper is warranted for this constrained input.
 *
 * ### Value coercion
 *
 * Env vars are strings; the schema validators below are typed. To
 * bridge the gap, each value is coerced in this priority order:
 *
 * 1. **Boolean aliases** — `"true"` and `"1"` become `true`; `"false"`
 *    and `"0"` become `false`. This follows the `DEBUG=1` convention
 *    operators expect and matches the spec in `core-011`.
 * 2. **Finite numbers** — if `Number(value)` is finite (rejecting
 *    `"NaN"`, `"Infinity"`, `""`, and whitespace-only strings), the
 *    numeric value is used.
 * 3. **String fallback** — anything else is passed through verbatim.
 *
 * The `"1"` ↔ `true` alias is intentional: env vars that feed integer
 * fields (e.g. `ANVILKIT_AI__MAX_RETRIES=1`) cannot be represented
 * via the `"1"` literal and must use `"2"` or higher. This is a
 * documented trade-off — it lets the more common `FEATURES__*=1`
 * case work the way operators expect.
 *
 * ### Unknown keys
 *
 * The parser is permissive: every `ANVILKIT_`-prefixed env var is
 * emitted into the returned partial. Strict validation happens in
 * {@link createStudioConfig}, where Zod's `strictObject` wrapper on
 * {@link StudioConfigSchema} rejects unknown top-level paths. This
 * gives host apps loud, actionable errors on typos instead of silent
 * drops — see the spec in `core-011` for the full rationale.
 *
 * ### Zero side effects at module load
 *
 * The function accepts its env bag as an argument with a lazy default
 * — `process.env` is read inside {@link defaultEnv} only when the
 * caller omits the `env` argument, so importing this file in a
 * browser bundle (where `process` may be undefined) does not trigger
 * a `ReferenceError`. Tests pass a synthetic bag and never touch
 * `process.env`.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-011-config-runtime.md | core-011}
 */

import type { DeepPartial } from "@anvilkit/utils";

import type { StudioConfig } from "../types/config.js";

/**
 * Required prefix for every env var consumed by {@link parseStudioEnv}.
 * Vars without it are skipped — this is the hard boundary between
 * Studio's config surface and the host process's arbitrary env.
 */
const PREFIX = "ANVILKIT_";

/**
 * Nested-path separator. Chosen as `__` because single-underscore is
 * the natural word boundary inside a SCREAMING_SNAKE segment and we
 * need a character sequence that can never collide with one.
 */
const SEPARATOR = "__";

/**
 * Lazy accessor for `process.env`. Called from the default-parameter
 * slot of {@link parseStudioEnv} so the module body never touches
 * `process` at import time — browser bundles that polyfill nothing
 * still import cleanly.
 *
 * `@anvilkit/core`'s tsconfig is deliberately environment-agnostic
 * (`lib: ["es2022", "DOM", "DOM.Iterable"]`, no `@types/node` in the
 * `types` array), so the bare `process` identifier is untyped. We
 * reach the Node global through `globalThis` with a narrow, local
 * cast — this keeps the file free of a runtime dependency on
 * `@types/node` while still picking up `process.env` when it exists.
 */
function defaultEnv(): Record<string, string | undefined> {
	const root = globalThis as unknown as {
		process?: { env?: Record<string, string | undefined> };
	};
	return root.process?.env ?? {};
}

/**
 * Convert one SCREAMING_SNAKE segment (e.g. `"DEFAULT_MODE"`) into
 * its camelCase equivalent (`"defaultMode"`).
 *
 * The implementation is two cheap passes: lowercase the whole string,
 * then replace every `_<letter-or-digit>` with the uppercase letter.
 * Leading / trailing underscores collapse harmlessly — the split on
 * `__` above already guarantees no empty-segment input reaches here.
 */
function segmentToCamelCase(segment: string): string {
	return segment
		.toLowerCase()
		.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

/**
 * Apply the boolean / number / string coercion rules to a raw env
 * value. Documented in the file header; kept as a standalone helper
 * so the unit tests can pin each rule individually.
 */
function coerceValue(raw: string): string | number | boolean {
	// Boolean aliases first — `"1"` matches both the boolean and the
	// number rules, and operator ergonomics around `DEBUG=1` / `FLAG=0`
	// argue for boolean winning.
	if (raw === "true" || raw === "1") {
		return true;
	}
	if (raw === "false" || raw === "0") {
		return false;
	}

	// Number next. `Number("")` and `Number("   ")` both yield `0`,
	// which is an ugly gotcha — explicitly guard against empty/
	// whitespace-only input. `"NaN"` / `"Infinity"` fail the
	// `Number.isFinite` check naturally.
	const trimmed = raw.trim();
	if (trimmed.length > 0) {
		const asNumber = Number(trimmed);
		if (Number.isFinite(asNumber)) {
			return asNumber;
		}
	}

	// Fallback: hand the raw string back to the caller unchanged.
	return raw;
}

/**
 * Walk `path` into `target`, creating intermediate plain objects as
 * needed, and assign `value` at the leaf. Intermediate nodes that
 * already exist but are not plain objects are overwritten — the env
 * parser owns the partial shape it is constructing, and a colliding
 * non-object value at a parent path indicates a malformed env set
 * that the schema validation will flag anyway.
 */
function setNested(
	target: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): void {
	let node = target;
	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i] as string;
		const existing = node[key];
		if (
			existing !== null &&
			typeof existing === "object" &&
			!Array.isArray(existing)
		) {
			node = existing as Record<string, unknown>;
			continue;
		}
		const next: Record<string, unknown> = {};
		node[key] = next;
		node = next;
	}
	const leafKey = path[path.length - 1] as string;
	node[leafKey] = value;
}

/**
 * Parse an environment-variable bag into a {@link DeepPartial} of
 * {@link StudioConfig}.
 *
 * Pure function — accepts the env bag as a parameter so tests can
 * pass synthetic inputs without mutating `process.env`. Never throws.
 *
 * @param env - The env bag to walk. Defaults to `process.env` when
 * that global exists, otherwise an empty object.
 * @returns A partial config shape. Keys that do not match the
 * `ANVILKIT_` prefix, keys whose value is `undefined`, and keys that
 * split into an empty segment are silently skipped.
 */
export function parseStudioEnv(
	env: Record<string, string | undefined> = defaultEnv(),
): DeepPartial<StudioConfig> {
	const result: Record<string, unknown> = {};

	for (const [rawKey, rawValue] of Object.entries(env)) {
		if (rawValue === undefined) {
			continue;
		}
		if (!rawKey.startsWith(PREFIX)) {
			continue;
		}

		const tail = rawKey.slice(PREFIX.length);
		if (tail.length === 0) {
			continue;
		}

		const segments = tail.split(SEPARATOR);
		// A malformed key like `ANVILKIT_A____B` (four underscores)
		// splits into `["A", "", "B"]`; skip the whole entry rather
		// than try to guess the author's intent.
		if (segments.some((segment) => segment.length === 0)) {
			continue;
		}

		const path = segments.map(segmentToCamelCase);
		setNested(result, path, coerceValue(rawValue));
	}

	return result as DeepPartial<StudioConfig>;
}
