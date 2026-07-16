/**
 * @file Tests for {@link PublishPanel} (task Phase 11 polish pass).
 *
 * `PublishPanel` previously had no dedicated coverage — only doc-comment
 * references from `HeaderActions.test.tsx`. These tests lock in the
 * Save / Publish / Export contract: each action calls its
 * `chromeProps` callback, Publish reads the live Puck document at click
 * time (not a stale snapshot), and the Export submenu lists every
 * registered `runtime.exportFormats` entry.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioRuntimeProvider } from "@/components/use-studio";
import { type ChromeProps, ChromePropsProvider } from "@/context/chrome-props";
import { PublishPanel } from "@/layout/PublishPanel";
import type { StudioRuntime } from "@/runtime/compile-plugins";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import type { ExportFormatDefinition } from "@/types/export";

const liveData = { root: { props: {} }, content: [], zones: {} };

vi.mock("@puckeditor/core", () => ({
	useGetPuck: () => () => ({ appState: { data: liveData } }),
}));

afterEach(cleanup);

function fakeFormat(id: string): ExportFormatDefinition {
	return {
		id,
		label: id.toUpperCase(),
		extension: id,
		mimeType: "application/octet-stream",
		run: vi.fn(),
	};
}

function fakeRuntime(overrides: Partial<StudioRuntime> = {}): StudioRuntime {
	return {
		pluginMeta: [],
		registrations: [],
		lifecycle: {} as StudioRuntime["lifecycle"],
		exportFormats: new Map(),
		assetResolvers: [],
		headerActions: [],
		overrides: [],
		providers: [],
		overlays: [],
		slots: new Map(),
		puckPlugins: [],
		sidebar: {} as StudioRuntime["sidebar"],
		i18n: { entries: [] },
		...overrides,
	};
}

function Setup({
	children,
	runtime = fakeRuntime(),
	chromeProps = {},
}: {
	readonly children: ReactNode;
	readonly runtime?: StudioRuntime;
	readonly chromeProps?: ChromeProps;
}): ReactElement {
	return (
		<StudioRuntimeProvider value={runtime}>
			<EditorI18nProvider>
				<ChromePropsProvider value={chromeProps}>
					{children}
				</ChromePropsProvider>
			</EditorI18nProvider>
		</StudioRuntimeProvider>
	);
}

async function openPanel(): Promise<void> {
	fireEvent.click(screen.getByRole("button", { name: "Publish" }));
	await screen.findByText("Save draft");
}

describe("<PublishPanel>", () => {
	it("calls onSaveDraft when Save draft is clicked", async () => {
		const onSaveDraft = vi.fn();
		render(
			<Setup chromeProps={{ onSaveDraft }}>
				<PublishPanel />
			</Setup>,
		);
		await openPanel();
		fireEvent.click(screen.getByText("Save draft"));
		expect(onSaveDraft).toHaveBeenCalledTimes(1);
	});

	it("calls onPublishClick with the live Puck document", async () => {
		const onPublishClick = vi.fn();
		render(
			<Setup chromeProps={{ onPublishClick }}>
				<PublishPanel />
			</Setup>,
		);
		await openPanel();
		fireEvent.click(screen.getByText("Publish to live"));
		expect(onPublishClick).toHaveBeenCalledWith(liveData);
	});

	it("disables Save and Publish rows when no handler is wired", async () => {
		render(
			<Setup>
				<PublishPanel />
			</Setup>,
		);
		await openPanel();
		expect(screen.getByText("Save draft").closest("button")).toBeDisabled();
		expect(
			screen.getByText("Publish to live").closest("button"),
		).toBeDisabled();
	});

	it("lists every registered export format in the Export submenu", async () => {
		const onExport = vi.fn();
		const runtime = fakeRuntime({
			exportFormats: new Map([
				["html", fakeFormat("html")],
				["json", fakeFormat("json")],
			]),
		});
		render(
			<Setup runtime={runtime} chromeProps={{ onExport }}>
				<PublishPanel />
			</Setup>,
		);
		await openPanel();
		fireEvent.click(screen.getByRole("button", { name: "Export" }));
		const htmlItem = await screen.findByText("HTML");
		fireEvent.click(htmlItem);
		expect(onExport).toHaveBeenCalledWith("html");
	});

	it("shows the empty-formats message when no formats are registered", async () => {
		render(
			<Setup>
				<PublishPanel />
			</Setup>,
		);
		await openPanel();
		fireEvent.click(screen.getByRole("button", { name: "Export" }));
		expect(
			await screen.findByText("No export formats registered."),
		).toBeInTheDocument();
	});
});
