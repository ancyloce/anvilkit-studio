/**
 * `BindingsSection` — the §19 binding editor
 * (PLAN-0020 CORE-P3-006; ED-BIND-002/003).
 *
 * The behaviour worth pinning is the honest reporting of §19's
 * containment failures. An author who hit the 2 MiB cap or a timeout
 * must not be shown an empty box that reads as "your data is empty".
 */

import type {
	EditorCommand,
	EditorDataSourceAdapter,
	JsonValue,
} from "@anvilkit/contracts/editor";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { BindingsSection } from "../bindings/BindingsSection.js";
import type { EditorInspectorContext } from "../inspector/use-inspector.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

function adapter(
	getPreviewData: EditorDataSourceAdapter["getPreviewData"],
): EditorDataSourceAdapter {
	return {
		listSources: async () => [{ id: "s1", name: "Products" }],
		getSchema: async () => ({ type: "object" }),
		getPreviewData,
	};
}

function renderSection(
	dataSourceAdapter: EditorDataSourceAdapter | undefined,
	execute = vi.fn(async (_command: EditorCommand) => ({
		status: "changed" as const,
		errors: [],
	})),
): { execute: typeof execute } {
	const bridge = {
		editorConfig: dataSourceAdapter === undefined ? {} : { dataSourceAdapter },
	} as never;
	const context = {
		revision: 0,
		authoring: { bindings: {} },
		selection: { primaryId: "n1", selectedIds: ["n1"] },
		commands: { execute },
	} as unknown as EditorInspectorContext;

	render(
		<EditorI18nProvider>
			<StudioEditorBridgeContext value={bridge}>
				<BindingsSection context={context} />
			</StudioEditorBridgeContext>
		</EditorI18nProvider>,
	);
	return { execute };
}

afterEach(() => {
	cleanup();
});

describe("BindingsSection", () => {
	it("hides entirely when the host configured no adapter", () => {
		// §19 makes the adapter the only source of bindable data.
		renderSection(undefined);
		expect(screen.queryByTestId("ak-bindings-section")).toBeNull();
	});

	it("renders the form once sources load", async () => {
		renderSection(adapter(async () => ({ rows: [{ name: "Widget" }] })));
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-binding-source")).toBeTruthy();
		expect(screen.getByTestId("ak-binding-kind")).toBeTruthy();
	});

	it("reports a preview timeout distinctly, not as empty data", async () => {
		renderSection(
			adapter(
				(_request, signal) =>
					new Promise<JsonValue>((resolve) => {
						signal.addEventListener("abort", () => resolve(null));
					}),
			),
		);
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-binding-source"));
		fireEvent.click(await screen.findByText("Products"));

		const failed = await screen.findByTestId(
			"ak-binding-preview-failed",
			{},
			{ timeout: 10_000 },
		);
		expect(failed.getAttribute("data-reason")).toBe("timeout");
	}, 15_000);

	it("distinguishes a missing path from a rejected one", async () => {
		renderSection(adapter(async () => ({ rows: [{ name: "Widget" }] })));
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-binding-source"));
		fireEvent.click(await screen.findByText("Products"));

		const path = screen.getByTestId("ak-binding-path");
		fireEvent.change(path, { target: { value: "rows.0.nope" } });
		await waitFor(() =>
			expect(
				screen.getByTestId("ak-binding-preview-unresolved").dataset.status,
			).toBe("missing"),
		);

		// A blocked key is refused by the evaluator, which is a different
		// problem from a path that simply is not there.
		fireEvent.change(path, { target: { value: "__proto__" } });
		await waitFor(() =>
			expect(
				screen.getByTestId("ak-binding-preview-unresolved").dataset.status,
			).toBe("rejected"),
		);
	});

	it("resolves a valid path against live preview data", async () => {
		renderSection(adapter(async () => ({ rows: [{ name: "Widget" }] })));
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-binding-source"));
		fireEvent.click(await screen.findByText("Products"));
		fireEvent.change(screen.getByTestId("ak-binding-path"), {
			target: { value: "rows.0.name" },
		});

		const value = await screen.findByTestId("ak-binding-preview-value");
		expect(value.textContent).toContain("Widget");
	});

	it("saves a binding through the command port", async () => {
		const { execute } = renderSection(
			adapter(async () => ({ rows: [{ name: "Widget" }] })),
		);
		await waitFor(() =>
			expect(screen.getByTestId("ak-bindings-section")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-binding-source"));
		fireEvent.click(await screen.findByText("Products"));
		fireEvent.change(screen.getByTestId("ak-binding-path"), {
			target: { value: "rows.0.name" },
		});
		fireEvent.change(screen.getByTestId("ak-binding-prop"), {
			target: { value: "title" },
		});
		fireEvent.click(screen.getByTestId("ak-binding-save"));

		await waitFor(() => expect(execute).toHaveBeenCalledOnce());
		expect(execute.mock.calls[0]?.[0]).toMatchObject({
			type: "binding.update",
			binding: {
				nodeId: "n1",
				target: { type: "prop", path: ["title"] },
				expression: { type: "path", root: "data", path: ["rows", "0", "name"] },
			},
		});
	});
});
