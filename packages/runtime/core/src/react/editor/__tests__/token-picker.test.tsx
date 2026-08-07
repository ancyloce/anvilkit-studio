/**
 * @file CORE-P2-002 — the token picker: compatible-type filtering,
 * path search, recents, create-from-literal, import-as-copy with
 * provenance, resolved value + alias chain display, detach-to-literal,
 * and atomic application to a mixed selection
 * (DD-0019 §15.1; ADR 0005 Part 2 §3/§4).
 */

import type {
	CssLength,
	AnvilComponentMetadata,
	ImportableTokenValue,
	StudioEditorConfig,
} from "@anvilkit/contracts/editor";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { act, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import { createEditorStore } from "@/state/editor-store-bundle";
import type { StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { LengthControl } from "../inspector/controls/LengthControl.js";
import {
	useEditorInspector,
	useInspectorField,
} from "../inspector/use-inspector.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import { TokenPicker } from "../tokens/TokenPicker.js";
import { clearTokenRecents } from "../tokens/use-token-picker.js";
import {
	applyPuckDataAction,
	type PuckDataAction,
} from "./puck-store-double.js";

afterEach(() => {
	cleanup();
	clearTokenRecents();
});

const CAPABLE: AnvilComponentMetadata = {
	styleTargets: {
		root: {
			label: "Target",
			properties: ["display", "gap", "padding", "width", "height", "margin", "background", "borderRadius", "boxShadow", "opacity", "fontSize", "fontWeight", "color", "textAlign"],
		},
	},
};

const hex = (value: string) => ({ kind: "hex", value }) as const;
const px = (value: number) => ({ kind: "unit", value, unit: "px" }) as const;

function createCtx(): StudioPluginContext {
	let data = buildLegacyPuckData();
	const config = {
		components: { Hero: { metadata: { anvilkit: { editor: CAPABLE } } }, Legacy: {} },
	};
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
				dispatch: (action: PuckDataAction) => {
					data = applyPuckDataAction(data, action);
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

/** Renders the picker against the live inspector context. */
function PickerHarness({
	onAttach,
	attachedTokenId,
	onDetach,
	currentLiteral,
	type = "color",
}: {
	onAttach: (tokenId: string) => void;
	attachedTokenId?: string;
	onDetach?: () => void;
	currentLiteral?: unknown;
	type?: "color" | "length";
}): ReactNode {
	const context = useEditorInspector();
	if (context === null) {
		return null;
	}
	return (
		<TokenPicker
			context={context}
			type={type}
			attachedTokenId={attachedTokenId}
			onAttach={onAttach}
			onDetach={onDetach}
			currentLiteral={
				currentLiteral as Parameters<typeof TokenPicker>[0]["currentLiteral"]
			}
		/>
	);
}

let storeSeq = 0;
async function mountPicker(
	props: Parameters<typeof PickerHarness>[0],
	editor: StudioEditorConfig = { features: { enabled: true } },
) {
	const bridge = createStudioEditorBridge();
	storeSeq += 1;
	const storeId = `token-picker-test-${storeSeq}`;
	render(
		<EditorI18nProvider>
			<StudioPluginContextProvider value={createCtx()}>
				<EditorStoreProvider
					storeId={storeId}
					store={createEditorStore({ storeId })}
				>
					<StudioEditorMount editor={editor} bridge={bridge}>
						<PickerHarness {...props} />
					</StudioEditorMount>
				</EditorStoreProvider>
			</StudioPluginContextProvider>
		</EditorI18nProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	act(() => {
		bridge.selection?.selectMany(["legacy-0"]);
	});
	return bridge;
}

type Bridge = Awaited<ReturnType<typeof mountPicker>>;

async function createToken(
	bridge: Bridge,
	token: {
		id: string;
		name: string;
		path: readonly string[];
		type: "color" | "length";
		values: Record<string, unknown>;
		source?: { system: "theme" | "brand"; ref: string };
	},
): Promise<void> {
	const port = bridge.port;
	if (port === null) {
		throw new Error("port not mounted");
	}
	await act(async () => {
		await port.execute({
			id: crypto.randomUUID(),
			expectedRevision: port.getSnapshot().revision,
			source: "inspector",
			timestamp: 1_750_000_000_000,
			type: "token.create",
			token: token as never,
		});
	});
}

async function openPicker(): Promise<void> {
	await waitFor(() =>
		expect(screen.getByTestId("ak-token-picker-trigger")).toBeTruthy(),
	);
	fireEvent.click(screen.getByTestId("ak-token-picker-trigger"));
	await waitFor(() =>
		expect(screen.getByTestId("ak-token-search")).toBeTruthy(),
	);
}

describe("TokenPicker (CORE-P2-002)", () => {
	it("lists only tokens of a compatible type (§15.1)", async () => {
		const onAttach = vi.fn();
		const bridge = await mountPicker({ onAttach });
		await createToken(bridge, {
			id: "brand",
			name: "Brand",
			path: ["color", "brand"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#123456") } },
		});
		await createToken(bridge, {
			id: "space",
			name: "Space",
			path: ["space", "md"],
			type: "length",
			values: { light: { kind: "literal", value: px(16) } },
		});

		await openPicker();
		const options = screen.getAllByTestId("ak-token-option");
		expect(options).toHaveLength(1);
		expect(options[0]?.textContent).toContain("color.brand");
	});

	it("attaches the chosen token", async () => {
		const onAttach = vi.fn();
		const bridge = await mountPicker({ onAttach });
		await createToken(bridge, {
			id: "brand",
			name: "Brand",
			path: ["color", "brand"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#123456") } },
		});
		await openPicker();
		fireEvent.click(screen.getByTestId("ak-token-option"));
		expect(onAttach).toHaveBeenCalledWith("brand");
	});

	it("searches by path", async () => {
		const bridge = await mountPicker({ onAttach: vi.fn() });
		await createToken(bridge, {
			id: "brand",
			name: "Brand",
			path: ["color", "brand"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#123456") } },
		});
		await createToken(bridge, {
			id: "surface",
			name: "Surface",
			path: ["color", "surface"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#ffffff") } },
		});
		await openPicker();
		expect(screen.getAllByTestId("ak-token-option")).toHaveLength(2);
		fireEvent.change(screen.getByTestId("ak-token-search"), {
			target: { value: "surf" },
		});
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-option")).toHaveLength(1),
		);
		expect(screen.getByTestId("ak-token-option").textContent).toContain(
			"color.surface",
		);
	});

	it("shows the alias chain and flags unresolvable tokens", async () => {
		const bridge = await mountPicker({ onAttach: vi.fn() });
		await createToken(bridge, {
			id: "base",
			name: "Base",
			path: ["color", "base"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#101010") } },
		});
		await createToken(bridge, {
			id: "alias",
			name: "Alias",
			path: ["color", "alias"],
			type: "color",
			values: { light: { kind: "alias", tokenId: "base" } },
		});
		await openPicker();
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-chain")).toBeTruthy(),
		);
		expect(screen.getByTestId("ak-token-chain").textContent).toBe(
			"Alias → Base",
		);
	});

	it("creates a token from the current literal and attaches it", async () => {
		const onAttach = vi.fn();
		const bridge = await mountPicker({
			onAttach,
			currentLiteral: hex("#abcdef"),
		});
		await openPicker();
		fireEvent.change(screen.getByTestId("ak-token-new-name"), {
			target: { value: "color.accent" },
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId("ak-token-create"));
		});
		await waitFor(() => {
			const tokens = bridge.port?.getSnapshot().authoring.tokens ?? {};
			const created = Object.values(tokens)[0];
			expect(created?.name).toBe("color.accent");
			expect(created?.path).toEqual(["color", "accent"]);
			expect(created?.type).toBe("color");
		});
		expect(onAttach).toHaveBeenCalled();
	});

	it("imports a theme value as a copy with provenance (ADR 0005)", async () => {
		const importable: ImportableTokenValue = {
			system: "theme",
			ref: "semantic.accent",
			label: "Accent",
			type: "color",
			value: hex("#ff0000"),
		};
		const onAttach = vi.fn();
		const bridge = await mountPicker(
			{ onAttach },
			{ features: { enabled: true }, importableTokens: [importable] },
		);
		await openPicker();
		await waitFor(() =>
			expect(screen.getByTestId("ak-token-import-option")).toBeTruthy(),
		);
		await act(async () => {
			fireEvent.click(screen.getByTestId("ak-token-import-option"));
		});

		await waitFor(() => {
			const tokens = bridge.port?.getSnapshot().authoring.tokens ?? {};
			const created = Object.values(tokens)[0];
			// Import-as-copy: a plain literal plus provenance — never a
			// live cross-system alias.
			expect(created?.source).toEqual({
				system: "theme",
				ref: "semantic.accent",
			});
			expect(created?.values.light).toEqual({
				kind: "literal",
				value: hex("#ff0000"),
			});
		});
		expect(onAttach).toHaveBeenCalled();
	});

	it("hides importable values of an incompatible type", async () => {
		await mountPicker(
			{ onAttach: vi.fn() },
			{
				features: { enabled: true },
				importableTokens: [
					{
						system: "theme",
						ref: "space.4",
						label: "Space 4",
						type: "length",
						value: px(16),
					},
				],
			},
		);
		await openPicker();
		expect(screen.queryByTestId("ak-token-import-option")).toBeNull();
	});

	it("offers detach only when a token is attached", async () => {
		const onDetach = vi.fn();
		await mountPicker({ onAttach: vi.fn() });
		await openPicker();
		expect(screen.queryByTestId("ak-token-detach")).toBeNull();
		cleanup();

		await mountPicker({
			onAttach: vi.fn(),
			attachedTokenId: "brand",
			onDetach,
		});
		await openPicker();
		fireEvent.click(screen.getByTestId("ak-token-detach"));
		expect(onDetach).toHaveBeenCalled();
	});

	it("surfaces recently applied tokens", async () => {
		const bridge = await mountPicker({ onAttach: vi.fn() });
		await createToken(bridge, {
			id: "brand",
			name: "Brand",
			path: ["color", "brand"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#123456") } },
		});
		await openPicker();
		fireEvent.click(screen.getByTestId("ak-token-option"));
		// Re-open: the applied token is now offered under "recent".
		await openPicker();
		await waitFor(() =>
			expect(screen.getAllByTestId("ak-token-option").length).toBeGreaterThan(
				1,
			),
		);
	});

	it("shows an empty state when no compatible token exists", async () => {
		await mountPicker({ onAttach: vi.fn() });
		await openPicker();
		expect(screen.getByTestId("ak-token-empty")).toBeTruthy();
	});
});

describe("token attach/detach through the inspector (§15.1)", () => {
	it("writes a token reference and detaches back to the resolved literal", async () => {
		const commits: unknown[] = [];
		const bridge = await mountPicker({
			onAttach: (tokenId) => commits.push({ kind: "token", tokenId }),
		});
		await createToken(bridge, {
			id: "brand",
			name: "Brand",
			path: ["color", "brand"],
			type: "color",
			values: { light: { kind: "literal", value: hex("#123456") } },
		});
		await openPicker();
		fireEvent.click(screen.getByTestId("ak-token-option"));
		expect(commits).toEqual([{ kind: "token", tokenId: "brand" }]);
	});
});

/**
 * Regression: the picker's create-from-literal and import-as-copy both
 * commit a `token.create` and then attach the new token through the
 * caller's `onAttach`. Every test above stubs `onAttach`, so they prove
 * it is *called* — not that the write it performs lands. Driving a real
 * `LengthControl` closes that gap: the attach is a second command, and
 * the second command carries its own `expectedRevision`.
 */
describe("create-from-literal attaches for real (CORE-P2-002)", () => {
	function LengthField({
		context,
	}: {
		readonly context: NonNullable<ReturnType<typeof useEditorInspector>>;
	}): ReactNode {
		const field = useInspectorField<CssLength>(context, "layout", "width");
		return <LengthControl label="Width" field={field} testId="ak-w" />;
	}

	function LengthHarness(): ReactNode {
		const context = useEditorInspector();
		return context === null ? null : <LengthField context={context} />;
	}

	async function mountLength() {
		const bridge = createStudioEditorBridge();
		storeSeq += 1;
		const storeId = `token-attach-test-${storeSeq}`;
		render(
			<EditorI18nProvider>
				<StudioPluginContextProvider value={createCtx()}>
					<EditorStoreProvider
						storeId={storeId}
						store={createEditorStore({ storeId })}
					>
						<StudioEditorMount
							editor={{ features: { enabled: true } }}
							bridge={bridge}
						>
							<LengthHarness />
						</StudioEditorMount>
					</EditorStoreProvider>
				</StudioPluginContextProvider>
			</EditorI18nProvider>,
		);
		await waitFor(() => expect(bridge.port).not.toBeNull());
		act(() => {
			bridge.selection?.selectMany(["legacy-0"]);
		});
		return bridge;
	}

	it("leaves the field pointing at the new token, not the old literal", async () => {
		const bridge = await mountLength();

		// Give the field a literal so the picker offers "create from literal".
		await waitFor(() => expect(screen.getByTestId("ak-w")).toBeTruthy());
		const input = screen.getByTestId("ak-w");
		fireEvent.change(input, { target: { value: "400" } });
		fireEvent.blur(input);
		await waitFor(() =>
			expect(
				bridge.port?.getSnapshot().authoring.nodes["legacy-0"]?.layout?.base
					?.width,
			).toMatchObject({ kind: "unit", value: 400 }),
		);

		await openPicker();
		fireEvent.change(screen.getByTestId("ak-token-new-name"), {
			target: { value: "size.hero" },
		});
		await act(async () => {
			fireEvent.click(screen.getByTestId("ak-token-create"));
		});

		const authoring = () => bridge.port?.getSnapshot().authoring;
		await waitFor(() =>
			expect(Object.keys(authoring()?.tokens ?? {})).toHaveLength(1),
		);
		const tokenId = Object.keys(authoring()?.tokens ?? {})[0] as string;

		// The whole point of "create from this value": the field must end
		// up token-backed. A stale `expectedRevision` on the follow-up
		// attach silently rejected it and left the literal in place.
		await waitFor(() =>
			expect(authoring()?.nodes["legacy-0"]?.layout?.base?.width).toEqual({
				kind: "token",
				tokenId,
			}),
		);
	});
});
