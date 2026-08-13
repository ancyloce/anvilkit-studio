/**
 * @file Regression coverage for review 0037 P1-2 — every component
 * authoring commit must refuse at the collaboration writer gate before
 * reading or dispatching through Puck.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { PuckApi } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import { commitCreateComponent } from "../create-component.js";
import { commitDetachInstance } from "../update-instance-overrides.js";

const gateError: EditorError = {
	code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
	message: "the collaboration transport is read-only",
	severity: "error",
	recoverable: true,
};

describe("component commits — collaboration writer gate (0037 P1-2)", () => {
	it("rejects create before reading the Puck API", () => {
		const getPuckApi = vi.fn<() => PuckApi>();

		const result = commitCreateComponent(
			{ getPuckApi, getWriterGateError: () => gateError },
			{
				nodeIds: ["text-1"],
				name: "Captured text",
				definitionId: "definition-1",
				instanceNodeId: "instance-1",
				timestamp: "2026-08-13T00:00:00.000Z",
			},
		);

		expect(result).toEqual({ status: "rejected", errors: [gateError] });
		expect(getPuckApi).not.toHaveBeenCalled();
	});

	it("rejects detach before reading the Puck API or minting ids", () => {
		const getPuckApi = vi.fn<() => PuckApi>();
		const generateId = vi.fn<(type: string) => string>();

		const result = commitDetachInstance(
			{ getPuckApi, getWriterGateError: () => gateError },
			["instance-1"],
			generateId,
		);

		expect(result).toEqual({
			status: "rejected",
			changedNodeIds: [],
			errors: [gateError],
		});
		expect(getPuckApi).not.toHaveBeenCalled();
		expect(generateId).not.toHaveBeenCalled();
	});
});
