/**
 * @file `semver` — the hand-rolled semver range matcher used to gate
 * plugin `coreVersion` declarations against the installed
 * {@link CORE_VERSION}.
 *
 * Extracted from `compile-plugins.ts` (review finding A-5) so the
 * range-matching logic lives apart from the compile pipeline. Pure,
 * React-free, and Puck-free — `src/runtime/` engine boundary preserved
 * (`check:react-free-runtime`).
 *
 * Supports the four forms Studio plugins use: exact, caret (`^`),
 * tilde (`~`), and bare prefix wildcard (`"0"` / `"0.1"`). Malformed
 * input returns `false` so a typo surfaces as a loud "coreVersion does
 * not match" error instead of a silent accept.
 */

import { CORE_VERSION } from "./version.js";

/**
 * Parsed semver tuple. `prerelease` segments are split on `.` and
 * kept as a mixed string / number array — numeric segments compare
 * numerically, string segments compare lexicographically, matching
 * the semver 2.0 precedence rules.
 */
interface ParsedSemver {
	readonly major: number;
	readonly minor: number;
	readonly patch: number;
	readonly prerelease: readonly (string | number)[];
}

/**
 * Parse a semver-ish string into its components. Returns `null` on
 * malformed input so callers can treat unparseable ranges as
 * unsatisfied (loud failure at the call site, not silent truthy).
 *
 * The regex mirrors the "strict" production in the semver spec's
 * BNF, minus the build metadata suffix — plugins do not use `+build`
 * tags and accepting them complicates range semantics without
 * payoff.
 */
function parseSemver(input: string): ParsedSemver | null {
	const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(
		input.trim(),
	);
	if (match === null) {
		return null;
	}
	const [, majorS, minorS, patchS, prereleaseS] = match;
	const prerelease: (string | number)[] = [];
	if (prereleaseS !== undefined) {
		for (const segment of prereleaseS.split(".")) {
			if (segment.length === 0) {
				return null;
			}
			prerelease.push(/^\d+$/.test(segment) ? Number(segment) : segment);
		}
	}
	return {
		major: Number(majorS),
		minor: Number(minorS),
		patch: Number(patchS),
		prerelease,
	};
}

/**
 * Compare two parsed semver tuples per the semver 2.0 precedence
 * rules. Returns a negative number, zero, or a positive number in
 * the style of `Array.prototype.sort`.
 */
function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
	if (a.major !== b.major) return a.major - b.major;
	if (a.minor !== b.minor) return a.minor - b.minor;
	if (a.patch !== b.patch) return a.patch - b.patch;

	// A version without prerelease > a version with prerelease.
	if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
	if (a.prerelease.length === 0) return 1;
	if (b.prerelease.length === 0) return -1;

	const min = Math.min(a.prerelease.length, b.prerelease.length);
	for (let i = 0; i < min; i++) {
		// `i < min <= length`, so the element is present — the assertion
		// only strips the `| undefined` `noUncheckedIndexedAccess` adds.
		const segA: string | number = a.prerelease[i] as string | number;
		const segB: string | number = b.prerelease[i] as string | number;
		const numA = typeof segA === "number";
		const numB = typeof segB === "number";
		if (numA && numB) {
			// `numA && numB` already narrows both to `number` (aliased
			// type-guard) — no re-cast needed.
			if (segA !== segB) return segA - segB;
			continue;
		}
		if (numA) return -1;
		if (numB) return 1;
		if (segA !== segB) return segA < segB ? -1 : 1;
	}
	return a.prerelease.length - b.prerelease.length;
}

/**
 * Semver range check for plugin `coreVersion` declarations.
 *
 * Supports the four forms Studio plugins use:
 *
 * 1. Exact — `"0.1.0-alpha.0"` matches only that exact version.
 * 2. Caret — `"^X.Y.Z"` matches every version in the left-most
 *    non-zero component's range. `^1.2.3` matches `>=1.2.3 <2.0.0`;
 *    `^0.2.3` matches `>=0.2.3 <0.3.0`; `^0.0.3` matches
 *    `>=0.0.3 <0.0.4`. A prerelease on the lower bound (`^0.1.0-alpha`)
 *    only restricts which *prerelease* installs qualify; a stable
 *    install in the window still matches (`0.1.3` ✓), per npm
 *    `semver.satisfies` semantics. See {@link prereleaseAllowed}.
 * 3. Tilde — `"~X.Y.Z"` matches every version with the same
 *    `[major, minor]` tuple and `>= X.Y.Z`, with the same prerelease
 *    admission rule as caret.
 * 4. Prefix wildcard — `"X"` or `"X.Y"` (no operator) match any
 *    version starting with those components. Kept for parity with
 *    `npm install` conventions; rarely used by plugins.
 *
 * Returns `false` for malformed input so a typo surfaces as a loud
 * "coreVersion does not match" error instead of a silent accept.
 */
export function isCoreVersionCompatible(
	requested: string,
	installedRaw: string = CORE_VERSION,
): boolean {
	const installed = parseSemver(installedRaw);
	if (installed === null) {
		return false;
	}

	const trimmed = requested.trim();
	if (trimmed.length === 0) {
		return false;
	}

	// Exact match short-circuit: a literal version string is accepted
	// only when it parses identically to the installed tuple.
	if (!/^[\^~]/.test(trimmed) && /^\d+\.\d+\.\d+/.test(trimmed)) {
		const exact = parseSemver(trimmed);
		if (exact === null) return false;
		return compareSemver(exact, installed) === 0;
	}

	// Operator-prefixed ranges.
	if (trimmed.startsWith("^")) {
		return satisfiesCaret(trimmed.slice(1).trim(), installed);
	}
	if (trimmed.startsWith("~")) {
		return satisfiesTilde(trimmed.slice(1).trim(), installed);
	}

	// Prefix wildcard fallback: `"0"` / `"0.1"` etc.
	return satisfiesPrefix(trimmed, installed);
}

/**
 * node-semver's prerelease admission rule, the corner this module used
 * to get wrong. A build that itself carries a prerelease tag only
 * satisfies a range when the matching comparator shares its
 * `[major, minor, patch]` tuple *and* also carries a prerelease. A
 * stable release is never gated by a prerelease that appears only on a
 * range's lower bound: `0.1.3` satisfies `^0.1.0-alpha` exactly like
 * npm's `semver.satisfies`, because the prerelease restriction is about
 * the version under test, not the range. The earlier implementation
 * required every match to share the range's tuple whenever the range
 * carried a prerelease, which wrongly rejected stable `0.1.3` against
 * `^0.1.0-alpha` and stalled `<Studio>` with an opaque compat error.
 */
function prereleaseAllowed(
	base: ParsedSemver,
	installed: ParsedSemver,
): boolean {
	if (installed.prerelease.length === 0) {
		return true;
	}
	if (base.prerelease.length === 0) {
		return false;
	}
	return (
		installed.major === base.major &&
		installed.minor === base.minor &&
		installed.patch === base.patch
	);
}

/**
 * Caret range: `^X.Y.Z` matches `>= X.Y.Z` up to (but not including)
 * the next version that bumps the left-most non-zero component. A
 * prerelease on the range's lower bound only narrows which *prerelease*
 * installs qualify (see {@link prereleaseAllowed}); stable installs in
 * the `[lower, upper)` window always pass — so `^0.1.0-alpha` still
 * keeps `0.2.0-alpha` out (upper bound) while letting `0.1.3` in.
 */
function satisfiesCaret(range: string, installed: ParsedSemver): boolean {
	const base = parseSemver(range);
	if (base === null) return false;

	// Lower bound (prerelease-aware compare).
	if (compareSemver(installed, base) < 0) return false;

	// Upper bound: bump the left-most non-zero component.
	let withinUpper: boolean;
	if (base.major > 0) {
		withinUpper = installed.major === base.major;
	} else if (base.minor > 0) {
		withinUpper = installed.major === 0 && installed.minor === base.minor;
	} else {
		withinUpper =
			installed.major === 0 &&
			installed.minor === 0 &&
			installed.patch === base.patch;
	}
	if (!withinUpper) return false;

	return prereleaseAllowed(base, installed);
}

/**
 * Tilde range: `~X.Y.Z` matches any `X.Y.*` release `>= X.Y.Z`. A
 * prerelease on the range's lower bound follows the same
 * {@link prereleaseAllowed} admission rule as caret.
 */
function satisfiesTilde(range: string, installed: ParsedSemver): boolean {
	const base = parseSemver(range);
	if (base === null) return false;

	if (compareSemver(installed, base) < 0) return false;
	if (installed.major !== base.major || installed.minor !== base.minor) {
		return false;
	}
	return prereleaseAllowed(base, installed);
}

/**
 * Prefix wildcard: `"0"` or `"0.1"` matches any installed version
 * starting with those components. Falls back to the exact-match
 * path when three components are present.
 */
function satisfiesPrefix(range: string, installed: ParsedSemver): boolean {
	const parts = range.split(".");
	if (parts.length === 0 || parts.length > 3) return false;
	for (const part of parts) {
		if (!/^\d+$/.test(part)) return false;
	}
	const [majorS, minorS, patchS] = parts;
	if (majorS !== undefined && Number(majorS) !== installed.major) {
		return false;
	}
	if (minorS !== undefined && Number(minorS) !== installed.minor) {
		return false;
	}
	if (patchS !== undefined && Number(patchS) !== installed.patch) {
		return false;
	}
	// Prefix ranges without a prerelease suffix exclude prereleases,
	// matching npm's default behavior.
	return installed.prerelease.length === 0;
}
