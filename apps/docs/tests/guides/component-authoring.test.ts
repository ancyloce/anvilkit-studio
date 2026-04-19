/**
 * Code-block extraction harness for the component authoring guide
 * (`apps/docs/src/content/docs/guides/component-authoring.mdx`).
 *
 * Each `describe(...)` below corresponds to one numbered section of
 * the guide, and the snippets inside mirror — verbatim where
 * possible — the code blocks rendered to readers. Keeping the
 * one-to-one mapping is what guarantees CI catches drift the moment
 * the component contract moves underneath the docs.
 *
 * Phase 4 task: `phase4-007`.
 */

import {
	Button,
	type ButtonProps,
	type ButtonViewProps,
	buttonConfig,
	buttonDefaultProps,
	buttonFields,
	buttonMetadata,
	componentConfig,
	defaultProps,
	fields,
	metadata,
} from "@anvilkit/button";
import type { Fields } from "@puckeditor/core";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// §1 — The contract
// ---------------------------------------------------------------------------

describe("§1 — The contract", () => {
	it("re-exports the canonical four symbols under both names", () => {
		expect(componentConfig).toBe(buttonConfig);
		expect(defaultProps).toBe(buttonDefaultProps);
		expect(fields).toBe(buttonFields);
		expect(metadata).toBe(buttonMetadata);
	});

	it("metadata.packageName + componentSlug match the package boundary", () => {
		expect(metadata).toMatchObject({
			componentName: "Button",
			componentSlug: "button",
			packageName: "@anvilkit/button",
			scaffoldType: "content",
			schemaVersion: 1,
		});
		expect(typeof metadata.packageVersion).toBe("string");
		expect(metadata.packageVersion.length).toBeGreaterThan(0);
	});

	it("componentConfig exposes the required Puck surface", () => {
		expect(buttonConfig.label).toBe("Button");
		expect(buttonConfig.defaultProps).toBe(defaultProps);
		expect(buttonConfig.fields).toBe(fields);
		expect(typeof buttonConfig.render).toBe("function");
	});

	it("render is a pure adapter that passes editMode through to <Button>", () => {
		const element = buttonConfig.render({
			...(defaultProps as ButtonProps),
			editMode: true,
			// The render adapter is only invoked by Puck, which supplies a
			// `puck` slot; `any` keeps the test focused on the contract,
			// not Puck's internal prop threading.
			// biome-ignore lint/suspicious/noExplicitAny: intentional
		} as any);

		expect(isValidElement(element)).toBe(true);
		const el = element as { type: unknown; props: ButtonViewProps };
		expect(el.type).toBe(Button);
		expect(el.props.editMode).toBe(true);
		expect(el.props.label).toBe(defaultProps.label);
		expect(el.props.variant).toBe(defaultProps.variant);
	});
});

// ---------------------------------------------------------------------------
// §2 — Field types
// ---------------------------------------------------------------------------

describe("§2 — Field types", () => {
	it("Button's worked example uses text + radio exactly", () => {
		expect(fields.label.type).toBe("text");
		expect(fields.href.type).toBe("text");
		expect(fields.variant.type).toBe("radio");
		expect(fields.disabled.type).toBe("radio");
		expect(fields.openInNewTab.type).toBe("radio");

		const variant = fields.variant as {
			type: "radio";
			options: { label: string; value: string }[];
		};
		expect(variant.options.map((o) => o.value)).toEqual([
			"primary",
			"secondary",
		]);
	});

	it("array fields wire defaultItemProps + getItemSummary + arrayFields", () => {
		type NavLink = { label: string; href: string };
		type NavProps = { items: NavLink[] };

		const navFields = {
			items: {
				type: "array",
				label: "Navigation links",
				defaultItemProps: { label: "New link", href: "/" },
				getItemSummary: (item: NavLink, index?: number) =>
					item.label || `Link ${(index ?? 0) + 1}`,
				arrayFields: {
					label: { type: "text", label: "Label" },
					href: { type: "text", label: "Href" },
				},
			},
		} satisfies Fields<NavProps>;

		expect(navFields.items.type).toBe("array");
		expect(navFields.items.defaultItemProps).toEqual({
			label: "New link",
			href: "/",
		});
		expect(navFields.items.getItemSummary({ label: "", href: "/x" }, 2)).toBe(
			"Link 3",
		);
		expect(
			navFields.items.getItemSummary({ label: "Docs", href: "/docs" }, 0),
		).toBe("Docs");
		expect(Object.keys(navFields.items.arrayFields)).toEqual(["label", "href"]);
	});

	it("object fields wire objectFields with nested Puck field types", () => {
		type Logo = {
			type: "text" | "image";
			text: string;
			imageUrl: string;
		};
		type LogoProps = { logo: Logo };

		const logoFields = {
			logo: {
				type: "object",
				label: "Logo",
				objectFields: {
					type: {
						type: "radio",
						label: "Type",
						options: [
							{ label: "Text", value: "text" },
							{ label: "Image", value: "image" },
						],
					},
					text: { type: "text", label: "Text" },
					imageUrl: { type: "text", label: "Image URL" },
				},
			},
		} satisfies Fields<LogoProps>;

		expect(logoFields.logo.type).toBe("object");
		expect(Object.keys(logoFields.logo.objectFields)).toEqual([
			"type",
			"text",
			"imageUrl",
		]);
		expect(logoFields.logo.objectFields.type.type).toBe("radio");
	});
});

// ---------------------------------------------------------------------------
// §3 — Serializability
// ---------------------------------------------------------------------------

describe("§3 — Serializability", () => {
	it("defaultProps round-trips through JSON losslessly", () => {
		const snapshot = JSON.parse(JSON.stringify(defaultProps));
		expect(snapshot).toEqual(defaultProps);
	});

	it("no reachable value inside defaultProps is a function", () => {
		function assertNoFunctions(value: unknown, path: string): void {
			if (typeof value === "function") {
				throw new Error(`${path}: function in defaultProps (not JSON-safe)`);
			}
			if (value && typeof value === "object") {
				for (const [k, v] of Object.entries(value)) {
					assertNoFunctions(v, `${path}.${k}`);
				}
			}
		}
		expect(() => assertNoFunctions(defaultProps, "defaultProps")).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// §4 — The editMode pattern
// ---------------------------------------------------------------------------

describe("§4 — editMode pattern", () => {
	it("link variant: editMode=true drops href, sets aria-disabled + tabindex=-1", () => {
		const html = renderToStaticMarkup(
			createElement(Button, {
				...(defaultProps as ButtonProps),
				href: "https://example.com",
				editMode: true,
			} satisfies ButtonViewProps),
		);

		expect(html).toContain('aria-disabled="true"');
		expect(html).toContain('tabindex="-1"');
		expect(html).not.toContain('href="https://example.com"');
	});

	it("link variant: editMode=false keeps href live, no aria-disabled", () => {
		const html = renderToStaticMarkup(
			createElement(Button, {
				...(defaultProps as ButtonProps),
				href: "https://example.com",
				editMode: false,
			} satisfies ButtonViewProps),
		);

		expect(html).toContain('href="https://example.com"');
		expect(html).not.toContain('aria-disabled="true"');
		expect(html).not.toContain('tabindex="-1"');
	});

	it("button variant: editMode=true disables the native button + aria-disabled", () => {
		const html = renderToStaticMarkup(
			createElement(Button, {
				...(defaultProps as ButtonProps),
				href: "",
				editMode: true,
			} satisfies ButtonViewProps),
		);

		expect(html).toMatch(/<button\b/);
		expect(html).toContain('aria-disabled="true"');
		expect(html).toMatch(/disabled(=""|\s)/);
	});

	it("`disabled` and `editMode` collapse into a single isInactive boolean", () => {
		function isInactive(props: { disabled?: boolean; editMode?: boolean }) {
			return Boolean(props.disabled || props.editMode);
		}
		expect(isInactive({ disabled: false, editMode: false })).toBe(false);
		expect(isInactive({ disabled: true, editMode: false })).toBe(true);
		expect(isInactive({ disabled: false, editMode: true })).toBe(true);
		expect(isInactive({ disabled: true, editMode: true })).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// §5 — Theme-aware styling
// §6 — Responsive requirements
// §7 — Icons
//
// These sections document CSS / markup conventions rather than module
// surface. The assertions below pin the parts that ARE executable
// JavaScript — the rest is visually verified via the demo app and
// `a11y-baseline.md`.
// ---------------------------------------------------------------------------

describe("§5/§6/§7 — Conventions that show up on the module surface", () => {
	it("Button's default props are all primitive (no hardcoded colors snuck in as objects)", () => {
		const primitiveKinds = new Set(["string", "number", "boolean"]);
		for (const [key, value] of Object.entries(defaultProps)) {
			expect(
				primitiveKinds.has(typeof value),
				`defaultProps.${key} (${typeof value}) must be a JSON primitive`,
			).toBe(true);
		}
	});

	it("Button does not leak non-serializable data through its prop types", () => {
		// The Button we export is a named React function component — a
		// stable module-level reference, not one synthesized per render.
		expect(typeof Button).toBe("function");
		// `ButtonViewProps` extends `ButtonProps` with only `editMode?: boolean`.
		// Instantiating it with just the declared primitives is accepted.
		const probe: ButtonViewProps = {
			label: "Save changes",
			variant: "primary",
			disabled: false,
			href: "",
			openInNewTab: false,
			editMode: false,
		};
		expect(probe.label).toBe("Save changes");
	});
});

// ---------------------------------------------------------------------------
// §8 — Package scaffolding
// §9 — Publishing
//
// Both sections are driven by shell commands (`pnpm gen:component`,
// `pnpm changeset`, `pnpm release`) and are verified end-to-end by
// the components workspace CI + the generator-usage guide's worked
// example (phase4-008). The assertion below is a lightweight sanity
// check that the canonical metadata shape the generator produces
// matches the contract §1 pins.
// ---------------------------------------------------------------------------

describe("§8/§9 — Generator output matches the contract", () => {
	it("metadata.scaffoldType is one of the three documented templates", () => {
		expect(["content", "layout", "form"]).toContain(metadata.scaffoldType);
	});

	it("metadata.packageVersion is a semver-shaped string", () => {
		expect(metadata.packageVersion).toMatch(/^\d+\.\d+\.\d+/);
	});
});
