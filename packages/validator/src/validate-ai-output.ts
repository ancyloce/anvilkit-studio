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

	if (res.root && typeof res.root === "object") {
		walkNode(
			res.root as Record<string, unknown>,
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

	const children = node.children;
	if (Array.isArray(children)) {
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
