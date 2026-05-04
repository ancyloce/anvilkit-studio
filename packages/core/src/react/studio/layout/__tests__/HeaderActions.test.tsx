/**
 * @file End-to-end tests for `<HeaderActions>` (Phase 4 acceptance).
 *
 * Exercises three contracts:
 *
 * 1. **Composition + grouping.** A 5-button fixture mirroring the
 *    four UI-emitting v1 plugins (asset-manager × 1, export-html × 1,
 *    export-react × 1, version-history × 2) renders the right number
 *    of buttons in the right groups, ordered by `(group, order, id)`.
 * 2. **Disabled predicate.** A button whose `disabled(ctx)` returns
 *    true is rendered with the `disabled` attribute set.
 * 3. **Error handling.** An `onClick` that rejects is logged via
 *    `ctx.log("error", …)` (PRD §9.2). The component does not unmount
 *    when this happens.
 */

import {
	cleanup,
	fireEvent,
	type RenderResult,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HeaderActions } from "@/layout/HeaderActions";
import type { StudioHeaderAction, StudioPluginContext } from "@/types/plugin";

afterEach(cleanup);

function createCtx(
	overrides?: Partial<StudioPluginContext>,
): StudioPluginContext {
	const log = vi.fn();
	const studioConfig = {} as StudioPluginContext["studioConfig"];
	const ctx: StudioPluginContext = {
		getData: () => ({
			root: { props: {} },
			content: [],
			zones: {},
		}),
		getPuckApi: () => ({}) as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig,
		log,
		emit: () => undefined,
		registerAssetResolver: () => undefined,
		...overrides,
	};
	return ctx;
}

/**
 * Mirror of the v1 plugin set's header-action contributions. Total
 * is 5 buttons across all three groups so the test asserts the
 * full grouping/ordering surface in one render.
 */
function buildFixture(
	onClicks: {
		assetManager?: () => void | Promise<void>;
		exportHtml?: () => void | Promise<void>;
		exportReact?: () => void | Promise<void>;
		versionSave?: () => void | Promise<void>;
		versionOpen?: () => void | Promise<void>;
	} = {},
): readonly StudioHeaderAction[] {
	return [
		{
			id: "export-html",
			label: "Export HTML",
			group: "primary",
			order: 0,
			onClick: onClicks.exportHtml ?? (() => undefined),
		},
		{
			id: "version-history-save",
			label: "Save snapshot",
			group: "secondary",
			order: 50,
			onClick: onClicks.versionSave ?? (() => undefined),
		},
		{
			id: "asset-manager-upload",
			label: "Upload asset",
			group: "secondary",
			order: 100,
			onClick: onClicks.assetManager ?? (() => undefined),
		},
		{
			id: "export-react",
			label: "Export React",
			group: "secondary",
			order: 200,
			onClick: onClicks.exportReact ?? (() => undefined),
		},
		{
			id: "version-history-open",
			label: "Open history",
			group: "overflow",
			order: 0,
			onClick: onClicks.versionOpen ?? (() => undefined),
		},
	] as const;
}

function mount(
	actions: readonly StudioHeaderAction[],
	ctx: StudioPluginContext,
): RenderResult {
	return render(<HeaderActions actions={actions} ctx={ctx} />);
}

describe("HeaderActions composition + grouping", () => {
	it("renders 5 buttons covering primary/secondary/overflow", () => {
		const ctx = createCtx();
		mount(buildFixture(), ctx);

		// Primary
		expect(
			screen.getByRole("button", { name: "Export HTML" }),
		).toBeInTheDocument();
		// Secondary (3)
		expect(
			screen.getByRole("button", { name: "Save snapshot" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Upload asset" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Export React" }),
		).toBeInTheDocument();
		// Overflow opens to expose the menu items
		fireEvent.click(screen.getByRole("button", { name: "More actions" }));
		expect(
			screen.getByRole("menuitem", { name: "Open history" }),
		).toBeInTheDocument();

		// 5 plugin buttons total + 1 overflow trigger
		const pluginLabels = [
			screen.getByRole("button", { name: "Export HTML" }),
			screen.getByRole("button", { name: "Save snapshot" }),
			screen.getByRole("button", { name: "Upload asset" }),
			screen.getByRole("button", { name: "Export React" }),
			screen.getByRole("menuitem", { name: "Open history" }),
		];
		expect(pluginLabels).toHaveLength(5);
	});

	it("orders secondary buttons by their `order` field", () => {
		const ctx = createCtx();
		const { container } = mount(buildFixture(), ctx);
		const buttons = Array.from(container.querySelectorAll("button")).map(
			(b) => b.textContent ?? "",
		);
		// Expected secondary order: Save snapshot (50), Upload asset (100),
		// Export React (200). Strip out primary/overflow buttons that frame
		// the secondary group.
		const secondary = buttons.filter(
			(t) =>
				t.includes("Save snapshot") ||
				t.includes("Upload asset") ||
				t.includes("Export React"),
		);
		expect(secondary).toEqual([
			"Save snapshot",
			"Upload asset",
			"Export React",
		]);
	});

	it("renders nothing when both actions and ctx are absent", () => {
		const { container } = render(<HeaderActions />);
		expect(container.textContent).toBe("");
	});
});

describe("HeaderActions disabled predicate", () => {
	it("disables buttons whose `disabled(ctx)` returns true", () => {
		const ctx = createCtx();
		const actions: readonly StudioHeaderAction[] = [
			{
				id: "publish",
				label: "Publish",
				group: "primary",
				disabled: () => true,
				onClick: () => undefined,
			},
			{
				id: "save",
				label: "Save",
				group: "secondary",
				disabled: () => false,
				onClick: () => undefined,
			},
		];
		mount(actions, ctx);
		expect(screen.getByRole("button", { name: "Publish" })).toBeDisabled();
		expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
	});

	it("forwards `ctx` to the disabled predicate", () => {
		const ctx = createCtx();
		const disabled = vi.fn(() => false);
		const actions: readonly StudioHeaderAction[] = [
			{
				id: "publish",
				label: "Publish",
				group: "primary",
				disabled,
				onClick: () => undefined,
			},
		];
		mount(actions, ctx);
		expect(disabled).toHaveBeenCalledWith(ctx);
	});
});

describe("HeaderActions error handling", () => {
	it("logs onClick rejections via ctx.log without unmounting", async () => {
		const log = vi.fn();
		const ctx = createCtx({ log });
		const failing = vi.fn(() => Promise.reject(new Error("boom")));
		const actions: readonly StudioHeaderAction[] = [
			{
				id: "broken",
				label: "Broken action",
				group: "primary",
				onClick: failing,
			},
		];
		mount(actions, ctx);

		const button = screen.getByRole("button", { name: "Broken action" });
		fireEvent.click(button);

		await waitFor(() => {
			expect(log).toHaveBeenCalled();
		});
		const [level, message, meta] = log.mock.calls[0] ?? [];
		expect(level).toBe("error");
		expect(typeof message).toBe("string");
		expect(message as string).toContain("broken");
		expect((meta as { message?: string } | undefined)?.message).toBe("boom");
		// Component still mounted — assertion is presence after the
		// click + log resolution.
		expect(
			screen.getByRole("button", { name: "Broken action" }),
		).toBeInTheDocument();
	});

	it("re-enables the button after a rejection resolves", async () => {
		const log = vi.fn();
		const ctx = createCtx({ log });
		const failing = vi.fn(() => Promise.reject(new Error("boom")));
		const actions: readonly StudioHeaderAction[] = [
			{
				id: "broken",
				label: "Broken action",
				group: "primary",
				onClick: failing,
			},
		];
		mount(actions, ctx);
		const button = screen.getByRole("button", { name: "Broken action" });
		fireEvent.click(button);
		await waitFor(() => {
			expect(log).toHaveBeenCalled();
		});
		// Pending state cleared — button is interactable again.
		expect(button).not.toBeDisabled();
	});

	it("logs synchronous throws as well", async () => {
		const log = vi.fn();
		const ctx = createCtx({ log });
		const actions: readonly StudioHeaderAction[] = [
			{
				id: "sync-throw",
				label: "Sync throw",
				group: "primary",
				onClick: () => {
					throw new Error("sync boom");
				},
			},
		];
		mount(actions, ctx);
		fireEvent.click(screen.getByRole("button", { name: "Sync throw" }));
		await waitFor(() => {
			expect(log).toHaveBeenCalled();
		});
		expect(log.mock.calls[0]?.[0]).toBe("error");
	});
});
