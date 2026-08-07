"use client";

/**
 * @file `TiptapDocument` — the single versioned rich-text schema +
 * sanitizer (PLAN-0020 CORE-P1B-009D; ED-TEXT-002; DD-DEC-012;
 * DD-0019 §17).
 *
 * ONE implementation for both rich-text surfaces: the
 * `RichTextField` field type builds its editor from
 * {@link createTiptapExtensions} and the canvas inline surface does
 * the same — schema drift between them is structurally impossible.
 * Every value that becomes durable passes {@link sanitizeTiptapDocument}:
 *
 * - **allowed nodes** (§17): doc, paragraph, heading 1–6, bulletList,
 *   orderedList, listItem, blockquote, text, hardBreak;
 * - **allowed marks**: bold, italic, underline, strike, code, link —
 *   link `href` restricted to http/https/mailto/tel (a `javascript:`
 *   or unknown-scheme href drops the mark, never the text);
 * - unknown nodes are unwrapped into their children; unknown marks
 *   and unknown attrs are stripped; raw HTML has no representation.
 */

import type {
	TiptapBlockNode,
	TiptapDocument,
} from "@anvilkit/contracts/editor";
import StarterKit from "@tiptap/starter-kit";

/** §17 node allowlist. */
export const TIPTAP_ALLOWED_NODES: ReadonlySet<string> = new Set([
	"doc",
	"paragraph",
	"heading",
	"bulletList",
	"orderedList",
	"listItem",
	"blockquote",
	"text",
	"hardBreak",
]);

/** §17 mark allowlist. */
export const TIPTAP_ALLOWED_MARKS: ReadonlySet<string> = new Set([
	"bold",
	"italic",
	"underline",
	"strike",
	"code",
	"link",
]);

const SAFE_LINK_PATTERN = /^(https?:|mailto:|tel:)/i;

/**
 * The one extension set both rich-text surfaces mount
 * (ED-TEXT-002 "extract, do not duplicate").
 */
export function createTiptapExtensions(): unknown[] {
	return [StarterKit];
}

/** An empty v1 document. */
export function emptyTiptapDocument(): TiptapDocument {
	return { version: "1", type: "doc", content: [] };
}

type LooseNode = {
	readonly type?: unknown;
	readonly attrs?: Record<string, unknown>;
	readonly content?: readonly unknown[];
	readonly marks?: readonly unknown[];
	readonly text?: unknown;
};

function sanitizeMarks(
	marks: readonly unknown[] | undefined,
): TiptapBlockNode["marks"] {
	if (marks === undefined) {
		return undefined;
	}
	const out: NonNullable<TiptapBlockNode["marks"]>[number][] = [];
	for (const entry of marks) {
		const mark = entry as { type?: unknown; attrs?: Record<string, unknown> };
		if (typeof mark.type !== "string" || !TIPTAP_ALLOWED_MARKS.has(mark.type)) {
			continue;
		}
		if (mark.type === "link") {
			const href = mark.attrs?.href;
			if (typeof href !== "string" || !SAFE_LINK_PATTERN.test(href.trim())) {
				continue; // unsafe scheme: drop the mark, keep the text
			}
			out.push({ type: "link", attrs: { href: href.trim() } });
			continue;
		}
		out.push({ type: mark.type });
	}
	return out.length === 0 ? undefined : out;
}

function sanitizeNode(input: unknown): readonly TiptapBlockNode[] {
	const node = input as LooseNode;
	if (typeof node?.type !== "string") {
		return [];
	}
	const children = (node.content ?? []).flatMap(sanitizeNode);
	if (!TIPTAP_ALLOWED_NODES.has(node.type)) {
		// Unknown node: unwrap into its (sanitized) children.
		return children;
	}
	if (node.type === "text") {
		if (typeof node.text !== "string" || node.text.length === 0) {
			return [];
		}
		const marks = sanitizeMarks(node.marks);
		return [
			{
				type: "text",
				text: node.text,
				...(marks !== undefined ? { marks } : {}),
			},
		];
	}
	const out: {
		type: string;
		attrs?: Record<string, string | number | boolean | null>;
		content?: readonly TiptapBlockNode[];
	} = { type: node.type };
	if (node.type === "heading") {
		const rawLevel = node.attrs?.level;
		const level =
			typeof rawLevel === "number" && Number.isInteger(rawLevel)
				? Math.min(6, Math.max(1, rawLevel))
				: 2;
		out.attrs = { level };
	}
	if (children.length > 0) {
		out.content = children;
	}
	return [out as TiptapBlockNode];
}

/**
 * Sanitize arbitrary Tiptap-shaped JSON into a canonical
 * {@link TiptapDocument}. Total: never throws; unparseable input
 * yields the empty document.
 */
export function sanitizeTiptapDocument(input: unknown): TiptapDocument {
	const doc = input as LooseNode & { version?: unknown };
	if (typeof doc !== "object" || doc === null || doc.type !== "doc") {
		return emptyTiptapDocument();
	}
	// Forward-compat rule (ED-TEXT-002): only major version "1" is
	// writable; anything else re-canonicalizes into v1 content-wise.
	return {
		version: "1",
		type: "doc",
		content: (doc.content ?? []).flatMap(sanitizeNode),
	};
}

/** Flatten a document to plain text (plain-target conversions). */
export function tiptapToPlainText(doc: TiptapDocument): string {
	const walk = (nodes: readonly TiptapBlockNode[]): string =>
		nodes
			.map((node) => {
				if (node.type === "text") {
					return node.text ?? "";
				}
				if (node.type === "hardBreak") {
					return "\n";
				}
				const inner = walk(node.content ?? []);
				return node.type === "paragraph" || node.type === "heading"
					? `${inner}\n`
					: inner;
			})
			.join("");
	return walk(doc.content).replace(/\n+$/, "");
}

/** Wrap plain text into a minimal v1 document. */
export function tiptapFromPlainText(text: string): TiptapDocument {
	const paragraphs = text.split(/\r?\n/).map((line) => ({
		type: "paragraph" as const,
		...(line.length > 0
			? { content: [{ type: "text" as const, text: line }] }
			: {}),
	}));
	return { version: "1", type: "doc", content: paragraphs };
}
