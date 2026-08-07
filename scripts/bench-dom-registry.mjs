#!/usr/bin/env node
/**
 * PLAN-0028 `p0-004` — DOM-registry hover-resolution baseline.
 *
 * `p5-001` widens `CanvasDomRegistry`'s selector to include
 * `[data-ak-style-target]` and adds `resolveTarget(element)`, which
 * walks ancestors on every pointer event. PLAN-0026 §7 carries that as
 * a named risk: "`resolveTarget` walking the DOM per pointer event
 * across large documents". Its mitigation claims the widened index is
 * built in the registry's existing lazy pass (no second observer, no
 * second traversal) and that resolution is an index lookup after an
 * ancestor walk bounded by component depth.
 *
 * "No regression" is unfalsifiable without a number. This is the
 * number, and — more importantly — the script that produces it, so
 * `p8-010` re-measures the same way rather than comparing against a
 * remembered figure.
 *
 * WHAT THIS MEASURES, AND WHAT IT DOES NOT. This is a jsdom measurement
 * of the ALGORITHM: the selector pass that builds the index, and the
 * ancestor walk that resolves an element to its (nodeId, targetId).
 * It deliberately does not measure browser paint, hit-testing or event
 * dispatch — those would swamp the algorithmic delta `p5-001` actually
 * changes, and they vary more between runs than the thing under test.
 * A browser-level number belongs in the Playwright perf spec, not here.
 *
 * The selectors mirror `packages/runtime/core/src/react/editor/canvas/
 * dom-registry.ts` (today: `data-ak-node` at :47, `data-puck-component`
 * at :48) and the stamping helper every component uses — each
 * package's own `src/authoring.ts`, at :65 (`anvilRootAttrs`) and :74
 * (`anvilTargetAttrs`), which emit the exact attribute pair
 * `data-ak-style-node` / `data-ak-style-target`.
 *
 * Usage: node scripts/bench-dom-registry.mjs [nodeCount] [runs]
 */

import { JSDOM } from "jsdom";

const NODES = Number(process.argv[2] ?? 500);
const RUNS = Number(process.argv[3] ?? 7);

/** Today's registry selector. */
const CURRENT = "[data-ak-node], [data-puck-component]";
/** What `p5-001` widens it to. */
const WIDENED = "[data-ak-node], [data-puck-component], [data-ak-style-target]";

/**
 * A document shaped like a real one: N Puck nodes, each a component
 * instance stamping a root target plus 5 inner targets on nested
 * elements — the blog-list shape (6 declared targets, `root` plus
 * `card`/`cardImage`/`cardMeta`/`cardTitle`/`cardDescription`), with
 * the repeated `card` family stamped twice per node the way
 * `BlogList.tsx` spreads `targetAttrs.card` across both card branches.
 */
function buildDocument(nodeCount) {
	const parts = [];
	for (let i = 0; i < nodeCount; i++) {
		const id = `node-${i}`;
		parts.push(
			`<section data-ak-node="${id}" data-puck-component="${id}" data-ak-style-node="${id}" data-ak-style-target="root">`,
		);
		for (const instance of [0, 1]) {
			parts.push(
				`<article data-ak-style-node="${id}" data-ak-style-target="card">`,
				`<img data-ak-style-node="${id}" data-ak-style-target="cardImage" />`,
				`<div data-ak-style-node="${id}" data-ak-style-target="cardMeta">`,
				`<h3 data-ak-style-node="${id}" data-ak-style-target="cardTitle"><span class="deep-${instance}">t</span></h3>`,
				`<p data-ak-style-node="${id}" data-ak-style-target="cardDescription"><em>d</em></p>`,
				`</div></article>`,
			);
		}
		parts.push("</section>");
	}
	return new JSDOM(`<!doctype html><body>${parts.join("")}</body>`);
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const spread = (xs) => Math.max(...xs) - Math.min(...xs);
const fmt = (n) => `${n.toFixed(3)}ms`;

const dom = buildDocument(NODES);
const doc = dom.window.document;

const totalElements = doc.querySelectorAll("*").length;
const currentMatches = doc.querySelectorAll(CURRENT).length;
const widenedMatches = doc.querySelectorAll(WIDENED).length;

/** 1. Index-build pass — the cost the widened selector changes. */
function indexPass(selector) {
	const t = performance.now();
	const index = new Map();
	for (const el of doc.querySelectorAll(selector)) {
		const nodeId =
			el.getAttribute("data-ak-node") ?? el.getAttribute("data-ak-style-node");
		const targetId = el.getAttribute("data-ak-style-target");
		if (nodeId === null) continue;
		if (targetId === null) {
			index.set(nodeId, el);
		} else {
			let inner = index.get(nodeId);
			if (!(inner instanceof Map)) index.set(nodeId, (inner = new Map()));
			const list = inner.get(targetId) ?? [];
			list.push(el);
			inner.set(targetId, list);
		}
	}
	return { ms: performance.now() - t, size: index.size };
}

/**
 * 2. Hover resolution — the per-pointer-event cost `p5-001` adds.
 * Walks ancestors from a deeply nested element to the nearest stamped
 * target, which is the worst realistic case.
 */
const deepTargets = [...doc.querySelectorAll("span.deep-0, span.deep-1, em")];
function resolvePass(iterations) {
	const t = performance.now();
	let hits = 0;
	for (let i = 0; i < iterations; i++) {
		let el = deepTargets[i % deepTargets.length];
		while (el && el.getAttribute) {
			if (el.getAttribute("data-ak-style-target") !== null) {
				hits++;
				break;
			}
			el = el.parentElement;
		}
	}
	return { ms: performance.now() - t, hits, iterations };
}

const buildCurrent = [];
const buildWidened = [];
const resolve1k = [];
for (let r = 0; r < RUNS; r++) {
	buildCurrent.push(indexPass(CURRENT).ms);
	buildWidened.push(indexPass(WIDENED).ms);
	resolve1k.push(resolvePass(1000).ms);
}

console.log(`
DOM-registry hover baseline — jsdom, algorithm only (no paint/hit-test)

  document          ${NODES} Puck nodes · ${totalElements} elements
  current selector  ${CURRENT}
                    matches ${currentMatches} elements
  widened selector  ${WIDENED}
                    matches ${widenedMatches} elements (${(widenedMatches / currentMatches).toFixed(1)}x)
  runs              ${RUNS}

  index build, current selector   median ${fmt(median(buildCurrent))}  spread ${fmt(spread(buildCurrent))}
  index build, widened selector   median ${fmt(median(buildWidened))}  spread ${fmt(spread(buildWidened))}
  delta                           ${fmt(median(buildWidened) - median(buildCurrent))}  (${((median(buildWidened) / median(buildCurrent) - 1) * 100).toFixed(0)}%)

  hover resolve x1000 (deep)      median ${fmt(median(resolve1k))}  spread ${fmt(spread(resolve1k))}
  per resolution                  ${fmt(median(resolve1k) / 1000)}

  Re-run with the same arguments in \`p8-010\` and compare medians. The
  index-build delta is the honest cost of the widened selector; the
  per-resolution figure is the cost \`p5-001\` adds to every pointer move.
`);
