/**
 * @file `demoDataSourceAdapter` — a fixture host data source for the
 * editor's binding surface (PLAN-0020 CORE-P3-005/-006; DD-0019 §19).
 *
 * §19 makes the host adapter the only source of bindable data, so the
 * demo has to supply one before the bindings inspector section renders
 * at all. This is deliberately **in-memory**: the §32.4 E2E must be
 * hermetic, and a fixture that reached the network would make the spec
 * flaky for reasons that have nothing to do with the editor.
 *
 * The `slow` source exists to exercise §19's 5-second timeout from the
 * product side. It never resolves on its own and only settles when the
 * signal aborts, which is exactly the containment path
 * `fetchPreviewData` is responsible for.
 */

import type {
	DataSchema,
	DataSourceDescriptor,
	EditorDataSourceAdapter,
	JsonValue,
	PreviewDataRequest,
} from "@anvilkit/core/types";

const SOURCES: readonly DataSourceDescriptor[] = [
	{ id: "products", name: "Products", description: "Demo catalogue rows" },
	{
		id: "slow",
		name: "Slow source",
		description: "Never answers (timeout demo)",
	},
];

/** Rows carry a stable `id`, so repeats are not index-keyed (§19). */
const PRODUCTS: JsonValue = {
	rows: [
		{ id: "p1", name: "Anvil", price: 42, inStock: true },
		{ id: "p2", name: "Rope", price: 12, inStock: false },
		{ id: "p3", name: "Lantern", price: 28, inStock: true },
	],
};

const PRODUCT_SCHEMA: DataSchema = {
	type: "object",
	fields: {
		rows: {
			type: "array",
			items: {
				type: "object",
				fields: {
					id: { type: "string" },
					name: { type: "string" },
					price: { type: "number" },
					inStock: { type: "boolean" },
				},
			},
		},
	},
};

export const demoDataSourceAdapter: EditorDataSourceAdapter = {
	async listSources(): Promise<readonly DataSourceDescriptor[]> {
		return SOURCES;
	},

	async getSchema(sourceId: string): Promise<DataSchema> {
		if (sourceId === "products") return PRODUCT_SCHEMA;
		return { type: "object" };
	},

	async getPreviewData(
		request: PreviewDataRequest,
		signal: AbortSignal,
	): Promise<JsonValue> {
		if (request.sourceId === "slow") {
			// Settles only on abort — Core's 5 s budget is what ends this,
			// which is the behaviour the timeout spec asserts.
			return new Promise<JsonValue>((resolve) => {
				signal.addEventListener("abort", () => resolve(null));
			});
		}
		return PRODUCTS;
	},
};
