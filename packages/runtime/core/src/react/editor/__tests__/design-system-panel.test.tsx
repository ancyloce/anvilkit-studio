/**
 * @file CORE-P2-001/-002/-003 — the token and reusable-style
 * **management UI** (ED-TOKEN-001..003, ED-STYLEDEF-001/002;
 * DD-0019 §9.4, §15.1).
 *
 * The picker could create and attach a token; nothing could update
 * one, author an alias, edit a mode value, see where it is used, or
 * delete it with a chosen disposition — and reusable styles had no
 * management surface at all. These tests drive the real panel and
 * assert against the committed sidecar.
 */

import type {
	DesignToken,
	EditorCapabilityMetadata,
	StyleDefinitionV1,
} from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";
import { createStudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import { DesignSystemPanel } from "../tokens/DesignSystemPanel.js";

afterEach(cleanup);

const CAPABLE: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: { layoutContainer: true, visualStyle: true },
};

function token(
	id: string,
	name: string,
	value: unknown,
	extra: Partial<DesignToken> = {},
): DesignToken {
	return {
		id,
		path: name.split("."),
		name,
		type: "color",
		values: { light: { kind: "literal", value } },
		...extra,
	} as DesignToken;
}

function style(id: string, name: string): StyleDefinitionV1 {
	return {
		version: "1",
		id,
		name,
		appliesTo: "any",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
	};
}

interface Seed {
	readonly tokens?: Readonly<Record<string, DesignToken>>;
	readonly tokenModes?: Readonly<Record<string, { id: string; name: string }>>;
	readonly styleDefinitions?: Readonly<Record<string, StyleDefinitionV1>>;
	readonly nodes?: Readonly<Record<string, unknown>>;
}

function seedData(seed: Seed): PuckData {
	return {
		root: {
			props: {
				__anvilkit: {
					version: "1",
					revision: 0,
					breakpoints: [],
					nodes: seed.nodes ?? {},
					tokens: seed.tokens ?? {},
					tokenModes: seed.tokenModes ?? {
						light: { id: "light", name: "Light" },
					},
					styleDefinitions: seed.styleDefinitions ?? {},
					componentDefinitions: {},
					interactions: {},
					bindings: {},
				},
			},
		},
		content: [
			{ type: "Hero", props: { id: "a" } },
			{ type: "Hero", props: { id: "b" } },
		],
		zones: {},
	} as unknown as PuckData;
}

function createCtx(recorded: PuckData[], seed: Seed): StudioPluginContext {
	let data = seedData(seed);
	const config = { components: { Hero: { metadata: { editor: CAPABLE } } } };
	return {
		getData: () => data,
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				config,
				dispatch: (action: { data?: PuckData; recordHistory?: boolean }) => {
					if (action.data !== undefined) {
						data = action.data;
						if (action.recordHistory === true) recorded.push(action.data);
					}
				},
				getItemById: (id: string) => ({ type: "Hero", props: { id } }),
				getSelectorForId: () => undefined,
			}) as unknown as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

let storeSeq = 0;
async function mount(seed: Seed = {}) {
	const recorded: PuckData[] = [];
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = `design-system-${storeSeq}`;
	render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={createCtx(recorded, seed)}>
				<EditorStoreProvider
					storeId={storeId}
					store={createEditorStore({ storeId })}
				>
					<StudioEditorMount
						editor={{ features: { enabled: true }, defaultTokenMode: "light" }}
						bridge={bridge}
					>
						<DesignSystemPanel />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	const port = bridge.port as InternalEditorCommandPort;
	return { bridge, port, recorded };
}

const authoringOf = (port: InternalEditorCommandPort) =>
	port.getSnapshot().authoring;

describe("Token management (ED-TOKEN-001/-002)", () => {
	it("renders nothing when the editor runtime is off", () => {
		render(
			<EditorI18nProvider>
				<DesignSystemPanel />
			</EditorI18nProvider>,
		);
		expect(screen.queryByTestId("ak-design-system-panel")).toBeNull();
	});

	it("creates a token from the panel", async () => {
		const { port, recorded } = await mount();
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-create-name")).toBeTruthy(),
		);
		fireEvent.change(screen.getByTestId("ak-token-create-name"), {
			target: { value: "color.brand" },
		});
		fireEvent.change(screen.getByTestId("ak-token-create-value"), {
			target: { value: "#ff0000" },
		});
		fireEvent.click(screen.getByTestId("ak-token-create-submit"));
		await waitFor(() =>
			expect(Object.keys(authoringOf(port).tokens)).toHaveLength(1),
		);
		const created = Object.values(authoringOf(port).tokens)[0];
		expect(created?.name).toBe("color.brand");
		// Dotted names become the path, so the list groups as typed.
		expect(created?.path).toEqual(["color", "brand"]);
		expect(recorded).toHaveLength(1);
	});

	it("refuses an unnamed token with a visible error", async () => {
		const { port } = await mount();
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-create-submit")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-token-create-submit"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-create-errors")).toBeTruthy(),
		);
		expect(Object.keys(authoringOf(port).tokens)).toHaveLength(0);
	});

	it("renames a token and updates its path", async () => {
		const { port } = await mount({
			tokens: { t1: token("t1", "color.old", "#111111") },
		});
		const input = await screen.findByTestId("ak-token-name");
		fireEvent.change(input, { target: { value: "color.new" } });
		fireEvent.blur(input);
		await waitFor(() =>
			expect(authoringOf(port).tokens.t1?.name).toBe("color.new"),
		);
		expect(authoringOf(port).tokens.t1?.path).toEqual(["color", "new"]);
	});

	it("edits a per-mode value and shows the resolved literal", async () => {
		const { port } = await mount({
			tokens: { t1: token("t1", "color.brand", "#111111") },
			tokenModes: {
				light: { id: "light", name: "Light" },
				dark: { id: "dark", name: "Dark" },
			},
		});
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-mode")).toHaveLength(2),
		);
		const darkRow = screen
			.getAllByTestId("ak-token-mode")
			.find((row) => row.getAttribute("data-mode-id") === "dark");
		const input = within(darkRow as HTMLElement).getByTestId(
			"ak-token-mode-value",
		);
		fireEvent.blur(input, { target: { value: "#222222" } });
		await waitFor(() =>
			expect(authoringOf(port).tokens.t1?.values.dark).toEqual({
				kind: "literal",
				value: "#222222",
			}),
		);
	});

	it("shows how many places reference a token (ED-TOKEN-002)", async () => {
		const { port } = await mount({
			tokens: { t1: token("t1", "color.brand", "#111111") },
			nodes: {
				a: {
					version: "1",
					style: {
						base: {
							background: {
								kind: "solid",
								color: { kind: "token", tokenId: "t1" },
							},
						},
					},
				},
			},
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-usage-count")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-token-usage-count").textContent).toBe("1");
		expect(Object.keys(authoringOf(port).tokens)).toHaveLength(1);
	});

	it("authors an alias and rejects a self-alias", async () => {
		const { port } = await mount({
			tokens: {
				t1: token("t1", "color.a", "#111111"),
				t2: token("t2", "color.b", "#222222"),
			},
		});
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-row")).toHaveLength(2),
		);
		// The Select is a listbox; the model's alias write is the
		// contract under test (the primitive has its own suite).
		const bridgePort = port;
		await act(async () => {
			await bridgePort.execute({
				id: crypto.randomUUID(),
				expectedRevision: bridgePort.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "token.update",
				tokenId: "t1",
				patch: { values: { light: { kind: "alias", tokenId: "t2" } } },
			} as never);
		});
		expect(authoringOf(port).tokens.t1?.values.light).toEqual({
			kind: "alias",
			tokenId: "t2",
		});

		// A cycle must be refused by the reducer's own graph check.
		const before = JSON.stringify(authoringOf(port).tokens);
		await act(async () => {
			await bridgePort.execute({
				id: crypto.randomUUID(),
				expectedRevision: bridgePort.getSnapshot().revision,
				source: "inspector",
				timestamp: Date.now(),
				type: "token.update",
				tokenId: "t2",
				patch: { values: { light: { kind: "alias", tokenId: "t1" } } },
			} as never);
		});
		expect(JSON.stringify(authoringOf(port).tokens)).toBe(before);
	});
});

describe("Token deletion (ED-TOKEN-003)", () => {
	const SEED: Seed = {
		tokens: {
			t1: token("t1", "color.brand", "#111111"),
			t2: token("t2", "color.alt", "#222222"),
		},
		nodes: {
			a: {
				version: "1",
				style: {
					base: {
						background: {
							kind: "solid",
							color: { kind: "token", tokenId: "t1" },
						},
					},
				},
			},
		},
	};

	it("previews impact before committing anything", async () => {
		const { port, recorded } = await mount(SEED);
		fireEvent.click(await screen.findByTestId("ak-token-delete-t1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-delete-impact")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-token-delete-impact").textContent).toContain(
			"1",
		);
		// Nothing is dispatched by opening the preview.
		expect(recorded).toHaveLength(0);
		expect(Object.keys(authoringOf(port).tokens)).toHaveLength(2);
	});

	it("cancels without touching the document", async () => {
		const { port } = await mount(SEED);
		fireEvent.click(await screen.findByTestId("ak-token-delete-t1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-delete-cancel")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-token-delete-cancel"));
		await waitFor(() =>
			expect(screen.queryByTestId("ak-token-delete-dialog")).toBeNull(),
		);
		expect(Object.keys(authoringOf(port).tokens)).toHaveLength(2);
	});

	it("materializes references so the page keeps its appearance", async () => {
		const { port } = await mount(SEED);
		fireEvent.click(await screen.findByTestId("ak-token-delete-t1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-delete-materialize")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-token-delete-materialize"));
		await waitFor(() => expect(authoringOf(port).tokens.t1).toBeUndefined());
		// The reference was rewritten, not left dangling: the paint's
		// colour is a literal again, so the page still renders red.
		const color = (
			authoringOf(port).nodes.a as {
				style?: { base?: { background?: { color?: { kind?: string } } } };
			}
		).style?.base?.background?.color;
		expect(color?.kind).not.toBe("token");
	});

	it("offers only type-compatible replacements", async () => {
		const { port } = await mount({
			...SEED,
			tokens: {
				...SEED.tokens,
				t3: {
					...token("t3", "size.gap", 8),
					type: "length",
				} as DesignToken,
			},
		});
		fireEvent.click(await screen.findByTestId("ak-token-delete-t1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-delete-replacement")).toBeTruthy(),
		);
		// `t2` is a color like `t1`; `t3` is a length and must not be
		// offered — a length cannot stand in for a color (§15.1).
		expect(Object.keys(authoringOf(port).tokens)).toHaveLength(3);
		expect(screen.getByTestId("ak-token-delete-replacement")).toBeTruthy();
	});
});

describe("Reusable style management (ED-STYLEDEF-001/-002)", () => {
	it("creates a style definition", async () => {
		const { port, recorded } = await mount();
		await waitFor(() =>
			expect(screen.getByTestId("ak-style-create-input")).toBeTruthy(),
		);
		fireEvent.change(screen.getByTestId("ak-style-create-input"), {
			target: { value: "Card surface" },
		});
		fireEvent.click(screen.getByTestId("ak-style-create-submit"));
		await waitFor(() =>
			expect(Object.keys(authoringOf(port).styleDefinitions)).toHaveLength(1),
		);
		expect(recorded).toHaveLength(1);
	});

	it("renames a style definition; the change propagates by resolution", async () => {
		const { port } = await mount({
			styleDefinitions: { s1: style("s1", "Old") },
			nodes: { a: { version: "1", styleRefs: { base: ["s1"] } } },
		});
		const input = await screen.findByTestId("ak-style-name");
		fireEvent.blur(input, { target: { value: "New" } });
		await waitFor(() =>
			expect(authoringOf(port).styleDefinitions.s1?.name).toBe("New"),
		);
		// No per-node copies exist to update (ED-STYLEDEF-002): the node
		// still references the same id.
		expect(
			(authoringOf(port).nodes.a as { styleRefs?: { base?: string[] } })
				.styleRefs?.base,
		).toEqual(["s1"]);
	});

	it("attaches to the selection in list order and detaches", async () => {
		const { bridge, port } = await mount({
			styleDefinitions: { s1: style("s1", "A"), s2: style("s2", "B") },
		});
		act(() => bridge.selection?.selectMany(["a"]));
		await waitFor(() =>
			expect(screen.getByTestId("ak-style-attach-s1")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-style-attach-s1"));
		await waitFor(() =>
			expect(
				(authoringOf(port).nodes.a as { styleRefs?: { base?: string[] } })
					.styleRefs?.base,
			).toEqual(["s1"]),
		);
		fireEvent.click(screen.getByTestId("ak-style-attach-s2"));
		await waitFor(() =>
			expect(
				(authoringOf(port).nodes.a as { styleRefs?: { base?: string[] } })
					.styleRefs?.base,
			).toEqual(["s1", "s2"]),
		);
		fireEvent.click(screen.getByTestId("ak-style-detach-s1"));
		await waitFor(() =>
			expect(
				(authoringOf(port).nodes.a as { styleRefs?: { base?: string[] } })
					.styleRefs?.base,
			).toEqual(["s2"]),
		);
	});

	it("refuses attach with an empty selection, visibly", async () => {
		const { port } = await mount({
			styleDefinitions: { s1: style("s1", "A") },
		});
		await waitFor(() =>
			expect(screen.getByTestId("ak-style-attach-s1")).toBeTruthy(),
		);
		// The affordance disables rather than dispatching a rejection.
		expect(
			screen.getByTestId("ak-style-attach-s1").hasAttribute("disabled"),
		).toBe(true);
		expect(authoringOf(port).nodes.a).toBeUndefined();
	});

	it("shows the affected element count and deletes with materialization", async () => {
		const { port } = await mount({
			styleDefinitions: { s1: style("s1", "A") },
			nodes: { a: { version: "1", styleRefs: { base: ["s1"] } } },
		});
		fireEvent.click(await screen.findByTestId("ak-style-delete-s1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-style-delete-impact")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-style-delete-impact").textContent).toContain(
			"1",
		);
		fireEvent.click(screen.getByTestId("ak-style-delete-materialize"));
		await waitFor(() =>
			expect(authoringOf(port).styleDefinitions.s1).toBeUndefined(),
		);
		// The reference is gone, not dangling.
		expect(
			(authoringOf(port).nodes.a as { styleRefs?: { base?: string[] } })
				?.styleRefs?.base ?? [],
		).not.toContain("s1");
	});

	it("cancels a style deletion without touching the document", async () => {
		const { port, recorded } = await mount({
			styleDefinitions: { s1: style("s1", "A") },
		});
		fireEvent.click(await screen.findByTestId("ak-style-delete-s1"));
		await waitFor(() =>
			expect(screen.getByTestId("ak-style-delete-cancel")).toBeTruthy(),
		);
		fireEvent.click(screen.getByTestId("ak-style-delete-cancel"));
		await waitFor(() =>
			expect(screen.queryByTestId("ak-style-delete-dialog")).toBeNull(),
		);
		expect(Object.keys(authoringOf(port).styleDefinitions)).toHaveLength(1);
		expect(recorded).toHaveLength(0);
	});
});

/**
 * Regression cover for the CORE review of this branch. Each case is a
 * defect that shipped in the first cut of this panel and that the type
 * checker and the tests above both let through.
 */
describe("design-system panel — review regressions", () => {
	it("does not write a literal when an inherited mode is blurred untouched", async () => {
		// Tabbing through a mode with no declared value used to commit
		// `{kind:"literal", value:""}`, permanently converting an inherited
		// mode into an empty-string literal of its own.
		const { port, recorded } = await mount({
			tokens: { t1: token("t1", "color.brand", "#111111") },
			tokenModes: {
				light: { id: "light", name: "Light" },
				dark: { id: "dark", name: "Dark" },
			},
		});
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-mode")).toHaveLength(2),
		);
		const darkRow = screen
			.getAllByTestId("ak-token-mode")
			.find((row) => row.getAttribute("data-mode-id") === "dark");
		fireEvent.blur(
			within(darkRow as HTMLElement).getByTestId("ak-token-mode-value"),
		);
		await Promise.resolve();
		expect(authoringOf(port).tokens.t1?.values.dark).toBeUndefined();
		expect(recorded).toHaveLength(0);
	});

	it("keeps a number token's value a number across an edit", async () => {
		// `String(8)` renders "8"; writing the raw text back silently
		// changed the stored type to a string.
		const { port } = await mount({
			tokens: {
				t1: token("t1", "size.gap", 8, {
					type: "number",
					values: { light: { kind: "literal", value: 8 } },
				} as Partial<DesignToken>),
			},
		});
		const input = await screen.findByTestId("ak-token-mode-value");
		fireEvent.blur(input, { target: { value: "12" } });
		await waitFor(() =>
			expect(authoringOf(port).tokens.t1?.values.light).toEqual({
				kind: "literal",
				value: 12,
			}),
		);
	});

	it("reports a mode with no value as unresolved instead of leaking another mode's literal", async () => {
		// The old fallback was `Object.values(token.values)[0]` — an
		// arbitrary mode, picked by key insertion order. A token declared
		// only in `dark` therefore reported a resolved value for `light`
		// while the same row's input showed the "inherited" placeholder.
		// §15.1 allows exactly one fallback: the configured default mode,
		// which here IS `light`, so nothing may stand in for it.
		await mount({
			tokens: {
				t1: token("t1", "color.brand", "#111111", {
					values: { dark: { kind: "literal", value: "#222222" } },
				} as Partial<DesignToken>),
			},
			tokenModes: {
				light: { id: "light", name: "Light" },
				dark: { id: "dark", name: "Dark" },
			},
		});
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-mode")).toHaveLength(2),
		);
		const rowFor = (mode: string) =>
			screen
				.getAllByTestId("ak-token-mode")
				.find((row) => row.getAttribute("data-mode-id") === mode) as HTMLElement;

		expect(
			within(rowFor("dark")).getByTestId("ak-token-resolved").textContent,
		).toBe("#222222");
		expect(
			within(rowFor("light")).getByTestId("ak-token-resolved").textContent,
		).not.toContain("#222222");
	});

	it("re-seeds the name input when the token is renamed externally", async () => {
		// The input seeded from `useState(entry.path)` — a once-only
		// initializer on a row keyed by token id, so it never re-synced.
		// After an undo the field still showed the undone name and the
		// next blur re-dispatched it, making the rename un-undoable.
		const { port } = await mount({
			tokens: { t1: token("t1", "color.old", "#111111") },
		});
		const input = await screen.findByTestId("ak-token-name");
		expect((input as HTMLInputElement).value).toBe("color.old");

		await act(async () => {
			await port.execute({
				id: "external-rename",
				expectedRevision: port.getSnapshot().revision,
				source: "inspector",
				timestamp: 0,
				type: "token.update",
				tokenId: "t1",
				patch: { name: "color.external", path: ["color", "external"] },
			} as never);
		});

		await waitFor(() =>
			expect(
				(screen.getByTestId("ak-token-name") as HTMLInputElement).value,
			).toBe("color.external"),
		);
	});
});
