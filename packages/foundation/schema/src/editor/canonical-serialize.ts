/**
 * @file Canonical serialization and byte measurement
 * (PLAN-0020 CORE-P0-006; DD-0019 §7.3, §23.2; decision item 9).
 *
 * The frozen canonical rules:
 *
 * 1. serialize the **compacted** state (`compactAuthoringState`);
 * 2. JSON with **lexicographically sorted object keys** at every
 *    level (code-unit order, i.e. `Array.prototype.sort` default);
 * 3. **no whitespace**;
 * 4. arrays keep semantic order;
 * 5. byte count is the **UTF-8** length of that text.
 *
 * This is the single measurement function for the §7.3 warn/hard
 * byte limits and the §23.2 byte-stability requirement. Two states
 * that differ only in key insertion order serialize identically.
 */

import type { AuthoringStateV1 } from "@anvilkit/contracts/editor";
import { compactAuthoringState } from "./compact.js";

function stableStringify(value: unknown): string | undefined {
	if (value === null) {
		return "null";
	}
	switch (typeof value) {
		case "string":
		case "number":
		case "boolean":
			return JSON.stringify(value);
		case "object":
			break;
		default:
			// undefined, function, symbol, bigint: JSON semantics — omitted
			// by callers; bigint would throw in JSON.stringify too.
			return undefined;
	}
	if (Array.isArray(value)) {
		const parts = value.map((entry) => stableStringify(entry) ?? "null");
		return `[${parts.join(",")}]`;
	}
	const entries = Object.entries(value as Record<string, unknown>)
		.map(([key, entry]) => [key, stableStringify(entry)] as const)
		.filter((pair): pair is readonly [string, string] => pair[1] !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([key, text]) => `${JSON.stringify(key)}:${text}`).join(",")}}`;
}

/** The canonical serialization result. */
export interface CanonicalAuthoringSerialization {
	readonly text: string;
	readonly bytes: number;
}

const encoder = new TextEncoder();

/**
 * Canonically serialize an authoring state and measure its UTF-8
 * byte length. Deterministic: permuted key insertion orders produce
 * identical bytes.
 */
export function canonicalSerializeAuthoring(
	state: AuthoringStateV1,
): CanonicalAuthoringSerialization {
	const text = stableStringify(compactAuthoringState(state)) ?? "null";
	return { text, bytes: encoder.encode(text).length };
}

/**
 * Canonically serialize an arbitrary JSON-safe fragment (component
 * definitions, rich-text values, commands) for per-entity byte
 * limits. Same rules, no compaction step.
 */
export function canonicalSerializeFragment(
	value: unknown,
): CanonicalAuthoringSerialization {
	const text = stableStringify(value) ?? "null";
	return { text, bytes: encoder.encode(text).length };
}
