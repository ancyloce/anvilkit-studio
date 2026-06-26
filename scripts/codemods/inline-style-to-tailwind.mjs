#!/usr/bin/env node

// Codemod: convert static inline `style={{...}}` props to Tailwind `className`.
//
// SAFE BY CONSTRUCTION:
//   - whole-object only: a style prop is converted ONLY if every property maps
//     to a Tailwind class AND every value is a literal. Any spread (`...style`),
//     shorthand (`{ maxHeight }`), identifier/expression value (dynamic), unknown
//     property, or unmappable value => the entire style prop is left untouched.
//   - className merge only when the existing className is a plain string literal;
//     if className is an expression (cn(...), template, identifier) the prop is
//     skipped (we never rewrite expression classNames).
//
// This intentionally skips Konva node props (x/y/rotate/width as bare idents),
// framer-motion motion values, CSS custom props, var()/clamp()/calc(), and any
// dynamic value — matching the "handle common styles, preserve complex/dynamic".
//
// Usage:
//   node scripts/codemods/inline-style-to-tailwind.mjs --glob "<glob>" [--glob ...] \
//        [--apply] [--backup-dir <dir>] [--report <file>]
// Default is DRY-RUN (no files written). --apply writes + backs up first.

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

// --- resolve non-hoisted ts-morph from the pnpm store ------------------------
function loadTsMorph() {
	const pnpmDir = path.join(REPO_ROOT, "node_modules/.pnpm");
	const dir = readdirSync(pnpmDir).find((d) => d.startsWith("ts-morph@"));
	if (!dir) throw new Error("ts-morph not found under node_modules/.pnpm");
	const base = path.join(pnpmDir, dir, "node_modules/ts-morph/package.json");
	const req = createRequire(base);
	return import(pathToFileURL(req.resolve("ts-morph")).href);
}

// --- CLI ---------------------------------------------------------------------
function parseArgs(argv) {
	const globs = [];
	let apply = false;
	let backupDir = path.join(
		REPO_ROOT,
		".codemod-backups/inline-style-to-tailwind",
	);
	let report = path.join(REPO_ROOT, "DESIGN.inline-style-report.md");
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--glob") globs.push(argv[++i]);
		else if (a === "--apply") apply = true;
		else if (a === "--backup-dir") backupDir = path.resolve(argv[++i]);
		else if (a === "--report") report = path.resolve(argv[++i]);
	}
	return { globs, apply, backupDir, report };
}

// --- value mapping helpers ---------------------------------------------------
const REM = {
	0: "0",
	0.125: "0.5",
	0.25: "1",
	0.375: "1.5",
	0.5: "2",
	0.625: "2.5",
	0.75: "3",
	0.875: "3.5",
	1: "4",
	1.25: "5",
	1.5: "6",
	1.75: "7",
	2: "8",
	2.25: "9",
	2.5: "10",
	2.75: "11",
	3: "12",
	3.5: "14",
	4: "16",
	5: "20",
	6: "24",
	7: "28",
	8: "32",
	9: "36",
	10: "40",
	12: "48",
	14: "56",
	16: "64",
};

// number passed to React = px; tw px scale = px/4 when divisible by 4.
function spacingToken(raw) {
	if (typeof raw === "number") {
		if (raw === 0) return "0";
		if (raw % 4 === 0) return String(raw / 4);
		return `[${raw}px]`;
	}
	const s = String(raw).trim();
	let m = s.match(/^(-?\d+(?:\.\d+)?)rem$/);
	if (m) {
		const n = Number(m[1]);
		if (REM[Math.abs(n)] != null) return (n < 0 ? "-" : "") + REM[Math.abs(n)];
		return `[${s}]`;
	}
	m = s.match(/^(-?\d+(?:\.\d+)?)px$/);
	if (m) {
		const n = Number(m[1]);
		if (n === 0) return "0";
		if (n % 4 === 0) return String(n / 4);
		return `[${s}]`;
	}
	if (/^-?\d+(\.\d+)?%$/.test(s)) return `[${s}]`;
	return null; // unmappable
}

const ENUM = {
	display: {
		flex: "flex",
		"inline-flex": "inline-flex",
		block: "block",
		"inline-block": "inline-block",
		inline: "inline",
		grid: "grid",
		"inline-grid": "inline-grid",
		none: "hidden",
		contents: "contents",
		table: "table",
	},
	position: {
		relative: "relative",
		absolute: "absolute",
		fixed: "fixed",
		sticky: "sticky",
		static: "static",
	},
	visibility: { hidden: "invisible", visible: "visible", collapse: "collapse" },
	textAlign: {
		left: "text-left",
		center: "text-center",
		right: "text-right",
		justify: "text-justify",
		start: "text-start",
		end: "text-end",
	},
	whiteSpace: {
		normal: "whitespace-normal",
		nowrap: "whitespace-nowrap",
		pre: "whitespace-pre",
		"pre-line": "whitespace-pre-line",
		"pre-wrap": "whitespace-pre-wrap",
	},
	flexDirection: {
		row: "flex-row",
		"row-reverse": "flex-row-reverse",
		column: "flex-col",
		"column-reverse": "flex-col-reverse",
	},
	flexWrap: {
		wrap: "flex-wrap",
		nowrap: "flex-nowrap",
		"wrap-reverse": "flex-wrap-reverse",
	},
	justifyContent: {
		"flex-start": "justify-start",
		"flex-end": "justify-end",
		center: "justify-center",
		"space-between": "justify-between",
		"space-around": "justify-around",
		"space-evenly": "justify-evenly",
		start: "justify-start",
		end: "justify-end",
	},
	alignItems: {
		"flex-start": "items-start",
		"flex-end": "items-end",
		center: "items-center",
		baseline: "items-baseline",
		stretch: "items-stretch",
	},
	alignSelf: {
		auto: "self-auto",
		"flex-start": "self-start",
		"flex-end": "self-end",
		center: "self-center",
		baseline: "self-baseline",
		stretch: "self-stretch",
	},
	textTransform: {
		uppercase: "uppercase",
		lowercase: "lowercase",
		capitalize: "capitalize",
		none: "normal-case",
	},
	fontStyle: { italic: "italic", normal: "not-italic" },
	textDecoration: {
		underline: "underline",
		"line-through": "line-through",
		none: "no-underline",
	},
	textDecorationLine: {
		underline: "underline",
		"line-through": "line-through",
		none: "no-underline",
	},
	cursor: {
		pointer: "cursor-pointer",
		default: "cursor-default",
		"not-allowed": "cursor-not-allowed",
		wait: "cursor-wait",
		text: "cursor-text",
		move: "cursor-move",
		grab: "cursor-grab",
	},
	objectFit: {
		contain: "object-contain",
		cover: "object-cover",
		fill: "object-fill",
		none: "object-none",
		"scale-down": "object-scale-down",
	},
	pointerEvents: { none: "pointer-events-none", auto: "pointer-events-auto" },
	userSelect: {
		none: "select-none",
		text: "select-text",
		all: "select-all",
		auto: "select-auto",
	},
	boxSizing: { "border-box": "box-border", "content-box": "box-content" },
};

const FONT_WEIGHT = {
	100: "font-thin",
	200: "font-extralight",
	300: "font-light",
	400: "font-normal",
	500: "font-medium",
	600: "font-semibold",
	700: "font-bold",
	800: "font-extrabold",
	900: "font-black",
};
const Z = {
	0: "z-0",
	10: "z-10",
	20: "z-20",
	30: "z-30",
	40: "z-40",
	50: "z-50",
};

const SPACING_PROPS = {
	margin: "m",
	marginTop: "mt",
	marginBottom: "mb",
	marginLeft: "ml",
	marginRight: "mr",
	marginInline: "mx",
	marginBlock: "my",
	padding: "p",
	paddingTop: "pt",
	paddingBottom: "pb",
	paddingLeft: "pl",
	paddingRight: "pr",
	paddingInline: "px",
	paddingBlock: "py",
	gap: "gap",
	rowGap: "gap-y",
	columnGap: "gap-x",
	top: "top",
	right: "right",
	bottom: "bottom",
	left: "left",
};

const OVERFLOW = {
	overflow: "overflow",
	overflowX: "overflow-x",
	overflowY: "overflow-y",
};
const OVERFLOW_VALS = {
	visible: "visible",
	hidden: "hidden",
	scroll: "scroll",
	auto: "auto",
	clip: "clip",
};

// returns string[] of classes, or null if unmappable
function mapProp(name, value) {
	// value: { kind: 'string'|'number', raw }
	const isStr = value.kind === "string";
	const isNum = value.kind === "number";
	const s = String(value.raw);

	if (SPACING_PROPS[name]) {
		const tok = spacingToken(isNum ? value.raw : s);
		return tok == null ? null : [`${SPACING_PROPS[name]}-${tok}`];
	}
	if (OVERFLOW[name]) {
		const v = OVERFLOW_VALS[s];
		return v ? [`${OVERFLOW[name]}-${v}`] : null;
	}
	if (ENUM[name]) {
		const v = ENUM[name][s];
		return v ? [v] : null;
	}
	switch (name) {
		case "zIndex": {
			if (isNum) return Z[value.raw] ? [Z[value.raw]] : [`z-[${value.raw}]`];
			return null;
		}
		case "inset": {
			const tok = spacingToken(isNum ? value.raw : s);
			return tok == null ? null : [`inset-${tok}`];
		}
		case "width": {
			if (s === "100%") return ["w-full"];
			if (s === "auto") return ["w-auto"];
			if (s === "100vw") return ["w-screen"];
			if (s === "fit-content") return ["w-fit"];
			const tok = spacingToken(isNum ? value.raw : s);
			return tok == null ? null : [`w-${tok}`];
		}
		case "height": {
			if (s === "100%") return ["h-full"];
			if (s === "auto") return ["h-auto"];
			if (s === "100vh") return ["h-screen"];
			if (s === "fit-content") return ["h-fit"];
			const tok = spacingToken(isNum ? value.raw : s);
			return tok == null ? null : [`h-${tok}`];
		}
		case "minWidth": {
			if (s === "0" || value.raw === 0) return ["min-w-0"];
			if (s === "100%") return ["min-w-full"];
			return null;
		}
		case "maxWidth": {
			if (s === "100%") return ["max-w-full"];
			if (s === "none") return ["max-w-none"];
			return null;
		}
		case "minHeight": {
			if (s === "0" || value.raw === 0) return ["min-h-0"];
			if (s === "100%") return ["min-h-full"];
			if (s === "100vh") return ["min-h-screen"];
			return null;
		}
		case "maxHeight": {
			if (s === "100%") return ["max-h-full"];
			if (s === "none") return ["max-h-none"];
			return null;
		}
		case "flex": {
			if (s === "1" || value.raw === 1) return ["flex-1"];
			if (s === "auto") return ["flex-auto"];
			if (s === "none") return ["flex-none"];
			if (s === "initial") return ["flex-initial"];
			return null;
		}
		case "flexGrow":
			return value.raw === 1 || s === "1"
				? ["grow"]
				: value.raw === 0 || s === "0"
					? ["grow-0"]
					: null;
		case "flexShrink":
			return value.raw === 1 || s === "1"
				? ["shrink"]
				: value.raw === 0 || s === "0"
					? ["shrink-0"]
					: null;
		case "fontWeight": {
			const n = isNum ? value.raw : Number(s);
			return FONT_WEIGHT[n] ? [FONT_WEIGHT[n]] : null;
		}
		case "borderRadius": {
			if (s === "0" || value.raw === 0) return ["rounded-none"];
			if (s === "9999px" || s === "999px") return ["rounded-full"];
			if (s === "0.25rem") return ["rounded"];
			if (s === "0.375rem") return ["rounded-md"];
			if (s === "0.5rem") return ["rounded-lg"];
			if (s === "0.75rem") return ["rounded-xl"];
			if (s === "1rem") return ["rounded-2xl"];
			return null;
		}
		case "opacity": {
			const n = isNum ? value.raw : Number(s);
			if (!Number.isFinite(n)) return null;
			const pct = Math.round(n * 100);
			return pct % 5 === 0 ? [`opacity-${pct}`] : [`opacity-[${n}]`];
		}
		case "color": {
			if (isStr && /^#([0-9a-fA-F]{3,8})$/.test(s)) return [`text-[${s}]`];
			return null;
		}
		case "backgroundColor": {
			if (isStr && /^#([0-9a-fA-F]{3,8})$/.test(s)) return [`bg-[${s}]`];
			return null;
		}
		case "lineHeight": {
			if (isNum) return [`leading-[${value.raw}]`];
			return null;
		}
		default:
			return null;
	}
}

// --- main --------------------------------------------------------------------
const { Project, SyntaxKind, Node } = await loadTsMorph();
const args = parseArgs(process.argv.slice(2));
if (args.globs.length === 0) {
	console.error("No --glob provided.");
	process.exit(2);
}

const project = new Project({
	tsConfigFilePath: undefined,
	skipAddingFilesFromTsConfig: true,
	compilerOptions: { jsx: 4 /* preserve */, allowJs: true },
});
const IGNORES = [
	"!**/node_modules/**",
	"!**/dist/**",
	"!**/.next/**",
	"!**/.vercel/**",
	"!**/.turbo/**",
	"!**/build/**",
];
project.addSourceFilesAtPaths([...args.globs, ...IGNORES]);

const sourceFiles = project
	.getSourceFiles()
	.filter((f) => f.getFilePath().endsWith(".tsx"));
const report = [];
let convertedCount = 0;
let skippedCount = 0;
const touchedFiles = new Set();

function literalValue(init) {
	if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init))
		return { kind: "string", raw: init.getLiteralValue() };
	if (Node.isNumericLiteral(init))
		return { kind: "number", raw: Number(init.getLiteralValue()) };
	if (init.getKind() === SyntaxKind.PrefixUnaryExpression) {
		const op = init.getOperatorToken?.();
		const operand = init.getOperand?.();
		if (
			op === SyntaxKind.MinusToken &&
			operand &&
			Node.isNumericLiteral(operand)
		)
			return { kind: "number", raw: -Number(operand.getLiteralValue()) };
	}
	return null; // non-literal / dynamic
}

for (const sf of sourceFiles) {
	const rel = path.relative(REPO_ROOT, sf.getFilePath());
	const fileEntries = [];
	const styleAttrs = sf
		.getDescendantsOfKind(SyntaxKind.JsxAttribute)
		.filter((a) => a.getNameNode().getText() === "style");

	for (const attr of styleAttrs) {
		const line = attr.getStartLineNumber();
		const init = attr.getInitializer();
		if (!init || !Node.isJsxExpression(init)) {
			continue;
		}
		const expr = init.getExpression();
		if (!expr || !Node.isObjectLiteralExpression(expr)) {
			fileEntries.push({
				line,
				status: "skip",
				reason: "style value is not an object literal",
				before: attr.getText(),
			});
			skippedCount++;
			continue;
		}

		const props = expr.getProperties();
		let bail = null;
		const classes = [];
		for (const p of props) {
			if (!Node.isPropertyAssignment(p)) {
				bail = Node.isSpreadAssignment(p)
					? "contains spread (...style)"
					: "shorthand/dynamic property";
				break;
			}
			const nameNode = p.getNameNode();
			const propName = Node.isStringLiteral(nameNode)
				? nameNode.getLiteralValue()
				: nameNode.getText();
			const v = literalValue(p.getInitializerOrThrow());
			if (!v) {
				bail = `non-literal value for "${propName}"`;
				break;
			}
			const mapped = mapProp(propName, v);
			if (!mapped) {
				bail = `unmappable property/value "${propName}: ${v.raw}"`;
				break;
			}
			classes.push(...mapped);
		}

		if (bail) {
			fileEntries.push({
				line,
				status: "skip",
				reason: bail,
				before: attr.getText(),
			});
			skippedCount++;
			continue;
		}

		// locate sibling className on the same element
		const opening = attr.getFirstAncestor(
			(a) => Node.isJsxOpeningElement(a) || Node.isJsxSelfClosingElement(a),
		); // JsxOpeningElement | JsxSelfClosingElement
		if (!opening) {
			continue;
		}
		const classNameAttr = opening
			.getAttributes()
			.find(
				(a) =>
					Node.isJsxAttribute(a) && a.getNameNode().getText() === "className",
			);

		const uniq = [...new Set(classes)];
		const newClasses = uniq.join(" ");
		const beforeTag = opening.getText();
		const removedText = attr.getText();

		if (classNameAttr) {
			const cInit = classNameAttr.getInitializer();
			if (cInit && Node.isStringLiteral(cInit)) {
				if (args.apply)
					cInit.setLiteralValue(
						`${cInit.getLiteralValue()} ${newClasses}`.trim(),
					);
			} else {
				fileEntries.push({
					line,
					status: "skip",
					reason: "className is an expression (cn()/template) — not merged",
					before: attr.getText(),
				});
				skippedCount++;
				continue;
			}
		} else if (args.apply) {
			opening.addAttribute({
				name: "className",
				initializer: `"${newClasses}"`,
			});
		}

		if (args.apply) attr.remove();
		fileEntries.push({
			line,
			status: "convert",
			classes: newClasses,
			before: beforeTag,
			removed: removedText,
		});
		convertedCount++;
		touchedFiles.add(rel);
	}

	if (fileEntries.length) report.push({ rel, entries: fileEntries });
}

// --- write changes -----------------------------------------------------------
if (args.apply) {
	for (const rel of touchedFiles) {
		const abs = path.join(REPO_ROOT, rel);
		const dest = path.join(args.backupDir, rel);
		mkdirSync(path.dirname(dest), { recursive: true });
		if (!existsSync(dest)) copyFileSync(abs, dest);
	}
	await project.save();
}

// --- emit report -------------------------------------------------------------
const lines = [];
lines.push(`# Inline-style → Tailwind codemod report`);
lines.push("");
lines.push(
	`- Mode: **${args.apply ? "APPLY (files written)" : "DRY-RUN (no files written)"}**`,
);
lines.push(`- Globs: ${args.globs.map((g) => `\`${g}\``).join(", ")}`);
lines.push(`- Files scanned: ${sourceFiles.length}`);
lines.push(
	`- Style props converted: **${convertedCount}** | skipped (preserved): **${skippedCount}**`,
);
lines.push(`- Files modified: ${touchedFiles.size}`);
if (args.apply)
	lines.push(`- Backups: \`${path.relative(REPO_ROOT, args.backupDir)}/\``);
lines.push("");
for (const { rel, entries } of report) {
	const conv = entries.filter((e) => e.status === "convert");
	const skip = entries.filter((e) => e.status === "skip");
	lines.push(`## \`${rel}\``);
	if (conv.length) {
		lines.push(`\n**Converted (${conv.length}):**`);
		for (const e of conv) {
			lines.push("");
			lines.push(
				`- L${e.line}: \`${e.removed}\` → \`className="${e.classes}"\``,
			);
		}
	}
	if (skip.length) {
		lines.push(`\n**Preserved (${skip.length}):**`);
		for (const e of skip)
			lines.push(`- L${e.line}: ${e.reason} — \`${e.before}\``);
	}
	lines.push("");
}
writeFileSync(args.report, lines.join("\n"));
console.log(
	`${args.apply ? "APPLIED" : "DRY-RUN"}: converted=${convertedCount} skipped=${skippedCount} files=${touchedFiles.size}`,
);
console.log(`Report: ${path.relative(REPO_ROOT, args.report)}`);
