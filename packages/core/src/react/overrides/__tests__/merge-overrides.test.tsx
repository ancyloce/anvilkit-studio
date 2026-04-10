/**
 * @file Tests for `mergeOverrides` (task `core-014`).
 *
 * This file pins the per-key composition contract that resolves
 * architecture §18 item #1 — the "multiple plugins touching the
 * same override key must compose, not overwrite" correctness risk.
 *
 * Coverage:
 *
 * - Empty input returns an empty object.
 * - Two plugins both supplying `fieldLabel` are composed — **both**
 *   marker strings appear in the rendered output in registration
 *   order. A flat `{...a, ...b}` spread would fail this test because
 *   the first plugin's contribution would be discarded.
 * - Plugins touching independent keys (`fieldLabel` vs. `drawer`)
 *   each land in their own key with no cross-talk.
 * - A single plugin's override passes through as the verbatim render
 *   function (no pointless wrapper) when there is nothing to
 *   compose against.
 * - A non-function value for a non-`fieldTypes` key throws a
 *   `TypeError` with a message naming the offending key.
 * - The `fieldTypes` special case composes per inner field-type
 *   name, mirroring the top-level composition semantics.
 * - A non-function value inside a `fieldTypes` dictionary throws a
 *   `TypeError` naming `fieldTypes.<fieldName>`.
 * - `undefined` entries in the input array and `undefined` values
 *   for individual keys are tolerated (so consumers can pass
 *   `props.overrides ?? {}` without extra guards).
 */

import type { Overrides as PuckOverrides } from "@puckeditor/core";
import { render } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { mergeOverrides } from "../merge-overrides.js";

/**
 * Synthetic render helper that takes a merged `fieldLabel`
 * override, invokes it with a fixed set of props containing a
 * "DEFAULT" sentinel as `children`, and returns the resulting
 * container HTML. Used by the composition tests to assert the final
 * wrapped output contains every contributing plugin's marker in the
 * correct nesting order.
 *
 * Uses `testing-library/react` rather than
 * `react-dom/server.renderToString` because `render()` is the
 * project's standard harness and already available for the
 * `<Studio>` tests in this milestone.
 */
function renderFieldLabel(
	override: NonNullable<PuckOverrides["fieldLabel"]>,
): string {
	const element = override({
		children: "DEFAULT",
		label: "Test",
	}) as ReactElement;
	const { container } = render(element);
	return container.innerHTML;
}

describe("mergeOverrides — empty input", () => {
	it("returns an empty object for an empty array", () => {
		expect(mergeOverrides([])).toEqual({});
	});

	it("tolerates `undefined` entries in the input", () => {
		// Cast because the public type is strict about `undefined`
		// entries, but the implementation has to be defensive because
		// `[...runtime.overrides, consumer ?? {}]` is a common caller
		// pattern and the runtime could hand through an empty spot.
		const input = [
			undefined,
			{
				fieldLabel: ({ children }: { children?: ReactNode }) => (
					<span data-label="only">{children}</span>
				),
			},
		] as unknown as readonly Partial<PuckOverrides>[];
		const merged = mergeOverrides(input);
		expect(merged.fieldLabel).toBeDefined();
	});

	it("tolerates `undefined` values for individual keys", () => {
		const merged = mergeOverrides([
			{
				fieldLabel: undefined,
				drawer: ({ children }) => <div>{children}</div>,
			},
		]);
		expect(merged.fieldLabel).toBeUndefined();
		expect(merged.drawer).toBeDefined();
	});
});

describe("mergeOverrides — single-plugin passthrough", () => {
	it("returns the exact function reference when only one plugin touches a key", () => {
		const fn: NonNullable<PuckOverrides["fieldLabel"]> = ({ children }) => (
			<span>{children}</span>
		);
		const merged = mergeOverrides([{ fieldLabel: fn }]);
		// Identity check — no pointless wrapper was introduced.
		expect(merged.fieldLabel).toBe(fn);
	});
});

describe("mergeOverrides — per-key composition", () => {
	it("composes two `fieldLabel` plugins so both markers appear in registration order", () => {
		// Plugin A wraps children with a `data-a` span marker.
		// Registration order: A before B → A should be innermost,
		// B should be outermost.
		const pluginA: Partial<PuckOverrides> = {
			fieldLabel: ({ children }) => (
				<span data-marker="a">[A]{children}[/A]</span>
			),
		};
		const pluginB: Partial<PuckOverrides> = {
			fieldLabel: ({ children }) => (
				<span data-marker="b">[B]{children}[/B]</span>
			),
		};

		const merged = mergeOverrides([pluginA, pluginB]);
		expect(merged.fieldLabel).toBeDefined();

		const html = renderFieldLabel(
			merged.fieldLabel as NonNullable<PuckOverrides["fieldLabel"]>,
		);

		// Both markers must be present — a flat spread would drop
		// one of them.
		expect(html).toContain("data-marker=\"a\"");
		expect(html).toContain("data-marker=\"b\"");
		expect(html).toContain("DEFAULT");

		// And the nesting order must be outer-B → inner-A → default,
		// because plugin A registered first and should be the
		// innermost wrapper.
		const bIndex = html.indexOf("data-marker=\"b\"");
		const aIndex = html.indexOf("data-marker=\"a\"");
		const defaultIndex = html.indexOf("DEFAULT");
		expect(bIndex).toBeLessThan(aIndex);
		expect(aIndex).toBeLessThan(defaultIndex);
	});

	it("composes three plugins in the correct nesting order", () => {
		const wrap =
			(name: string): NonNullable<PuckOverrides["fieldLabel"]> =>
			({ children }) => (
				<span data-layer={name}>
					[{name}]{children}[/{name}]
				</span>
			);

		const merged = mergeOverrides([
			{ fieldLabel: wrap("a") },
			{ fieldLabel: wrap("b") },
			{ fieldLabel: wrap("c") },
		]);

		const html = renderFieldLabel(
			merged.fieldLabel as NonNullable<PuckOverrides["fieldLabel"]>,
		);

		// Expected order of appearance in the HTML:
		// c (outermost) → b → a → DEFAULT.
		const cIdx = html.indexOf("data-layer=\"c\"");
		const bIdx = html.indexOf("data-layer=\"b\"");
		const aIdx = html.indexOf("data-layer=\"a\"");
		const defIdx = html.indexOf("DEFAULT");
		expect(cIdx).toBeGreaterThanOrEqual(0);
		expect(bIdx).toBeGreaterThan(cIdx);
		expect(aIdx).toBeGreaterThan(bIdx);
		expect(defIdx).toBeGreaterThan(aIdx);
	});
});

describe("mergeOverrides — independent keys", () => {
	it("keeps keys from different plugins independent", () => {
		const fieldLabelFn: NonNullable<PuckOverrides["fieldLabel"]> = ({
			children,
		}) => <span data-kind="field">{children}</span>;
		const drawerFn: NonNullable<PuckOverrides["drawer"]> = ({
			children,
		}) => <div data-kind="drawer">{children}</div>;

		const merged = mergeOverrides([
			{ fieldLabel: fieldLabelFn },
			{ drawer: drawerFn },
		]);

		// Each key should land once, pointing at its contributor's
		// raw function (since each is the only plugin touching its
		// key, no wrapping should occur).
		expect(merged.fieldLabel).toBe(fieldLabelFn);
		expect(merged.drawer).toBe(drawerFn);
	});
});

describe("mergeOverrides — validation", () => {
	it("throws a TypeError when a top-level override is not a function", () => {
		// Cast through `unknown` — the typed API refuses non-function
		// values, but the runtime guard exists because plugin authors
		// can still pass bad data through dynamic imports or generated
		// code.
		const bad = {
			fieldLabel: "nope",
		} as unknown as Partial<PuckOverrides>;
		expect(() => mergeOverrides([bad])).toThrow(TypeError);
		expect(() => mergeOverrides([bad])).toThrow(/fieldLabel/);
		expect(() => mergeOverrides([bad])).toThrow(/string/);
	});

	it("names the offending key in the error message", () => {
		const bad = { drawer: 42 } as unknown as Partial<PuckOverrides>;
		expect(() => mergeOverrides([bad])).toThrow(/"drawer"/);
	});
});

describe("mergeOverrides — fieldTypes special case", () => {
	it("composes per inner field-type name", () => {
		// Puck's `fieldTypes` is `fieldType → FunctionComponent`, so
		// two plugins both overriding `fieldTypes.text` should
		// compose the same way top-level keys do.
		const pluginA = {
			fieldTypes: {
				text: ({ children }: { children?: ReactNode }) => (
					<span data-level="a">{children}</span>
				),
			},
		} as unknown as Partial<PuckOverrides>;
		const pluginB = {
			fieldTypes: {
				text: ({ children }: { children?: ReactNode }) => (
					<span data-level="b">{children}</span>
				),
			},
		} as unknown as Partial<PuckOverrides>;

		const merged = mergeOverrides([pluginA, pluginB]);
		const fieldTypes = merged.fieldTypes as unknown as Record<
			string,
			((props: { children?: ReactNode }) => ReactElement) | undefined
		>;
		const textRenderer = fieldTypes.text;
		expect(typeof textRenderer).toBe("function");
		if (textRenderer === undefined) {
			throw new Error("textRenderer was undefined");
		}

		const { container } = render(textRenderer({ children: "VAL" }));
		expect(container.innerHTML).toContain("data-level=\"a\"");
		expect(container.innerHTML).toContain("data-level=\"b\"");
		// Same nesting rule: B (registered last) is outermost, A is
		// innermost.
		const bIdx = container.innerHTML.indexOf("data-level=\"b\"");
		const aIdx = container.innerHTML.indexOf("data-level=\"a\"");
		expect(bIdx).toBeLessThan(aIdx);
	});

	it("leaves unrelated field-type keys untouched", () => {
		const textFn = ({ children }: { children?: ReactNode }) => (
			<span>{children}</span>
		);
		const numberFn = ({ children }: { children?: ReactNode }) => (
			<span>{children}</span>
		);
		const merged = mergeOverrides([
			{ fieldTypes: { text: textFn } } as unknown as Partial<PuckOverrides>,
			{
				fieldTypes: { number: numberFn },
			} as unknown as Partial<PuckOverrides>,
		]);
		const fieldTypes = merged.fieldTypes as unknown as Record<
			string,
			unknown
		>;
		expect(fieldTypes.text).toBe(textFn);
		expect(fieldTypes.number).toBe(numberFn);
	});

	it("throws a TypeError when a fieldTypes entry is not a function", () => {
		const bad = {
			fieldTypes: { text: "not a function" },
		} as unknown as Partial<PuckOverrides>;
		expect(() => mergeOverrides([bad])).toThrow(TypeError);
		expect(() => mergeOverrides([bad])).toThrow(/fieldTypes\.text/);
	});
});
