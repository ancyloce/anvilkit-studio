import { MAX_PROP_DEPTH } from "./constants.js";

export type NonSerializableHit = {
	path: (string | number)[];
	reason: string;
};

/**
 * Walks an arbitrary value depth-first and returns the first
 * non-JSON-serialisable leaf it finds, with the full structural path
 * to that leaf. Returns null when the value round-trips through JSON.
 *
 * `ancestors` tracks the active recursion path only — entries are
 * removed on the way back up so that a value shared by sibling
 * subtrees (a perfectly serialisable DAG) is not misreported as a
 * cycle. True self-references still trip the check on the way down.
 *
 * Shared between `validateAiOutput` (which joins the path with `.`
 * for `AiValidationIssue.path: string`) and `validateComponentConfig`
 * (which preserves the structural array shape on
 * `ValidationIssue.path: (string|number)[]`).
 */
export function findNonSerializablePath(
	value: unknown,
	path: readonly (string | number)[],
	ancestors: WeakSet<object>,
	depth: number,
): NonSerializableHit | null {
	if (value === null || value === undefined) return null;
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean") return null;
	if (t === "function") {
		return { path: [...path], reason: "function" };
	}
	if (t === "symbol") {
		return { path: [...path], reason: "symbol" };
	}
	if (t === "bigint") {
		return { path: [...path], reason: "bigint" };
	}
	if (t !== "object") {
		return { path: [...path], reason: t };
	}
	if (depth > MAX_PROP_DEPTH) {
		return { path: [...path], reason: "exceeds-max-depth" };
	}
	const obj = value as object;
	if (ancestors.has(obj)) {
		return { path: [...path], reason: "circular" };
	}
	ancestors.add(obj);
	try {
		if (Array.isArray(value)) {
			for (let i = 0; i < value.length; i++) {
				const hit = findNonSerializablePath(
					value[i],
					[...path, i],
					ancestors,
					depth + 1,
				);
				if (hit) return hit;
			}
			return null;
		}
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			const hit = findNonSerializablePath(
				v,
				[...path, k],
				ancestors,
				depth + 1,
			);
			if (hit) return hit;
		}
		return null;
	} finally {
		ancestors.delete(obj);
	}
}
