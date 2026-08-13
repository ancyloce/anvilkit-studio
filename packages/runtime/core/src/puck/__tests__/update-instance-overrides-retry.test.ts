/**
 * @file Regression coverage for review 0037 P1-3 — detach retries must
 * reproduce the ids minted by their first derivation.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import { indexNodeLocations } from "../../editor/tree/nodes.js";
import { commitDetachInstance } from "../update-instance-overrides.js";

const config = {
	root: { fields: {} },
	components: {
		Instance: { fields: {}, render: () => null },
		Section: { fields: { content: { type: "slot" } }, render: () => null },
		Text: { fields: {}, render: () => null },
	},
} as unknown as Config;

function doc(): Data {
	const definition = {
		version: "1",
		id: "definition-1",
		name: "Card",
		root: {
			type: "Section",
			props: {
				id: "definition-root",
				content: [{ type: "Text", props: { id: "definition-child" } }],
			},
		},
		exposedProps: [],
		variantAxes: [],
		variants: [],
		revision: 1,
		createdAt: "2026-08-13T00:00:00.000Z",
		updatedAt: "2026-08-13T00:00:00.000Z",
	};
	const instance = (id: string) => ({
		type: "Instance",
		props: {
			id,
			anvilComponentInstance: {
				definitionId: definition.id,
				definitionRevision: definition.revision,
				variantSelection: {},
				propOverrides: {},
				nodeOverrides: {},
			},
		},
	});
	return {
		root: {
			props: {
				componentLibrary: { definitions: { [definition.id]: definition } },
			},
		},
		content: [instance("instance-1"), instance("instance-2")],
	} as unknown as Data;
}

describe("commitDetachInstance — retry reproduces detached ids (0037 P1-3)", () => {
	it("reuses each source node's id when Puck retries the intent", () => {
		const current = doc();
		let committed: Data | undefined;
		let nextId = 0;
		const generateId = vi.fn(
			(type: string) => `${type.toLowerCase()}-detached-${++nextId}`,
		);
		const api = {
			appState: { data: current },
			config,
			dispatch: (action: { data: (previous: Data) => Data }) => {
				// A different Data identity forces dispatchOneIntent's retry path.
				committed = action.data(doc());
			},
		} as unknown as PuckApi;

		const result = commitDetachInstance(
			{ getPuckApi: () => api },
			["instance-1", "instance-2"],
			generateId,
		);

		expect(result.status).toBe("committed");
		expect(committed).toBeDefined();
		const committedIds = [
			...indexNodeLocations(committed as Data, config).keys(),
		];
		expect(new Set(committedIds)).toEqual(
			new Set([
				"section-detached-1",
				"text-detached-2",
				"section-detached-3",
				"text-detached-4",
			]),
		);
		expect(new Set(committedIds).size).toBe(4);
		expect(generateId).toHaveBeenCalledTimes(4);
	});
});
