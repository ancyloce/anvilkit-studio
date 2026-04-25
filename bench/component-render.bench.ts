/**
 * phase5-019 phase4-015 — per-component React render bench.
 *
 * Renders each first-party `@anvilkit/<slug>` component through
 * `@testing-library/react`'s `render()` and measures the render
 * cost. Complementary to `component-emit` (which measures the HTML
 * exporter's static emit path) — together they cover both the SSR
 * and the client-render hot paths per component type.
 *
 * Runs under Node's native ESM loader with a jsdom global pinned by
 * `bench/bench-env.mjs`. Each iteration re-renders into the same
 * shared DOM container and calls `cleanup()` between renders, which
 * mirrors the real editor mount/unmount cycle.
 */

import { Bench } from "tinybench";
import { createElement, type ComponentType } from "react";
import { cleanup, render } from "@testing-library/react";

import { BentoGrid, defaultProps as bentoGridDefaults } from "@anvilkit/bento-grid";
import { BlogList, defaultProps as blogListDefaults } from "@anvilkit/blog-list";
import { Button, defaultProps as buttonDefaults } from "@anvilkit/button";
import { Helps, defaultProps as helpsDefaults } from "@anvilkit/helps";
import { Hero, defaultProps as heroDefaults } from "@anvilkit/hero";
import { Input, defaultProps as inputDefaults } from "@anvilkit/input";
import { LogoClouds, defaultProps as logoCloudsDefaults } from "@anvilkit/logo-clouds";
import { Navbar, defaultProps as navbarDefaults } from "@anvilkit/navbar";
import { PricingMinimal, defaultProps as pricingMinimalDefaults } from "@anvilkit/pricing-minimal";
import { Section, defaultProps as sectionDefaults } from "@anvilkit/section";
import { Statistics, defaultProps as statisticsDefaults } from "@anvilkit/statistics";

import type { BenchResult } from "./types.js";

interface ComponentCase {
	readonly name: string;
	readonly Component: ComponentType<Record<string, unknown>>;
	readonly props: Record<string, unknown>;
}

// All 11 first-party components. Props use each package's committed
// `defaultProps`, which match the Puck editor's drop-in snapshot —
// so this bench measures the real render cost an editor user sees
// on the very first insert of each component.
const CASES: ComponentCase[] = [
	{ name: "BentoGrid", Component: BentoGrid as unknown as ComponentType<Record<string, unknown>>, props: bentoGridDefaults as Record<string, unknown> },
	{ name: "BlogList", Component: BlogList as unknown as ComponentType<Record<string, unknown>>, props: blogListDefaults as Record<string, unknown> },
	{ name: "Button", Component: Button as unknown as ComponentType<Record<string, unknown>>, props: buttonDefaults as Record<string, unknown> },
	{ name: "Helps", Component: Helps as unknown as ComponentType<Record<string, unknown>>, props: helpsDefaults as Record<string, unknown> },
	{ name: "Hero", Component: Hero as unknown as ComponentType<Record<string, unknown>>, props: heroDefaults as Record<string, unknown> },
	{ name: "Input", Component: Input as unknown as ComponentType<Record<string, unknown>>, props: inputDefaults as Record<string, unknown> },
	{ name: "LogoClouds", Component: LogoClouds as unknown as ComponentType<Record<string, unknown>>, props: logoCloudsDefaults as Record<string, unknown> },
	{ name: "Navbar", Component: Navbar as unknown as ComponentType<Record<string, unknown>>, props: navbarDefaults as Record<string, unknown> },
	{ name: "PricingMinimal", Component: PricingMinimal as unknown as ComponentType<Record<string, unknown>>, props: pricingMinimalDefaults as Record<string, unknown> },
	{ name: "Section", Component: Section as unknown as ComponentType<Record<string, unknown>>, props: sectionDefaults as Record<string, unknown> },
	{ name: "Statistics", Component: Statistics as unknown as ComponentType<Record<string, unknown>>, props: statisticsDefaults as Record<string, unknown> },
];

export async function runComponentRenderBench(): Promise<BenchResult[]> {
	// React render variance under jsdom is wider than pure-function
	// benches — first-mount + GC dominates a short window. Give each
	// render task 1s of run time + 150ms warmup so the mean averages
	// over enough iterations to settle below the 20% gate for
	// mid-cost components (Navbar, Helps, LogoClouds).
	const bench = new Bench({ time: 1000, warmupTime: 150 });

	for (const { name, Component, props } of CASES) {
		bench.add(
			`render(${name})`,
			() => {
				render(createElement(Component, props));
			},
			{
				afterEach: () => {
					cleanup();
				},
			},
		);
	}

	await bench.run();

	return bench.tasks.flatMap((task) => {
		if (!task.result || !task.result.latency) return [];
		return [
			{
				name: `component-render:${task.name.slice(7, -1)}`,
				meanMs: task.result.latency.mean,
				hz: task.result.hz,
			},
		];
	});
}
