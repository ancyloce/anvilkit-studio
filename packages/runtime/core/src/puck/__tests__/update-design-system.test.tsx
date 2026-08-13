/**
 * @file P2-05 — root design-system writes on the setData path: pure
 * update validation/no-op/immutability, and the one-dispatch commit
 * against a live `<Puck>` (jsdom) including other-root-prop
 * preservation.
 */

// @vitest-environment jsdom

import type { DesignSystem } from "@anvilkit/contracts/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
	commitDesignSystemUpdate,
	commitDesignSystemUpdateOver,
	updateDesignSystemInData,
} from "../update-design-system.js";

const designSystem: DesignSystem = {
	breakpoints: [
		{ id: "bp-sm", label: "S", maxWidth: 640, order: 0, enabled: true },
	],
	tokens: {},
	tokenModes: { light: { id: "light", name: "Light" } },
	defaultTokenMode: "light",
	styleDefinitions: {},
};

const config: Config = {
	components: { Box: { fields: {}, render: () => null } },
} as unknown as Config;

function docWith(rootProps: Record<string, unknown>): Data {
	return {
		content: [{ type: "Box", props: { id: "box-1" } }],
		root: { props: rootProps },
		zones: {},
	} as unknown as Data;
}

describe("updateDesignSystemInData (P2-05)", () => {
	it("applies a functional edit and preserves sibling root props", () => {
		const data = docWith({ title: "Page", designSystem });
		const result = updateDesignSystemInData({
			data,
			update: (current) => ({
				...(current as DesignSystem),
				defaultTokenMode: "light",
				tokenModes: {
					light: { id: "light", name: "Light" },
					dark: { id: "dark", name: "Dark" },
				},
			}),
		});
		expect(result.status).toBe("updated");
		const rootProps = (
			result.data as unknown as { root: { props: Record<string, unknown> } }
		).root.props;
		expect(rootProps.title).toBe("Page");
		expect(
			(rootProps.designSystem as DesignSystem).tokenModes.dark?.name,
		).toBe("Dark");
	});

	it("never mutates its input", () => {
		const data = docWith({ designSystem });
		const frozen = JSON.parse(JSON.stringify(data));
		updateDesignSystemInData({
			data,
			update: () => undefined,
		});
		expect(data).toEqual(frozen);
	});

	it("returning an equal value is a noop with the same reference", () => {
		const data = docWith({ designSystem });
		const result = updateDesignSystemInData({
			data,
			update: (current) => current,
		});
		expect(result.status).toBe("noop");
		expect(result.data).toBe(data);
	});

	it("rejects an invalid updated design system before writing", () => {
		const data = docWith({ designSystem });
		const result = updateDesignSystemInData({
			data,
			update: () => ({ version: "1" }) as unknown as DesignSystem,
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_INVALID_CSS_VALUE");
		expect(result.data).toBe(data);
	});

	it("refuses to overwrite an existing invalid design system", () => {
		const data = docWith({ designSystem: { version: "broken" } });
		const result = updateDesignSystemInData({
			data,
			update: () => designSystem,
		});
		expect(result.status).toBe("rejected");
		expect(result.errors[0]?.code).toBe("EDITOR_CONTRACT_UNSUPPORTED_VERSION");
	});

	it("undefined removes the designSystem prop entirely", () => {
		const data = docWith({ title: "Page", designSystem });
		const result = updateDesignSystemInData({ data, update: () => undefined });
		expect(result.status).toBe("updated");
		const rootProps = (
			result.data as unknown as { root: { props: Record<string, unknown> } }
		).root.props;
		expect(Object.hasOwn(rootProps, "designSystem")).toBe(false);
		expect(rootProps.title).toBe("Page");
	});
});

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

afterEach(() => {
	cleanup();
	getPuck = null;
});

describe("commitDesignSystemUpdate against a live <Puck> (P2-05)", () => {
	it("one committed intent = one dispatch; live root props update; noop dispatches nothing", () => {
		render(
			<Puck
				config={config}
				data={docWith({ title: "Page", designSystem })}
				iframe={{ enabled: false }}
			>
				<ApiProbe />
			</Puck>,
		);
		if (getPuck === null) throw new Error("ApiProbe never mounted");
		const freshApi = getPuck;
		let dispatches = 0;
		const getPuckApi = (): PuckApi =>
			new Proxy(freshApi(), {
				get(target, property, receiver) {
					if (property === "dispatch") {
						return (action: unknown) => {
							dispatches += 1;
							return (
								target.dispatch as unknown as (action: unknown) => unknown
							)(action);
						};
					}
					return Reflect.get(target, property, receiver);
				},
			});

		const addDark = (current: DesignSystem | undefined): DesignSystem => ({
			...(current as DesignSystem),
			tokenModes: {
				...(current as DesignSystem).tokenModes,
				dark: { id: "dark", name: "Dark" },
			},
		});
		let outcome: ReturnType<typeof commitDesignSystemUpdate> | undefined;
		act(() => {
			outcome = commitDesignSystemUpdate({ getPuckApi }, addDark);
		});
		expect(outcome?.status).toBe("committed");
		expect(dispatches).toBe(1);
		const live = freshApi().appState.data as unknown as {
			root: { props: { title: string; designSystem: DesignSystem } };
		};
		expect(live.root.props.title).toBe("Page");
		expect(live.root.props.designSystem.tokenModes.dark?.name).toBe("Dark");

		let second: ReturnType<typeof commitDesignSystemUpdate> | undefined;
		act(() => {
			second = commitDesignSystemUpdate({ getPuckApi }, addDark);
		});
		expect(second?.status).toBe("noop");
		expect(dispatches).toBe(1);
	});
});

describe("commitDesignSystemUpdateOver retry", () => {
	it("re-derives both halves over a concurrent document edit", () => {
		const initial = docWith({ title: "Initial", designSystem });
		const concurrentDesignSystem: DesignSystem = {
			...designSystem,
			tokenModes: {
				...designSystem.tokenModes,
				dark: { id: "dark", name: "Dark" },
			},
		};
		const concurrent = {
			...initial,
			content: [
				...(initial.content ?? []),
				{ type: "Box", props: { id: "box-2", label: "Concurrent" } },
			],
			root: {
				props: { title: "Concurrent", designSystem: concurrentDesignSystem },
			},
		} as Data;
		let committed: Data | null = null;
		let rewriteRuns = 0;
		const api = {
			appState: { data: initial },
			dispatch: (action: { data: (previous: Data) => Data }) => {
				committed = action.data(concurrent);
			},
		} as unknown as PuckApi;

		const result = commitDesignSystemUpdateOver(
			{ getPuckApi: () => api },
			(data) => {
				rewriteRuns += 1;
				return {
					...data,
					content: (data.content ?? []).map((node) => ({
						...node,
						props: { ...node.props, breakpointCleanup: true },
					})),
				};
			},
			(current) => ({ ...(current as DesignSystem), breakpoints: [] }),
		);

		expect(result.status).toBe("committed");
		expect(rewriteRuns).toBe(2);
		const landed = committed as unknown as {
			content: Array<{ props: Record<string, unknown> }>;
			root: { props: { title: string; designSystem: DesignSystem } };
		};
		expect(landed.root.props.title).toBe("Concurrent");
		expect(landed.root.props.designSystem.tokenModes.dark?.name).toBe("Dark");
		expect(landed.root.props.designSystem.breakpoints).toEqual([]);
		expect(landed.content.map((node) => node.props.id)).toEqual([
			"box-1",
			"box-2",
		]);
		expect(
			landed.content.every((node) => node.props.breakpointCleanup === true),
		).toBe(true);
	});
});
