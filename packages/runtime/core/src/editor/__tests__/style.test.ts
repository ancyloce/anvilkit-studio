/**
 * Allowlisted CSS serializer + `resolveAuthoringStyle` suite
 * (PLAN-0020 CORE-P0-018): §9.3 allowlist coverage, unresolved-token
 * diagnostics, preview↔export parity, determinism, no `!important`.
 */

import { describe, expect, it } from "vitest";
import {
	resolveAuthoringStyle,
	serializeBorderEdge,
	serializeCssColor,
	serializeCssLength,
	serializeCssMath,
	serializeFilter,
	serializeGridTracks,
	serializePaint,
	serializeShadow,
} from "../index.js";

function px(value: number) {
	return { kind: "unit", value, unit: "px" } as const;
}

const red = {
	kind: "literal",
	value: { kind: "hex", value: "#ff0000" },
} as const;

describe("css-serializer", () => {
	it("serializes lengths, keywords, and math", () => {
		expect(serializeCssLength(px(12))).toBe("12px");
		expect(
			serializeCssLength({ kind: "keyword", keyword: "min-content" }),
		).toBe("min-content");
		expect(serializeCssLength({ kind: "token", tokenId: "t" })).toBeNull();
		expect(
			serializeCssMath({
				kind: "op",
				operator: "-",
				left: { kind: "unit", value: 100, unit: "%" },
				right: px(24),
			}),
		).toBe("calc(100% - 24px)");
		expect(
			serializeCssMath({
				kind: "fn",
				fn: "clamp",
				args: [
					px(12),
					{
						kind: "op",
						operator: "*",
						left: { kind: "unit", value: 2, unit: "vw" },
						right: { kind: "number", value: 1.5 },
					},
					px(24),
				],
			}),
		).toBe("clamp(12px, 2vw * 1.5, 24px)");
		expect(
			serializeCssMath({
				kind: "fn",
				fn: "min",
				args: [{ kind: "token", tokenId: "t" }, px(1)],
			}),
		).toBeNull();
	});

	it("serializes colors", () => {
		expect(serializeCssColor({ kind: "hex", value: "#123456" })).toBe(
			"#123456",
		);
		expect(serializeCssColor({ kind: "rgba", r: 1, g: 2, b: 3, a: 0.5 })).toBe(
			"rgba(1, 2, 3, 0.5)",
		);
		expect(
			serializeCssColor({ kind: "hsla", h: 120, s: 0.5, l: 0.4, a: 1 }),
		).toBe("hsla(120, 50%, 40%, 1)");
		expect(serializeCssColor({ kind: "keyword", keyword: "transparent" })).toBe(
			"transparent",
		);
	});

	it("serializes paints and escapes image URLs", () => {
		expect(serializePaint({ kind: "none" })).toBe("none");
		expect(serializePaint({ kind: "solid", color: red })).toBe("#ff0000");
		expect(
			serializePaint({
				kind: "linear-gradient",
				angle: 90,
				stops: [
					{ color: red, offset: 0 },
					{ color: red, offset: 1 },
				],
			}),
		).toBe("linear-gradient(90deg, #ff0000 0%, #ff0000 100%)");
		expect(
			serializePaint({
				kind: "image",
				src: 'https://x.test/a".png',
			}),
		).toBe('url("https://x.test/a\\".png")');
	});

	it("serializes shadows, filters, grid tracks, and borders", () => {
		expect(
			serializeShadow({
				kind: "inner",
				offsetX: px(0),
				offsetY: px(2),
				blur: px(4),
				spread: px(1),
				color: red,
			}),
		).toBe("inset 0px 2px 4px 1px #ff0000");
		expect(
			serializeFilter({ blur: px(2), brightness: 1.1, grayscale: 0.5 }),
		).toBe("blur(2px) brightness(1.1) grayscale(0.5)");
		expect(serializeFilter({})).toBeNull();
		expect(
			serializeGridTracks([
				{ kind: "fixed", length: px(200) },
				{ kind: "fr", value: 1 },
				{ kind: "auto" },
			]),
		).toBe("200px 1fr auto");
		expect(serializeGridTracks([])).toBeNull();
		expect(
			serializeBorderEdge({ width: px(1), style: "solid", color: red }),
		).toBe("1px solid #ff0000");
		expect(serializeBorderEdge({})).toBeNull();
	});
});

describe("resolveAuthoringStyle", () => {
	const input = {
		nodeId: "n1",
		layout: {
			display: "flex" as const,
			gap: px(24),
			padding: { top: px(8), left: px(4) },
			width: { kind: "keyword" as const, keyword: "auto" as const },
			zIndex: 3,
		},
		style: {
			background: { kind: "solid" as const, color: red },
			radius: { topLeft: px(6) },
			opacity: 0.9,
			shadows: [
				{
					kind: "drop" as const,
					offsetX: px(0),
					offsetY: px(1),
					blur: px(2),
					color: red,
				},
			],
		},
		typography: {
			fontFamily: { kind: "literal" as const, value: "Inter Display" },
			fontSize: { kind: "literal" as const, value: px(16) },
			fontWeight: { kind: "literal" as const, value: 600 },
			lineHeight: { kind: "literal" as const, value: 1.5 },
			textAlign: "center" as const,
		},
	};

	it("materializes layout, style, and typography deterministically", () => {
		const first = resolveAuthoringStyle(input);
		const second = resolveAuthoringStyle(input);
		expect(second).toEqual(first);
		expect(first.inlineStyle).toMatchObject({
			display: "flex",
			gap: "24px",
			"padding-top": "8px",
			"padding-left": "4px",
			width: "auto",
			"z-index": 3,
			background: "#ff0000",
			"border-top-left-radius": "6px",
			opacity: 0.9,
			"box-shadow": "0px 1px 2px #ff0000",
			"font-family": '"Inter Display"',
			"font-size": "16px",
			"font-weight": "600",
			"line-height": "1.5",
			"text-align": "center",
		});
		expect(first.dataAttributes).toEqual({ "data-ak-node": "n1" });
		expect(first.diagnostics).toEqual([]);
	});

	it("never emits !important", () => {
		const styleText = JSON.stringify(resolveAuthoringStyle(input));
		expect(styleText).not.toContain("!important");
	});

	it("skips unresolved token refs with a warning diagnostic", () => {
		const result = resolveAuthoringStyle({
			nodeId: "n1",
			layout: { gap: { kind: "token", tokenId: "ghost" } },
		});
		expect(result.inlineStyle.gap).toBeUndefined();
		expect(result.diagnostics[0]?.code).toBe("EDITOR_INVALID_CSS_VALUE");
		expect(result.diagnostics[0]?.details?.reason).toBe("unresolved-token");
	});

	it("compiles hidden to display:none without touching layout.display", () => {
		const result = resolveAuthoringStyle({
			nodeId: "n1",
			layout: { display: "flex" },
			hidden: true,
		});
		expect(result.inlineStyle.display).toBe("none");
	});

	it("produces an empty style for empty input", () => {
		const result = resolveAuthoringStyle({ nodeId: "n1" });
		expect(result.inlineStyle).toEqual({});
		expect(result.classNames).toEqual([]);
	});
});
