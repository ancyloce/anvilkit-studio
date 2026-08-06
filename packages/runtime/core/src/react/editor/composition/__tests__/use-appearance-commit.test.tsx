/**
 * @file P2-04 — commit-path tests against a real `<Puck>`: exactly one
 * `setData` dispatch per committed intent (counted through a proxied
 * PuckApi), zero dispatches for no-ops and rejections, functional
 * updater lands in live app state, and the `useAppearanceCommit` hook
 * returns a stable committer.
 */

import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { commitAppearanceUpdate } from "../../../../puck/update-appearance.js";
import {
	type AppearanceCommitInput,
	useAppearanceCommit,
} from "../use-appearance-commit.js";

const config: Config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: { label: "Box", properties: ["display", "gap"] },
						},
					},
				},
			},
			render: () => <div data-testid="box-render" />,
		},
	},
} as unknown as Config;

const data = {
	content: [
		{ type: "Box", props: { id: "box-1" } },
		{ type: "Box", props: { id: "box-2" } },
	],
	root: { props: {} },
	zones: {},
} as Data;

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

let hookCommit: ((input: AppearanceCommitInput) => unknown) | null = null;
const hookIdentities: unknown[] = [];

function HookProbe(): React.ReactElement {
	hookCommit = useAppearanceCommit();
	hookIdentities.push(hookCommit);
	return <span hidden />;
}

function mount() {
	return render(
		<Puck config={config} data={data} iframe={{ enabled: false }}>
			<ApiProbe />
			<HookProbe />
		</Puck>,
	);
}

/**
 * A dispatch-counting `getPuckApi`. `useGetPuck`'s getter returns a
 * FRESH snapshot per call, so the proxy must wrap a fresh api on every
 * `getPuckApi()` call — wrapping one snapshot would feed the committer
 * stale pre-commit data.
 */
function countingApi(): {
	getPuckApi: () => PuckApi;
	dispatches: () => number;
} {
	if (getPuck === null) throw new Error("ApiProbe never mounted");
	const freshApi = getPuck;
	let count = 0;
	const getPuckApi = (): PuckApi =>
		new Proxy(freshApi(), {
			get(target, property, receiver) {
				if (property === "dispatch") {
					return (action: unknown) => {
						count += 1;
						return (target.dispatch as unknown as (action: unknown) => unknown)(
							action,
						);
					};
				}
				return Reflect.get(target, property, receiver);
			},
		});
	return { getPuckApi, dispatches: () => count };
}

function displayOf(nodeIndex: number): unknown {
	if (getPuck === null) throw new Error("ApiProbe never mounted");
	const live = getPuck().appState.data as unknown as {
		content: {
			props: {
				appearance?: {
					targets?: {
						root?: { style?: { base?: { layout?: { display?: unknown } } } };
					};
				};
			};
		}[];
	};
	return live.content[nodeIndex]?.props.appearance?.targets?.root?.style?.base
		?.layout?.display;
}

afterEach(() => {
	cleanup();
	getPuck = null;
	hookCommit = null;
	hookIdentities.length = 0;
});

describe("commitAppearanceUpdate against a live <Puck> (P2-04)", () => {
	it("one committed intent = exactly one dispatch; the updater lands in app state", () => {
		mount();
		const { getPuckApi, dispatches } = countingApi();
		let outcome: ReturnType<typeof commitAppearanceUpdate> | undefined;
		act(() => {
			outcome = commitAppearanceUpdate(
				{ getPuckApi },
				{
					config,
					nodeIds: ["box-1", "box-2"],
					targetId: "root",
					layer: "base",
					patch: { kind: "set-property", property: "display", value: "flex" },
				},
			);
		});
		expect(outcome?.status).toBe("committed");
		expect(outcome?.changedNodeIds).toEqual(["box-1", "box-2"]);
		expect(dispatches()).toBe(1);
		expect(displayOf(0)).toBe("flex");
		expect(displayOf(1)).toBe("flex");
	});

	it("a no-op dispatches nothing and records no history entry", () => {
		mount();
		const { getPuckApi, dispatches } = countingApi();
		act(() => {
			commitAppearanceUpdate(
				{ getPuckApi },
				{
					config,
					nodeIds: ["box-1"],
					targetId: "root",
					layer: "base",
					patch: { kind: "set-property", property: "display", value: "flex" },
				},
			);
		});
		expect(dispatches()).toBe(1);
		let second: ReturnType<typeof commitAppearanceUpdate> | undefined;
		act(() => {
			second = commitAppearanceUpdate(
				{ getPuckApi },
				{
					config,
					nodeIds: ["box-1"],
					targetId: "root",
					layer: "base",
					patch: { kind: "set-property", property: "display", value: "flex" },
				},
			);
		});
		expect(second?.status).toBe("noop");
		expect(dispatches()).toBe(1);
	});

	it("a rejected intent dispatches nothing", () => {
		mount();
		const { getPuckApi, dispatches } = countingApi();
		let outcome: ReturnType<typeof commitAppearanceUpdate> | undefined;
		act(() => {
			outcome = commitAppearanceUpdate(
				{ getPuckApi },
				{
					config,
					nodeIds: ["box-1"],
					targetId: "root",
					layer: "base",
					patch: { kind: "set-property", property: "opacity", value: 0.5 },
				},
			);
		});
		expect(outcome?.status).toBe("rejected");
		expect(outcome?.errors[0]?.code).toBe("EDITOR_CAPABILITY_UNSUPPORTED");
		expect(dispatches()).toBe(0);
	});
});

describe("useAppearanceCommit (P2-04)", () => {
	it("commits through the live PuckApi and stays referentially stable", () => {
		mount();
		if (hookCommit === null) throw new Error("HookProbe never mounted");
		let outcome: unknown;
		act(() => {
			outcome = (
				hookCommit as (input: AppearanceCommitInput) => { status: string }
			)({
				config,
				nodeIds: ["box-2"],
				targetId: "root",
				layer: "base",
				patch: {
					kind: "set-property",
					property: "gap",
					value: { kind: "unit", value: 8, unit: "px" },
				},
			});
		});
		expect((outcome as { status: string }).status).toBe("committed");
		expect(
			(getPuck as () => PuckApi)().appState.data.content[1]?.props,
		).toHaveProperty("appearance");
		// The committer identity survives re-renders (useCallback on
		// useGetPuck's stable getter).
		expect(new Set(hookIdentities).size).toBe(1);
	});
});
