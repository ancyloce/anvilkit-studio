/**
 * @file Tests for `PageSettingsDialog` (plan 0004 P3; M4 seam refactor).
 *
 * Covers: form prefill from `StudioPage`, submit happy path with a
 * diffed payload, the page-settings SEO seam (fields rendered only when
 * a plugin registers `pageSettingsSeoFields`; no section otherwise),
 * `canonical` round-trip (M3 follow-up), host-error echo, and route+path
 * validation parity with `AddPageDialog`.
 *
 * The SEO field UI now lives in `@anvilkit/plugin-page-seo`; core only
 * owns the dialog shell, the form state, and the diff. These tests stand
 * in a minimal fake `StudioPageSettingsSeoFields` so the seam contract
 * (`value`/`onChange`) is exercised without the plugin dependency.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactElement, type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSettingsDialog } from "@/layout/sidebar/modules/layer/components/PageSettingsDialog";
import { EditorI18nProvider } from "@/state/index";
import { SidebarRegistryProvider } from "@/state/sidebar-registry/SidebarRegistryProvider";
import { createSidebarRegistryStore } from "@/state/sidebar-registry/sidebar-registry-store";
import type { StudioPage } from "@/types/pages";
import type { StudioPageSettingsSeoFields } from "@/types/sidebar";

afterEach(cleanup);

/**
 * Minimal stand-in for the plugin-registered SEO field group. Renders
 * controlled inputs for the fields the diff/round-trip tests touch
 * (metaTitle, metaDescription, canonical), spreading `value` so untouched
 * keys — including the page's existing `canonical` — survive an edit.
 */
const fakeSeoFields: StudioPageSettingsSeoFields = {
	render: ({ value, onChange }) => (
		<div data-testid="fake-seo-fields">
			<input
				data-testid="fake-seo-meta-title"
				value={value.metaTitle ?? ""}
				onChange={(e) => onChange({ ...value, metaTitle: e.target.value })}
			/>
			<input
				data-testid="fake-seo-meta-description"
				value={value.metaDescription ?? ""}
				onChange={(e) =>
					onChange({ ...value, metaDescription: e.target.value })
				}
			/>
			<input
				data-testid="fake-seo-canonical"
				value={value.canonical ?? ""}
				onChange={(e) => onChange({ ...value, canonical: e.target.value })}
			/>
		</div>
	),
};

function Setup({
	children,
	seoFields,
}: {
	readonly children: ReactNode;
	readonly seoFields?: StudioPageSettingsSeoFields;
}): ReactElement {
	const [store] = useState(() => {
		const s = createSidebarRegistryStore();
		if (seoFields) {
			s.getState().registerPageSettingsSeoFields(seoFields);
		}
		return s;
	});
	return (
		<EditorI18nProvider>
			<SidebarRegistryProvider value={store}>
				{children}
			</SidebarRegistryProvider>
		</EditorI18nProvider>
	);
}

const PAGE: StudioPage = {
	id: "about",
	title: "About",
	path: "/about",
	route: true,
	description: "About page",
	seo: { metaTitle: "About Us", noindex: false },
};

describe("PageSettingsDialog", () => {
	it("prefills the form (incl. the SEO seam's value) from the page", () => {
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={() => undefined}
					page={PAGE}
					onSubmit={vi.fn()}
				/>
			</Setup>,
		);
		expect(
			(
				screen.getByTestId(
					"ak-layer-page-settings-about-title-input",
				) as HTMLInputElement
			).value,
		).toBe("About");
		expect(
			(
				screen.getByTestId(
					"ak-layer-page-settings-about-path-input",
				) as HTMLInputElement
			).value,
		).toBe("/about");
		// SEO `value` is threaded into the registered fields.
		expect(
			(screen.getByTestId("fake-seo-meta-title") as HTMLInputElement).value,
		).toBe("About Us");
	});

	it("renders the SEO section + plugin fields when a plugin is registered", () => {
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={() => undefined}
					page={PAGE}
					onSubmit={vi.fn()}
				/>
			</Setup>,
		);
		expect(screen.getByTestId("ak-layer-page-settings-about-seo")).toBeTruthy();
		expect(screen.getByTestId("fake-seo-fields")).toBeTruthy();
	});

	it("renders NO SEO section when no plugin is registered", () => {
		render(
			<Setup>
				<PageSettingsDialog
					open
					onOpenChange={() => undefined}
					page={PAGE}
					onSubmit={vi.fn()}
				/>
			</Setup>,
		);
		// Non-SEO fields still render…
		expect(
			screen.getByTestId("ak-layer-page-settings-about-title-input"),
		).toBeTruthy();
		// …but the SEO section + fields are absent without the plugin.
		expect(screen.queryByTestId("ak-layer-page-settings-about-seo")).toBeNull();
		expect(screen.queryByTestId("fake-seo-fields")).toBeNull();
	});

	it("submits only the changed fields and closes on success", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={onOpenChange}
					page={PAGE}
					onSubmit={onSubmit}
				/>
			</Setup>,
		);
		fireEvent.change(
			screen.getByTestId("ak-layer-page-settings-about-title-input"),
			{ target: { value: "About us" } },
		);
		fireEvent.change(screen.getByTestId("fake-seo-meta-description"), {
			target: { value: "Who we are" },
		});
		fireEvent.click(screen.getByTestId("ak-layer-page-settings-about-submit"));
		await vi.waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});
		const payload = onSubmit.mock.calls[0]?.[0];
		expect(payload).toMatchObject({
			id: "about",
			title: "About us",
			seo: { metaTitle: "About Us", metaDescription: "Who we are" },
		});
		// Path / route / description unchanged → omitted.
		expect(payload).not.toHaveProperty("path");
		expect(payload).not.toHaveProperty("route");
		expect(payload).not.toHaveProperty("description");
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("carries `canonical` through the seam on submit (M3 follow-up)", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={vi.fn()}
					page={PAGE}
					onSubmit={onSubmit}
				/>
			</Setup>,
		);
		fireEvent.change(screen.getByTestId("fake-seo-canonical"), {
			target: { value: "https://example.com/about" },
		});
		fireEvent.click(screen.getByTestId("ak-layer-page-settings-about-submit"));
		await vi.waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});
		const payload = onSubmit.mock.calls[0]?.[0];
		expect(payload.seo).toMatchObject({
			metaTitle: "About Us",
			canonical: "https://example.com/about",
		});
	});

	it("preserves an existing `canonical` when only a non-SEO field changes", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const pageWithCanonical: StudioPage = {
			...PAGE,
			seo: { metaTitle: "About Us", canonical: "https://example.com/about" },
		};
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={vi.fn()}
					page={pageWithCanonical}
					onSubmit={onSubmit}
				/>
			</Setup>,
		);
		fireEvent.change(
			screen.getByTestId("ak-layer-page-settings-about-title-input"),
			{ target: { value: "Renamed" } },
		);
		fireEvent.click(screen.getByTestId("ak-layer-page-settings-about-submit"));
		await vi.waitFor(() => {
			expect(onSubmit).toHaveBeenCalledTimes(1);
		});
		const payload = onSubmit.mock.calls[0]?.[0];
		// SEO untouched → `seo` omitted entirely, so the host keeps the
		// stored block (incl. canonical) verbatim.
		expect(payload).toMatchObject({ id: "about", title: "Renamed" });
		expect(payload).not.toHaveProperty("seo");
	});

	it("disables submit when route is on and path does not start with `/`", () => {
		const onSubmit = vi.fn();
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={() => undefined}
					page={PAGE}
					onSubmit={onSubmit}
				/>
			</Setup>,
		);
		fireEvent.change(
			screen.getByTestId("ak-layer-page-settings-about-path-input"),
			{ target: { value: "about-us" } },
		);
		const submit = screen.getByTestId(
			"ak-layer-page-settings-about-submit",
		) as HTMLButtonElement;
		expect(submit.disabled).toBe(true);
		fireEvent.click(submit);
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("echoes a host error inline and keeps the dialog open", async () => {
		const onSubmit = vi.fn().mockRejectedValue(new Error("path taken"));
		const onOpenChange = vi.fn();
		render(
			<Setup seoFields={fakeSeoFields}>
				<PageSettingsDialog
					open
					onOpenChange={onOpenChange}
					page={PAGE}
					onSubmit={onSubmit}
				/>
			</Setup>,
		);
		fireEvent.change(
			screen.getByTestId("ak-layer-page-settings-about-title-input"),
			{ target: { value: "Renamed" } },
		);
		fireEvent.click(screen.getByTestId("ak-layer-page-settings-about-submit"));
		const err = await screen.findByTestId("ak-layer-page-settings-about-error");
		expect(err.textContent).toBe("path taken");
		// onOpenChange(false) was NOT called for the close-on-success path.
		expect(onOpenChange).not.toHaveBeenCalledWith(false);
	});
});
