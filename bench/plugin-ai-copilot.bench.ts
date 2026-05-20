/**
 * MT-5 — `applySectionPatch` micro-bench.
 *
 * Exercises the section-patch apply path on three synthetic Puck trees
 * (10-node flat, 100-node mixed, 500-node deep-nested) so regressions
 * in the recursive walk or the `findContiguousRun` matcher show up in
 * CI before they reach the editor's hot path.
 *
 * Pure-data bench — no React, no jsdom. Uses synthetic component types
 * because the validator is not part of the apply contract; only the
 * structural Puck `Data` shape matters.
 */
import { Bench } from "tinybench";

import { applySectionPatch } from "@anvilkit/plugin-ai-copilot";
import type { AiSectionPatch } from "@anvilkit/core/types";
import type { Data as PuckData } from "@puckeditor/core";

import type { BenchResult } from "./types.js";

interface Tree {
  readonly data: PuckData;
  readonly patch: AiSectionPatch;
}

function buildFlatTree(size: number): Tree {
  const content = Array.from({ length: size }, (_, i) => ({
    type: "Block",
    props: { id: `n-${i}`, title: `Block ${i}` },
  }));
  return {
    data: {
      root: { props: {} },
      content,
      zones: {},
    } as unknown as PuckData,
    patch: {
      zoneId: "root-zone",
      nodeIds: [`n-${Math.floor(size / 2)}`],
      replacement: [
        {
          id: "n-replaced",
          type: "Block",
          props: { title: "Replaced" },
        },
      ],
    },
  };
}

function buildMixedTree(size: number): Tree {
  // Half the nodes live in root, half are nested as a single layer of
  // slot children inside the first item. Exercises both the contiguous-
  // run matcher and the slot-rewrite walker.
  const half = Math.floor(size / 2);
  const slotChildren = Array.from({ length: half }, (_, i) => ({
    type: "Block",
    props: { id: `slot-${i}`, title: `Slot ${i}` },
  }));
  const rest = Array.from({ length: size - half - 1 }, (_, i) => ({
    type: "Block",
    props: { id: `root-${i}`, title: `Root ${i}` },
  }));
  const content = [
    {
      type: "Layout",
      props: {
        id: "layout-1",
        content: slotChildren,
      },
    },
    ...rest,
  ];
  return {
    data: {
      root: { props: {} },
      content,
      zones: {},
    } as unknown as PuckData,
    patch: {
      zoneId: "layout-1:content",
      nodeIds: [`slot-${Math.floor(half / 2)}`],
      replacement: [
        {
          id: "slot-replaced",
          type: "Block",
          props: { title: "Replaced" },
        },
      ],
    },
  };
}

function buildDeepNestedTree(size: number): Tree {
  // Build a deep chain of `Layout` components, each carrying one
  // child layout and one block. Final block is the patch target.
  // Cap depth at MAX_TREE_DEPTH-2 to leave headroom; spill any
  // remainder into root content as additional siblings.
  const MAX_DEPTH = 60;
  const depth = Math.min(MAX_DEPTH, Math.floor(size / 2));
  const remainder = size - depth * 2;

  type Item = { type: string; props: Record<string, unknown> };

  let inner: Item = {
    type: "Block",
    props: { id: "deep-target", title: "Target" },
  };
  for (let i = depth - 1; i >= 0; i--) {
    inner = {
      type: "Layout",
      props: {
        id: `layout-${i}`,
        content: [
          {
            type: "Block",
            props: { id: `block-${i}`, title: `Block ${i}` },
          },
          inner,
        ],
      },
    };
  }

  const siblings = Array.from({ length: Math.max(0, remainder) }, (_, i) => ({
    type: "Block",
    props: { id: `sib-${i}`, title: `Sibling ${i}` },
  }));

  return {
    data: {
      root: { props: {} },
      content: [inner, ...siblings],
      zones: {},
    } as unknown as PuckData,
    patch: {
      zoneId: `layout-${depth - 1}:content`,
      nodeIds: ["deep-target"],
      replacement: [
        {
          id: "deep-replaced",
          type: "Block",
          props: { title: "Replaced" },
        },
      ],
    },
  };
}

const SCENARIOS: ReadonlyArray<{
  readonly name: string;
  readonly size: number;
  readonly tree: () => Tree;
}> = [
  { name: "flat-10", size: 10, tree: () => buildFlatTree(10) },
  { name: "mixed-100", size: 100, tree: () => buildMixedTree(100) },
  { name: "deep-500", size: 500, tree: () => buildDeepNestedTree(500) },
];

export async function runApplySectionPatchBench(): Promise<BenchResult[]> {
  const bench = new Bench({ time: 300, warmupTime: 60 });

  for (const scenario of SCENARIOS) {
    const { data, patch } = scenario.tree();
    bench.add(`apply-section-patch(${scenario.name})`, () => {
      applySectionPatch(data, patch);
    });
  }

  await bench.run();

  return bench.tasks.flatMap((task) => {
    if (!task.result || !task.result.latency) return [];
    const match = task.name.match(/^apply-section-patch\(([^)]+)\)$/);
    if (!match) return [];
    return [
      {
        name: `plugin-ai-copilot:apply-section-patch:${match[1]}`,
        meanMs: task.result.latency.mean,
        hz: task.result.hz,
      },
    ];
  });
}
