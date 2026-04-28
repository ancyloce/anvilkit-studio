import * as babelParser from "@babel/parser";
import * as t from "@babel/types";
import * as recast from "recast";

import type { RegistryEntryKind } from "./registry-schema.js";

const parser = {
	parse(source: string): unknown {
		return babelParser.parse(source, {
			sourceType: "module",
			allowImportExportEverywhere: true,
			plugins: ["typescript", "jsx"],
			tokens: true,
		});
	},
};

/**
 * Idempotent AST codemods for `anvilkit add`.
 *
 * Two transforms ship in the V1 cut:
 *
 * 1. `addToTranspilePackages` — inserts a package name into the
 *    `transpilePackages: [...]` array of `next.config.{js,ts}`.
 *    No-op if the package is already present.
 *
 * 2. `registerInPuckConfig` — adds an `import` and registers the
 *    entry inside the host's Puck `Config`:
 *      - kind=plugin     → `plugins: [...]` array
 *      - kind=component  → `components: { … }` object
 *      - kind=template   → `templates: [...]` array (host-side
 *                          consumption pattern; the IR seed is
 *                          appended separately by the caller).
 *
 * Both transforms parse with `recast` + `@babel/parser`'s `babel-ts`
 * preset so JS, TS, and TSX inputs round-trip without losing
 * formatting or comments.
 *
 * Phase 6 / M11 / `phase6-010`.
 */

export interface CodemodOutcome {
	readonly source: string;
	readonly changed: boolean;
}

function parse(source: string) {
	return recast.parse(source, { parser });
}

function isIdent(node: t.Node | null | undefined, name: string): boolean {
	return (
		node !== null &&
		node !== undefined &&
		t.isIdentifier(node) &&
		node.name === name
	);
}

function findExportedConfigObject(ast: t.File): t.ObjectExpression | undefined {
	for (const node of ast.program.body) {
		if (
			t.isExportDefaultDeclaration(node) &&
			t.isObjectExpression(node.declaration)
		) {
			return node.declaration;
		}
		if (
			t.isExportDefaultDeclaration(node) &&
			t.isIdentifier(node.declaration)
		) {
			const targetName = node.declaration.name;
			for (const inner of ast.program.body) {
				if (t.isVariableDeclaration(inner)) {
					for (const decl of inner.declarations) {
						if (
							t.isVariableDeclarator(decl) &&
							isIdent(decl.id, targetName) &&
							t.isObjectExpression(decl.init)
						) {
							return decl.init;
						}
					}
				}
			}
		}
	}
	return undefined;
}

function findExportedNamedObject(
	ast: t.File,
	name: string,
): t.ObjectExpression | undefined {
	for (const node of ast.program.body) {
		if (
			t.isExportNamedDeclaration(node) &&
			t.isVariableDeclaration(node.declaration)
		) {
			for (const decl of node.declaration.declarations) {
				if (
					t.isVariableDeclarator(decl) &&
					isIdent(decl.id, name) &&
					t.isObjectExpression(decl.init)
				) {
					return decl.init;
				}
			}
		}
		if (t.isVariableDeclaration(node)) {
			for (const decl of node.declarations) {
				if (
					t.isVariableDeclarator(decl) &&
					isIdent(decl.id, name) &&
					t.isObjectExpression(decl.init)
				) {
					return decl.init;
				}
			}
		}
	}
	return undefined;
}

function getOrCreateProperty(
	obj: t.ObjectExpression,
	key: string,
	factory: () => t.Expression,
): t.ObjectProperty {
	for (const prop of obj.properties) {
		if (
			t.isObjectProperty(prop) &&
			!prop.computed &&
			((t.isIdentifier(prop.key) && prop.key.name === key) ||
				(t.isStringLiteral(prop.key) && prop.key.value === key))
		) {
			return prop;
		}
	}
	const created = t.objectProperty(t.identifier(key), factory());
	obj.properties.push(created);
	return created;
}

function arrayContainsStringLiteral(
	array: t.ArrayExpression,
	value: string,
): boolean {
	return array.elements.some(
		(el) => el !== null && t.isStringLiteral(el) && el.value === value,
	);
}

function arrayContainsIdentifier(
	array: t.ArrayExpression,
	name: string,
): boolean {
	return array.elements.some((el) => el !== null && isIdent(el, name));
}

function objectHasKey(obj: t.ObjectExpression, key: string): boolean {
	return obj.properties.some(
		(p) =>
			t.isObjectProperty(p) &&
			!p.computed &&
			((t.isIdentifier(p.key) && p.key.name === key) ||
				(t.isStringLiteral(p.key) && p.key.value === key)),
	);
}

function ensureImport(ast: t.File, importName: string, from: string): boolean {
	for (const node of ast.program.body) {
		if (t.isImportDeclaration(node) && node.source.value === from) {
			const already = node.specifiers.some(
				(s) =>
					t.isImportSpecifier(s) &&
					t.isIdentifier(s.imported) &&
					s.imported.name === importName,
			);
			if (already) return false;
			node.specifiers.push(
				t.importSpecifier(t.identifier(importName), t.identifier(importName)),
			);
			return true;
		}
	}

	const decl = t.importDeclaration(
		[t.importSpecifier(t.identifier(importName), t.identifier(importName))],
		t.stringLiteral(from),
	);

	let lastImportIdx = -1;
	for (let i = 0; i < ast.program.body.length; i++) {
		if (t.isImportDeclaration(ast.program.body[i] ?? null)) {
			lastImportIdx = i;
		}
	}
	ast.program.body.splice(lastImportIdx + 1, 0, decl);
	return true;
}

export function addToTranspilePackages(
	source: string,
	packageName: string,
): CodemodOutcome {
	const ast = parse(source);
	const config = findExportedConfigObject(ast);
	if (config === undefined) {
		throw new Error(
			"next.config: could not find a `export default { … }` config object to mutate.",
		);
	}

	const transpileProp = getOrCreateProperty(config, "transpilePackages", () =>
		t.arrayExpression([]),
	);
	if (!t.isArrayExpression(transpileProp.value)) {
		throw new Error(
			"next.config: `transpilePackages` exists but is not an array literal.",
		);
	}

	if (arrayContainsStringLiteral(transpileProp.value, packageName)) {
		return { source, changed: false };
	}

	transpileProp.value.elements.push(t.stringLiteral(packageName));
	transpileProp.value.elements.sort((a, b) => {
		if (a === null || !t.isStringLiteral(a)) return 0;
		if (b === null || !t.isStringLiteral(b)) return 0;
		return a.value.localeCompare(b.value);
	});

	const printed = recast.print(ast).code;
	return { source: printed, changed: printed !== source };
}

const PUCK_CONFIG_NAMES = ["puckConfig", "config", "default"] as const;

function findPuckConfigObject(
	ast: t.File,
): { obj: t.ObjectExpression; declarationName?: string } | undefined {
	const fromDefault = findExportedConfigObject(ast);
	if (fromDefault !== undefined) {
		return { obj: fromDefault };
	}
	for (const candidate of PUCK_CONFIG_NAMES) {
		const obj = findExportedNamedObject(ast, candidate);
		if (obj !== undefined) {
			return { obj, declarationName: candidate };
		}
	}
	return undefined;
}

function pascalCase(slug: string): string {
	return slug
		.split(/[-_]/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
		.join("");
}

function pluginIdentifier(slug: string): string {
	const trimmed = slug.replace(/^plugin-/, "");
	return `${pascalCase(trimmed)}Plugin`;
}

function pluginFactoryName(slug: string): string {
	const trimmed = slug.replace(/^plugin-/, "");
	return `create${pascalCase(trimmed)}Plugin`;
}

export interface PuckConfigCodemodInput {
	readonly source: string;
	readonly slug: string;
	readonly packageName: string;
	readonly kind: RegistryEntryKind;
}

export function registerInPuckConfig(
	input: PuckConfigCodemodInput,
): CodemodOutcome {
	const ast = parse(input.source);
	const located = findPuckConfigObject(ast);
	if (located === undefined) {
		throw new Error(
			"puck-config: could not locate a top-level Puck `Config` object to mutate.",
		);
	}
	const obj = located.obj;

	let importChanged = false;
	let bodyChanged = false;

	if (input.kind === "component") {
		const importName = pascalCase(input.slug);
		importChanged = ensureImport(ast, importName, input.packageName);
		const components = getOrCreateProperty(obj, "components", () =>
			t.objectExpression([]),
		);
		if (!t.isObjectExpression(components.value)) {
			throw new Error("puck-config: `components` must be an object literal.");
		}
		if (!objectHasKey(components.value, importName)) {
			components.value.properties.push(
				t.objectProperty(t.identifier(importName), t.identifier(importName)),
			);
			bodyChanged = true;
		}
	} else if (input.kind === "plugin") {
		const factoryName = pluginFactoryName(input.slug);
		const instanceName = pluginIdentifier(input.slug);
		importChanged = ensureImport(ast, factoryName, input.packageName);
		const plugins = getOrCreateProperty(obj, "plugins", () =>
			t.arrayExpression([]),
		);
		if (!t.isArrayExpression(plugins.value)) {
			throw new Error("puck-config: `plugins` must be an array literal.");
		}
		if (!arrayContainsIdentifier(plugins.value, instanceName)) {
			plugins.value.elements.push(
				t.callExpression(t.identifier(factoryName), []),
			);
			bodyChanged = true;
		}
	} else {
		const importName = pascalCase(input.slug);
		importChanged = ensureImport(ast, importName, input.packageName);
		const templates = getOrCreateProperty(obj, "templates", () =>
			t.arrayExpression([]),
		);
		if (!t.isArrayExpression(templates.value)) {
			throw new Error("puck-config: `templates` must be an array literal.");
		}
		if (!arrayContainsIdentifier(templates.value, importName)) {
			templates.value.elements.push(t.identifier(importName));
			bodyChanged = true;
		}
	}

	if (!importChanged && !bodyChanged) {
		return { source: input.source, changed: false };
	}

	const printed = recast.print(ast).code;
	return { source: printed, changed: printed !== input.source };
}
