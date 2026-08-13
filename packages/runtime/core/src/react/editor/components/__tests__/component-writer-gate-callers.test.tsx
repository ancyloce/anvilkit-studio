/**
 * @file React caller regression coverage for review 0037 P1-2.
 *
 * An affordance can be rendered while writers are open, then invoked after
 * the collaboration gate closes. The hook must pass a live gate getter into
 * the commit helper instead of relying on the render-time `canMutate` value.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	commitCreateComponent: vi.fn(),
	commitDetachInstance: vi.fn(),
	commitInstanceOverride: vi.fn(),
	getWriterGateError: vi.fn(),
	select: vi.fn(),
	validateCreateComponentSelection: vi.fn(),
}));

vi.mock("../../../../puck/create-component.js", () => ({
	commitCreateComponent: mocks.commitCreateComponent,
	validateCreateComponentSelection: mocks.validateCreateComponentSelection,
}));

vi.mock("../../../../puck/update-instance-overrides.js", () => ({
	commitDetachInstance: mocks.commitDetachInstance,
	commitInstanceOverride: mocks.commitInstanceOverride,
}));

vi.mock("../../composition/use-shell-selection.js", () => ({
	useShellSelection: () => ({
		nodeIds: ["instance-1"],
		primaryId: "instance-1",
		mode: "page",
		definitionScope: "page",
		degraded: false,
	}),
}));

vi.mock("../../use-document-model.js", () => ({
	useOptionalDocumentModel: () => ({
		nodes: new Map([
			[
				"instance-1",
				{
					componentInstance: {
						definitionId: "definition-1",
						variantSelection: {},
						propOverrides: {},
						nodeOverrides: {},
					},
				},
			],
		]),
	}),
}));

vi.mock("../editor-runtime.js", () => ({
	useComponentEditorRuntime: () => ({
		canMutate: true,
		enterComponent: vi.fn(),
		exitComponent: vi.fn(),
		select: mocks.select,
	}),
	useComponentWriterGateGetter: () => mocks.getWriterGateError,
	usePuckApiGetter: () => () =>
		({ appState: { data: {} }, config: {} }) as PuckApi,
}));

import { useComponentInstance } from "../use-component-instance.js";
import { useCreateComponent } from "../use-create-component.js";

const gateError: EditorError = {
	code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
	message: "the collaboration transport became read-only",
	severity: "error",
	recoverable: true,
};

afterEach(cleanup);

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getWriterGateError.mockReturnValue(null);
	mocks.validateCreateComponentSelection.mockReturnValue([]);
	mocks.commitCreateComponent.mockImplementation((deps) => {
		const error = deps.getWriterGateError?.() ?? null;
		return error === null
			? { status: "committed", errors: [] }
			: { status: "rejected", errors: [error] };
	});
	mocks.commitDetachInstance.mockImplementation((deps) => {
		const error = deps.getWriterGateError?.() ?? null;
		return error === null
			? { status: "committed", changedNodeIds: ["instance-1"], errors: [] }
			: { status: "rejected", changedNodeIds: [], errors: [error] };
	});
});

describe("component React callers — live collaboration writer gate", () => {
	it("threads the live gate into create-component commits", () => {
		const { result } = renderHook(() => useCreateComponent());
		expect(result.current).not.toBeNull();

		// The action was exposed while open; close writers without a render.
		mocks.getWriterGateError.mockReturnValue(gateError);
		const outcome = result.current?.create("Captured component");

		expect(outcome).toEqual({ status: "rejected", errors: [gateError] });
		expect(mocks.commitCreateComponent).toHaveBeenCalledOnce();
		expect(mocks.select).not.toHaveBeenCalled();
	});

	it("threads the live gate into detach-instance commits", () => {
		const { result } = renderHook(() => useComponentInstance());
		expect(result.current).not.toBeNull();

		// The model was exposed while open; close writers without a render.
		mocks.getWriterGateError.mockReturnValue(gateError);
		let outcome:
			| ReturnType<NonNullable<typeof result.current>["detach"]>
			| undefined;
		act(() => {
			outcome = result.current?.detach() as typeof outcome;
		});

		expect(outcome).toEqual({ status: "rejected", errors: [gateError] });
		expect(mocks.commitDetachInstance).toHaveBeenCalledOnce();
	});
});
