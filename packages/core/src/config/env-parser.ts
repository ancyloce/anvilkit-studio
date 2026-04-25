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
 * 1. **Explicit type prefixes** (new) — `num:1`, `bool:true`, and
 *    `str:123` pin the coerced type regardless of the heuristics
 *    below. Use these to disambiguate integer fields that need
 *    value `0` or `1` (`ANVILKIT_AI__MAX_RETRIES=num:1`), force a
 *    string literal that looks numeric
 *    (`ANVILKIT_BRANDING__APP_NAME=str:404`), or spell an explicit
 *    boolean (`ANVILKIT_FEATURES__ENABLE_EXPORT=bool:1`).
 * 2. **Boolean aliases** — `"true"` and `"1"` become `true`; `"false"`
 *    and `"0"` become `false`. This follows the `DEBUG=1` convention
 *    operators expect and matches the spec in `core-011`.
 * 3. **Finite numbers** — if `Number(value)` is finite (rejecting
 *    `"NaN"`, `"Infinity"`, `""`, and whitespace-only strings), the
 *    numeric value is used.
 * 4. **String fallback** — anything else is passed through verbatim.
 *
 * The `"1"` ↔ `true` alias is intentional: env vars that feed integer
 * fields (e.g. `ANVILKIT_AI__MAX_RETRIES=1`) cannot be represented
 * via the `"1"` literal and must use the explicit `num:` prefix
 * (or `"2"` and higher for unambiguous integers). This is a
 * documented trade-off — it lets the more common `FEATURES__*=1`
 * case work the way operators expect while keeping integer `0` / `1`
 * reachable for the operators who need it.
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
	// Explicit type prefixes take the highest priority so operators
	// can always escape the heuristics below. The prefix itself is
	// stripped; anything after the colon is interpreted according to
	// the pinned type.
	if (raw.startsWith("str:")) {
		return raw.slice(4);
	}
	if (raw.startsWith("num:")) {
		const trimmed = raw.slice(4).trim();
		const asNumber = Number(trimmed);
		// An invalid `num:` value is a loud error rather than a silent
		// fall-through to string — the operator explicitly asked for a
		// number.
		if (trimmed.length === 0 || !Number.isFinite(asNumber)) {
			throw new TypeError(
				`parseStudioEnv: value "${raw}" used the num: prefix but is not a finite number`,
			);
		}
		return asNumber;
	}
	if (raw.startsWith("bool:")) {
		const tail = raw.slice(5).trim().toLowerCase();
		if (tail === "true" || tail === "1") {
			return true;
		}
		if (tail === "false" || tail === "0") {
			return false;
		}
		throw new TypeError(
			`parseStudioEnv: value "${raw}" used the bool: prefix but is not "true"/"false"/"1"/"0"`,
		);
	}

	// Boolean aliases first — `"1"` matches both the boolean and the
	// number rules, and operator ergonomics around `DEBUG=1` / `FLAG=0`
	// argue for boolean winning. Operators who need integer `0`/`1`
	// specifically can reach for the `num:` prefix above.
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
 * needed, and assign `value` at the leaf.
 *
 * Collisions between a scalar and a nested object at the same path
 * are **loud**: setting both `ANVILKIT_FEATURES=1` and
 * `ANVILKIT_FEATURES__ENABLE_EXPORT=1` throws a `TypeError` instead
 * of silently letting one overwrite the other based on env iteration
 * order. Schema validation would eventually reject the scalar form
 * anyway — failing at parse time with the exact colliding paths
 * saves the operator a debugging detour through `StudioConfigError`
 * output.
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
			existing !== undefined &&
			typeof existing === "object" &&
			!Array.isArray(existing)
		) {
			node = existing as Record<string, unknown>;
			continue;
		}
		if (existing !== undefined) {
			throw new TypeError(
				`parseStudioEnv: env vars collide at path "${path
					.slice(0, i + 1)
					.join(
						".",
					)}" — a scalar value and a nested object cannot coexist. Remove one of the conflicting ANVILKIT_* env vars.`,
			);
		}
		const next: Record<string, unknown> = {};
		node[key] = next;
		node = next;
	}
	const leafKey = path[path.length - 1] as string;
	const existingLeaf = node[leafKey];
	if (
		existingLeaf !== undefined &&
		typeof existingLeaf === "object" &&
		existingLeaf !== null &&
		!Array.isArray(existingLeaf)
	) {
		throw new TypeError(
			`parseStudioEnv: env vars collide at path "${path.join(
				".",
			)}" — a scalar value and a nested object cannot coexist. Remove one of the conflicting ANVILKIT_* env vars.`,
		);
	}
	node[leafKey] = value;
}

/**
 * Parse an environment-variable bag into a {@link DeepPartial} of
 * {@link StudioConfig}.
 *
 * Pure function — accepts the env bag as a parameter so tests can
 * pass synthetic inputs without mutating `process.env`.
 *
 * @param env - The env bag to walk. Defaults to `process.env` when
 * that global exists, otherwise an empty object.
 * @returns A partial config shape. Keys that do not match the
 * `ANVILKIT_` prefix and keys whose value is `undefined` are skipped.
 * @throws {TypeError} When two `ANVILKIT_*` env vars collide on the
 * same path — e.g. setting both `ANVILKIT_FEATURES=1` and
 * `ANVILKIT_FEATURES__ENABLE_EXPORT=1` (a scalar and a nested object
 * cannot coexist at the same key). Also thrown when an explicit
 * `num:` / `bool:` type prefix carries an uncoercible value, or when
 * the env var name contains an empty nested path segment. These cases
 * are operator-actionable: the message names the bad path or key so
 * the host process can be reconfigured.
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
		if (segments.some((segment) => segment.length === 0)) {
			throw new TypeError(
				`parseStudioEnv: env var "${rawKey}" contains an empty path segment. Use "${SEPARATOR}" only between non-empty path parts.`,
			);
		}

		const path = segments.map(segmentToCamelCase);
		setNested(result, path, coerceValue(rawValue));
	}

	return result as DeepPartial<StudioConfig>;
}
