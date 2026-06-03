/**
 * @file Tests for `PageSettingsDialog` (plan 0004 P3).
 *
 * Covers: form prefill from `StudioPage`, submit happy path with
 * diffed payload, SEO section rendering, host-error echo, and
 * route+path validation parity with `AddPageDialog`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageSettingsDialog } from "@/layout/sidebar/modules/layer/PageSettingsDialog";
import { EditorI18nProvider } from "@/state/index";
import type { StudioPage } from "@/types/pages";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return <EditorI18nProvider>{children}</EditorI18nProvider>;
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
	it("prefills the form from the page", () => {
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
		expect(
			(
				screen.getByTestId(
					"ak-layer-page-settings-about-meta-title-input",
				) as HTMLInputElement
			).value,
		).toBe("About Us");
	});

	it("renders the SEO section with all four fields", () => {
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
		expect(screen.getByTestId("ak-layer-page-settings-about-seo")).toBeTruthy();
		expect(
			screen.getByTestId("ak-layer-page-settings-about-meta-title-input"),
		).toBeTruthy();
		expect(
			screen.getByTestId("ak-layer-page-settings-about-meta-description-input"),
		).toBeTruthy();
		expect(
			screen.getByTestId("ak-layer-page-settings-about-og-image-input"),
		).toBeTruthy();
		expect(
			screen.getByTestId("ak-layer-page-settings-about-noindex-input"),
		).toBeTruthy();
	});

	it("submits only the changed fields and closes on success", async () => {
		const onSubmit = vi.fn().mockResolvedValue(undefined);
		const onOpenChange = vi.fn();
		render(
			<Setup>
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
		fireEvent.change(
			screen.getByTestId("ak-layer-page-settings-about-meta-description-input"),
			{ target: { value: "Who we are" } },
		);
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

	it("disables submit when route is on and path does not start with `/`", () => {
		const onSubmit = vi.fn();
		render(
			<Setup>
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
			<Setup>
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
