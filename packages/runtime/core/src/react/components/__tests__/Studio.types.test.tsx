/**
 * @file Compile-time type tests for the generic `<Studio>` boundary.
 *
 * Like `src/types/__tests__/plugin.test.ts`, these assertions have no
 * runtime meaning — they are enforced by `tsc --noEmit` against
 * `tsconfig.test.json` (the `typecheck` script). They prove the review
 * §2/§5 fix: an externally-typed `StudioPlugin<UserConfig>` keeps its
 * type contribution through `<Studio>`'s public props, and `data` /
 * `onChange` / `onPublish` are narrowed to that config's data shape.
 *
 * Valid shapes must compile; invalid shapes carry `@ts-expect-error`,
 * which itself errors if the line ever starts compiling. The trailing
 * `expect(true).toBe(true)` keeps vitest from warning "no tests".
 */

import type { Config as PuckConfig, UserGenerics } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { Studio } from "@/components/Studio";
import type { StudioProps } from "@/components/use-studio-controller";
import type { StudioPlugin } from "@/types/plugin";

// A host-specific config — the realistic "external package" scenario.
// `{ components: {} }` matches the existing `<Studio>` test configs and
// is a valid `Config`; the point is that `MyConfig` is a *distinct*
// type the generic must thread, not the broad default.
const myConfig = { components: {} } satisfies PuckConfig;
type MyConfig = typeof myConfig;
type MyData = UserGenerics<MyConfig>["UserData"];

// A plugin authored against the host config — exactly what a published
// `@anvilkit/plugin-*` package would export.
const typedPlugin: StudioPlugin<MyConfig> = {
	meta: {
		id: "com.example.typed",
		name: "Typed",
		version: "1.0.0",
		coreVersion: "^0.1.0",
	},
	register(ctx) {
		// `ctx` must be `StudioPluginContext<MyConfig>` — `getData()`
		// returns the config-correct data shape.
		const data: MyData = ctx.getData();
		void data;
		return { meta: typedPlugin.meta };
	},
};

describe("Studio generic boundary", () => {
	it("threads UserConfig through plugins and callbacks", () => {
		// The external plugin is assignable to the generic props' list.
		const props: StudioProps<MyConfig> = {
			puckConfig: myConfig,
			plugins: [typedPlugin],
			onPublish: (data) => {
				// `data` is narrowed to `MyConfig`'s data shape.
				const narrowed: MyData = data;
				void narrowed;
			},
			onChange: (data) => {
				const narrowed: MyData = data;
				void narrowed;
			},
		};
		void props;

		// The component itself accepts the explicit type argument.
		const el = (
			<Studio<MyConfig> puckConfig={myConfig} plugins={[typedPlugin]} />
		);
		void el;

		expect(true).toBe(true);
	});

	it("rejects malformed props (negative assertions)", () => {
		// @ts-expect-error — `puckConfig` is required.
		const missingConfig: StudioProps<MyConfig> = { plugins: [typedPlugin] };
		void missingConfig;

		const badPlugins: StudioProps<MyConfig> = {
			puckConfig: myConfig,
			// @ts-expect-error — a number is not a Studio/Puck plugin.
			plugins: [42],
		};
		void badPlugins;

		// @ts-expect-error — `puckConfig` is required on the component.
		const bad = <Studio<MyConfig> plugins={[typedPlugin]} />;
		void bad;

		expect(true).toBe(true);
	});
});
