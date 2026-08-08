/**
 * @file Inline editing — plain-text normalization and the shared
 * Tiptap sanitizer allowlist.
 *
 * PLAN-0028 `p4-007` rebased the inline controller's reads onto the
 * `document-model` projection and its writes onto the `p3-004` carrier
 * commit. The session-lifecycle suites that used to live here drove a
 * command-port double with no `Config` and a `bridge.capabilities`
 * stub, neither of which is a read source any more; they are recorded
 * in the deferred-verification ledger and rebuilt in P8. What remains
 * is the part that was never bound to either: the pure text/document
 * helpers.
 */

import { describe, expect, it } from "vitest";
import { normalizePlainText } from "../inline/controller.js";
import {
	sanitizeTiptapDocument,
	tiptapFromPlainText,
	tiptapToPlainText,
} from "../inline/tiptap-contract.js";

describe("normalization + shared Tiptap contract (CORE-P1B-009C/D)", () => {
	it("normalizes newlines and trailing whitespace", () => {
		expect(normalizePlainText("a \r\nb\t\nc  \n\n")).toBe("a\nb\nc");
		expect(normalizePlainText("x y")).toBe("x y");
	});

	it("sanitizes to the §17 allowlist (nodes, marks, safe links)", () => {
		const dirty = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "keep",
							marks: [
								{ type: "bold" },
								{ type: "textStyle", attrs: { color: "red" } },
								{ type: "link", attrs: { href: "javascript:alert(1)" } },
							],
						},
					],
				},
				{
					type: "iframe",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "unwrapped" }],
						},
					],
				},
				{
					type: "heading",
					attrs: { level: 99 },
					content: [{ type: "text", text: "h" }],
				},
			],
		};
		const clean = sanitizeTiptapDocument(dirty);
		expect(clean.version).toBe("1");
		const first = clean.content[0];
		expect(first?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
		// Unknown node unwraps into its children.
		expect(clean.content[1]?.type).toBe("paragraph");
		// Heading level clamps to 1–6.
		expect(clean.content[2]?.attrs?.level).toBe(6);
		// Safe links survive.
		const linked = sanitizeTiptapDocument({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "site",
							marks: [{ type: "link", attrs: { href: "https://a.dev" } }],
						},
					],
				},
			],
		});
		expect(linked.content[0]?.content?.[0]?.marks?.[0]).toEqual({
			type: "link",
			attrs: { href: "https://a.dev" },
		});
	});

	it("round-trips plain text through the document shape", () => {
		const doc = tiptapFromPlainText("line one\nline two");
		expect(tiptapToPlainText(doc)).toBe("line one\nline two");
		expect(sanitizeTiptapDocument(doc)).toEqual(doc);
	});
});
