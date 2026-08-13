/**
 * @file Regression coverage for review 0037 P1-4: an equivalent inline
 * `editor` config must not tear down the editor runtime on a parent render.
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Studio } from "@/components/Studio";

const editorRuntime = vi.hoisted(() => ({
	initializations: 0,
	disposals: 0,
}));

vi.mock("../../editor/StudioEditorMount.js", async () => {
	const { createElement, Fragment, useEffect } = await import("react");
	return {
		StudioEditorMount: ({
			editor,
			children,
		}: {
			readonly editor: unknown;
			readonly children: ReactNode;
		}) => {
			// Mirrors EditorRoot's runtime-owning effect: a changed `editor`
			// dependency disposes every controller and constructs them again.
			useEffect(() => {
				editorRuntime.initializations += 1;
				return () => {
					editorRuntime.disposals += 1;
				};
			}, [editor]);
			return createElement(Fragment, null, children);
		},
	};
});

vi.mock("@puckeditor/core", async () => {
	const { createElement } = await import("react");
	return {
		Puck: () => createElement("div", { "data-testid": "puck-mock" }),
		useGetPuck: () => () => ({
			appState: { data: null },
			dispatch: () => undefined,
		}),
		createUsePuck: () => () => undefined,
	};
});

beforeEach(() => {
	editorRuntime.initializations = 0;
	editorRuntime.disposals = 0;
});

afterEach(cleanup);

describe("<Studio> editor prop stability (0037 P1-4)", () => {
	it("keeps the editor runtime alive for an equivalent inline config", async () => {
		const view = render(
			<Studio
				puckConfig={{ components: {} }}
				editor={{ features: { enabled: true } }}
				isSavingDraft={false}
			/>,
		);
		await view.findByTestId("puck-mock");
		await act(async () => undefined);
		expect(editorRuntime.initializations).toBe(1);
		expect(editorRuntime.disposals).toBe(0);

		view.rerender(
			<Studio
				puckConfig={{ components: {} }}
				editor={{ features: { enabled: true } }}
				isSavingDraft={true}
			/>,
		);
		await view.findByTestId("puck-mock");
		await act(async () => undefined);

		// Before the fix these were 2 and 1: the fresh outer config and
		// fresh nested `features` object restarted the runtime effect.
		expect(editorRuntime.initializations).toBe(1);
		expect(editorRuntime.disposals).toBe(0);
	});
});
