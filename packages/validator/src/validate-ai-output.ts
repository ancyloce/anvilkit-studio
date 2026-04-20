import type {
	AiComponentSchema,
	AiValidationIssue,
	AiValidationResult,
} from "@anvilkit/core/types";
import {
	enum as enumSchema,
	looseObject,
	optional,
	record,
	string,
	unknown,
} from "zod/mini";
import { closestMatch } from "./internal/closest-match.js";
import { makeComponentPropsSchema } from "./internal/make-zod-schema.js";

const MAX_DEPTH = 16;

const assetKinds = [
	"image",
	"video",
	"font",
	"script",
	"style",
	"other",
] as const;

const assetSchema = looseObject({
	id: string(),
	kind: enumSchema(assetKinds),
	url: string(),
	meta: optional(record(string(), unknown())),
});

function buildPath(segments: readonly (string | number)[]): string {
	return segments.join(".");
}

function hasValueAtPath(
	value: Record<string, unknown>,
	path: readonly PropertyKey[],
): boolean {
	let current = value;

	for (let index = 0; index < path.length; index += 1) {
		const segment = path[index]!;

		if (typeof segment === "symbol" || !(segment in current)) {
			return false;
		}

		if (index === path.length - 1) {
			return true;
		}

		const next = current[segment];
		if (typeof next !== "object" || next === null) {
			return false;
		}

		current = next as Record<string, unknown>;
	}

	return true;
}

export function validateAiOutput(
	response: unknown,
	availableComponents: readonly AiComponentSchema[],
): AiValidationResult {
	const issues: AiValidationIssue[] = [];

	if (typeof response !== "object" || response === null) {
		issues.push({
			path: "",
			message: "[INVALID_STRUCTURE] Response must be an object.",
			severity: "error",
		});
		return { valid: false, issues };
	}

	const res = response as Record<string, unknown>;

	if (res.version !== "1") {
		issues.push({
			path: "version",
			message:
				'[UNSUPPORTED_VERSION] Expected version "1", got "' +
				String(res.version) +
				'".',
			severity: "error",
		});
	}

	if (Array.isArray(res.assets)) {
		for (let i = 0; i < res.assets.length; i++) {
			const asset = res.assets[i];
			const result = assetSchema.safeParse(asset);
			if (!result.success) {
				issues.push({
					path: buildPath(["assets", i]),
					message:
						"[INVALID_ASSET] Asset at index " +
						i +
						" is malformed: " +
						result.error.message,
					severity: "error",
				});
			}
		}
	}

	const componentMap = new Map<string, AiComponentSchema>();
	for (const comp of availableComponents) {
		componentMap.set(comp.componentName, comp);
	}
	const componentNames = availableComponents.map(
		(c: { componentName: string }) => c.componentName,
	);

	if (res.root && typeof res.root === "object" && !Array.isArray(res.root)) {
		const rootNode = res.root as Record<string, unknown>;
		// phase4-014 F-1: root.type must be exactly "__root__". Accepting
		// any other string was silent drift; plugins downstream rely on
		// the invariant.
		if (rootNode.type !== "__root__") {
			issues.push({
				path: "root.type",
				message:
					'[INVALID_ROOT_TYPE] Root node must have type "__root__", got "' +
					String(rootNode.type) +
					'".',
				severity: "error",
			});
		}
		walkNode(
			rootNode,
			["root"],
			componentMap,
			componentNames,
			issues,
			0,
		);
	} else {
		issues.push({
			path: "root",
			message: "[INVALID_STRUCTURE] Missing or invalid root node.",
			severity: "error",
		});
	}

	return {
		valid: issues.every((i) => i.severity !== "error"),
		issues,
	};
}

function walkNode(
	node: Record<string, unknown>,
	pathSegments: readonly (string | number)[],
	componentMap: Map<string, AiComponentSchema>,
	componentNames: readonly string[],
	issues: AiValidationIssue[],
	depth: number,
): void {
	if (depth > MAX_DEPTH) {
		issues.push({
			path: buildPath(pathSegments),
			message: "[MAX_DEPTH_EXCEEDED] Node tree exceeds maximum depth of 16.",
			severity: "error",
		});
		return;
	}

	const nodeType = node.type;

	if (typeof nodeType !== "string") {
		issues.push({
			path: buildPath([...pathSegments, "type"]),
			message: "[INVALID_STRUCTURE] Node is missing a string 'type' property.",
			severity: "error",
		});
		return;
	}

	if (nodeType !== "__root__") {
		const componentSchema = componentMap.get(nodeType);

		if (!componentSchema) {
			const suggestion = closestMatch(nodeType, componentNames);
			const suggestionText = suggestion
				? ' Did you mean "' + suggestion + '"?'
				: "";
			issues.push({
				path: buildPath([...pathSegments, "type"]),
				message:
					'[UNKNOWN_COMPONENT] Component "' +
					nodeType +
					'" is not in the available components list.' +
					suggestionText,
				severity: "error",
			});
		} else {
			const props = node.props;
			if (typeof props === "object" && props !== null) {
				const propsRecord = props as Record<string, unknown>;
				// phase4-014 F-3: reject non-JSON-serialisable prop values
				// (functions, symbols, bigints). Upstream Zod schemas use
				// `unknown()` which accepted them silently.
				const nonSer = findNonSerializablePath(
					propsRecord,
					[...pathSegments, "props"],
					new WeakSet(),
					0,
				);
				if (nonSer) {
					issues.push({
						path: nonSer.path,
						message:
							"[NON_SERIALIZABLE_PROP] Prop value is not JSON-serialisable (" +
							nonSer.reason +
							"). PageIR values must round-trip through JSON.",
						severity: "error",
					});
				}
				const propsSchema = makeComponentPropsSchema(
					componentSchema.fields,
					componentSchema.componentName,
				);
				const result = propsSchema.safeParse(propsRecord);

				if (!result.success) {
					const zodIssues = result.error.issues.map((issue) => ({
						path: issue.path,
						message: issue.message,
						code: issue.code,
					}));
					for (const zi of zodIssues) {
						const normalizedIssuePath = zi.path.map((segment) =>
							typeof segment === "symbol" ? String(segment) : segment,
						);
						const fullPath = buildPath([
							...pathSegments,
							"props",
							...normalizedIssuePath,
						]);

						let code = "INVALID_FIELD_TYPE";
						if (
							zi.code === "invalid_type" &&
							!hasValueAtPath(propsRecord, zi.path)
						) {
							code = "MISSING_REQUIRED_FIELD";
						} else if (zi.code === "invalid_value") {
							code = "INVALID_ENUM_VALUE";
						} else if (zi.code === "unrecognized_keys") {
							code = "UNKNOWN_FIELD";
						}

						issues.push({
							path: fullPath,
							message: "[" + code + "] " + zi.message,
							severity: code === "UNKNOWN_FIELD" ? "warn" : "error",
						});
					}
				}

				const knownFieldNames = new Set(
					componentSchema.fields.map((f: { name: string }) => f.name),
				);
				for (const propKey of Object.keys(propsRecord)) {
					if (propKey === "id") continue;
					if (!knownFieldNames.has(propKey)) {
						issues.push({
							path: buildPath([...pathSegments, "props", propKey]),
							message:
								'[UNKNOWN_FIELD] Property "' +
								propKey +
								'" is not defined in the schema for "' +
								nodeType +
								'".',
							severity: "warn",
						});
					}
				}
			}
		}
	}

	// phase4-014 F-2: `children` must be an array when present. Previously
	// a non-array slipped through validation and crashed the plugin
	// pipeline at `irToPuckPatch` with `.map is not a function`.
	const children = node.children;
	if (children !== undefined) {
		if (!Array.isArray(children)) {
			issues.push({
				path: buildPath([...pathSegments, "children"]),
				message:
					"[INVALID_CHILDREN] children must be an array when present, got " +
					(children === null ? "null" : typeof children) +
					".",
				severity: "error",
			});
		} else {
			for (let i = 0; i < children.length; i++) {
				const child = children[i];
				if (typeof child === "object" && child !== null) {
					walkNode(
						child as Record<string, unknown>,
						[...pathSegments, "children", i],
						componentMap,
						componentNames,
						issues,
						depth + 1,
					);
				}
			}
		}
	}
}

/**
 * Recursive JSON-serialisability check. phase4-014 F-3: prop values
 * must round-trip through JSON. Functions, symbols, and bigints
 * silently broke `structuredClone` + `localStorage` rehydration even
 * though the upstream Zod schema accepted them as `unknown()`.
 *
 * Cycles are caught via the `seen` WeakSet; max traversal depth is
 * {@link MAX_DEPTH} to match the node-walk budget.
 */
function findNonSerializablePath(
	value: unknown,
	path: readonly (string | number)[],
	seen: WeakSet<object>,
	depth: number,
): { path: string; reason: string } | null {
	if (value === null || value === undefined) return null;
	const t = typeof value;
	if (t === "string" || t === "number" || t === "boolean") return null;
	if (t === "function") {
		return { path: buildPath(path), reason: "function" };
	}
	if (t === "symbol") {
		return { path: buildPath(path), reason: "symbol" };
	}
	if (t === "bigint") {
		return { path: buildPath(path), reason: "bigint" };
	}
	if (t !== "object") {
		return { path: buildPath(path), reason: t };
	}
	if (depth > MAX_DEPTH) {
		return { path: buildPath(path), reason: "exceeds-max-depth" };
	}
	const obj = value as object;
	if (seen.has(obj)) {
		return { path: buildPath(path), reason: "circular" };
	}
	seen.add(obj);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			const hit = findNonSerializablePath(value[i], [...path, i], seen, depth + 1);
			if (hit) return hit;
		}
		return null;
	}
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		const hit = findNonSerializablePath(v, [...path, k], seen, depth + 1);
		if (hit) return hit;
	}
	return null;
}
