/**
 * @file Regression test for review finding M2: image-module insertion
 * is centralized in `appendComponentToRoot`, which reads the latest
 * snapshot, preserves zones, and no-ops for unregistered components.
 */

import type { Data } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

import {
	appendComponentToRoot,
	generateNodeId,
	type PuckSnapshot,
} from "@/layout/sidebar/commands/insert-component-node";

function makeSnapshot(over?: {
	components?: Record<string, unknown>;
	content?: unknown[];
	zones?: Record<string, unknown>;
}): {
	snapshot: PuckSnapshot;
	dispatch: ReturnType<typeof vi.fn>;
	reduced: () => Data | undefined;
} {
	const dispatch = vi.fn();
	let reduced: Data | undefined;
	const snapshot = {
		config: { components: over?.components ?? { ImageBlock: {} } },
		appState: {
			data: {
				root: { props: {} },
				content: over?.content ?? [{ type: "Existing", props: { id: "e1" } }],
				zones: over?.zones ?? { "x:zone": [{ type: "Nested", props: {} }] },
			},
		},
		dispatch,
	} as unknown as PuckSnapshot;
	dispatch.mockImplementation(
		(action: { data: Data | ((data: Data) => Data) }) => {
			reduced =
				typeof action.data === "function"
					? action.data(snapshot.appState.data)
					: action.data;
		},
	);
	return { snapshot, dispatch, reduced: () => reduced };
}

describe("generateNodeId", () => {
	it("prefixes the component name", () => {
		expect(generateNodeId("ImageBlock")).toMatch(/^ImageBlock-/);
	});
});

describe("appendComponentToRoot", () => {
	it("no-ops and returns false when the component is not registered", () => {
		const { snapshot, dispatch } = makeSnapshot({ components: {} });
		const ok = appendComponentToRoot(snapshot, "ImageBlock", { id: "i1" });
		expect(ok).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});

	it("appends to root content while preserving existing content and zones", () => {
		const { snapshot, dispatch, reduced } = makeSnapshot();
		const ok = appendComponentToRoot(snapshot, "ImageBlock", {
			id: "i1",
			url: "u",
		});
		expect(ok).toBe(true);
		expect(dispatch).toHaveBeenCalledTimes(1);
		const action = dispatch.mock.calls[0]?.[0];
		expect(action.type).toBe("setData");
		expect(reduced()?.content).toEqual([
			{ type: "Existing", props: { id: "e1" } },
			{ type: "ImageBlock", props: { id: "i1", url: "u" } },
		]);
		// Nested zones untouched.
		expect(reduced()?.zones).toEqual({
			"x:zone": [{ type: "Nested", props: {} }],
		});
		// Root untouched.
		expect(reduced()?.root).toEqual({ props: {} });
	});

	it("records history so the insert is undoable (review 0009 finding)", () => {
		const { snapshot, dispatch } = makeSnapshot();
		appendComponentToRoot(snapshot, "ImageBlock", { id: "i1" });
		expect(dispatch.mock.calls[0]?.[0].recordHistory).toBe(true);
	});

	it("reads the latest snapshot passed in (not a stale clone)", () => {
		const { snapshot, reduced } = makeSnapshot({ content: [] });
		appendComponentToRoot(snapshot, "ImageBlock", { id: "i9" });
		expect(reduced()?.content).toEqual([
			{ type: "ImageBlock", props: { id: "i9" } },
		]);
	});

	it("rejects at the live collaboration writer gate", () => {
		const { snapshot, dispatch } = makeSnapshot();
		const ok = appendComponentToRoot(
			snapshot,
			"ImageBlock",
			{ id: "i1" },
			() => ({
				code: "EDITOR_COLLAB_ENCODING_UNSUPPORTED",
				message: "writers closed",
				severity: "error",
				recoverable: true,
			}),
		);
		expect(ok).toBe(false);
		expect(dispatch).not.toHaveBeenCalled();
	});
});
