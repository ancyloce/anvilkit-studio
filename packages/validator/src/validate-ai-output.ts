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
import { MAX_NODE_DEPTH, MAX_PROP_DEPTH } from "./internal/constants.js";
import { makeComponentPropsSchema } from "./internal/make-zod-schema.js";

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

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

	if (!Array.isArray(res.assets)) {
		issues.push({
			path: "assets",
			message: "[INVALID_STRUCTURE] assets must be an array.",
			severity: "error",
		});
	} else {
		for (let i = 0; i < res.assets.length; i++) {
			const asset = res.assets[i];
			const result = assetSchema.safeParse(asset);
			if (!result.success) {
				const firstIssue = result.error.issues[0];
				const detail = firstIssue
					? firstIssue.path.length > 0
						? firstIssue.path.join(".") + ": " + firstIssue.message
						: firstIssue.message
					: "unknown validation error";
				issues.push({
					path: buildPath(["assets", i]),
					message:
						"[INVALID_ASSET] Asset at index " + i + " is malformed: " + detail,
					severity: "error",
				});
			}
		}
	}

	if (!isRecordLike(res.metadata)) {
		issues.push({
			path: "metadata",
			message: "[INVALID_STRUCTURE] metadata must be an object.",
			severity: "error",
		});
	}

	const componentMap = new Map<string, AiComponentSchema>();
	for (const comp of availableComponents) {
		componentMap.set(comp.componentName, comp);
	}
	const componentNames = availableComponents.map(
		(c: { componentName: string }) => c.componentName,
	);

	if (isRecordLike(res.root)) {
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
		walkNode(rootNode, ["root"], componentMap, componentNames, issues, 0);
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
	if (depth >= MAX_NODE_DEPTH) {
		issues.push({
			path: buildPath(pathSegments),
			message:
				"[MAX_DEPTH_EXCEEDED] Node tree exceeds maximum depth of " +
				MAX_NODE_DEPTH +
				".",
			severity: "error",
		});
		return;
	}

	const nodeType = node.type;
	const nodeProps = node.props;
	let propsRecord: Record<string, unknown> | undefined;

	if (typeof node.id !== "string") {
		issues.push({
			path: buildPath([...pathSegments, "id"]),
			message: "[INVALID_STRUCTURE] Node is missing a string 'id' property.",
			severity: "error",
		});
	}

	if (isRecordLike(nodeProps)) {
		propsRecord = nodeProps;
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
	} else {
		issues.push({
			path: buildPath([...pathSegments, "props"]),
			message: "[INVALID_STRUCTURE] Node props must be an object.",
			severity: "error",
		});
	}

	if (node.slot !== undefined && typeof node.slot !== "string") {
		issues.push({
			path: buildPath([...pathSegments, "slot"]),
			message: "[INVALID_STRUCTURE] Node slot must be a string when present.",
			severity: "error",
		});
	}

	if (
		node.slotKind !== undefined &&
		node.slotKind !== "slot" &&
		node.slotKind !== "zone"
	) {
		issues.push({
			path: buildPath([...pathSegments, "slotKind"]),
			message:
				'[INVALID_STRUCTURE] Node slotKind must be "slot" or "zone" when present.',
			severity: "error",
		});
	}

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
		} else if (propsRecord) {
			const propsSchema = makeComponentPropsSchema(componentSchema.fields);
			const result = propsSchema.safeParse(propsRecord);

			if (!result.success) {
				for (const zi of result.error.issues) {
					const normalizedIssuePath = zi.path.map((segment) =>
						typeof segment === "symbol" ? String(segment) : segment,
					);
					const fullPath = buildPath([
						...pathSegments,
						"props",
						...normalizedIssuePath,
					]);

					// Unknown-key warnings come from the manual loop below —
					// the props schema is a looseObject, so Zod never emits
					// `unrecognized_keys` here.
					let code = "INVALID_FIELD_TYPE";
					if (
						zi.code === "invalid_type" &&
						!hasValueAtPath(propsRecord, zi.path)
					) {
						code = "MISSING_REQUIRED_FIELD";
					} else if (zi.code === "invalid_value") {
						code = "INVALID_ENUM_VALUE";
					}

					issues.push({
						path: fullPath,
						message: "[" + code + "] " + zi.message,
						severity: "error",
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
				if (isRecordLike(child)) {
					walkNode(
						child,
						[...pathSegments, "children", i],
						componentMap,
						componentNames,
						issues,
						depth + 1,
					);
				} else {
					issues.push({
						path: buildPath([...pathSegments, "children", i]),
						message: "[INVALID_CHILD] children entries must be objects.",
						severity: "error",
					});
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
 * `ancestors` tracks the active recursion path only — entries are
 * removed on the way back up so that a value shared by sibling
 * subtrees (a perfectly serialisable DAG) is not misreported as a
 * cycle. True self-references still trip the check on the way down.
 */
function findNonSerializablePath(
	value: unknown,
	path: readonly (string | number)[],
	ancestors: WeakSet<object>,
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
	if (depth > MAX_PROP_DEPTH) {
		return { path: buildPath(path), reason: "exceeds-max-depth" };
	}
	const obj = value as object;
	if (ancestors.has(obj)) {
		return { path: buildPath(path), reason: "circular" };
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
