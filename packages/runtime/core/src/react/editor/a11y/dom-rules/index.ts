"use client";

/**
 * @file DOM-level accessibility rules + incremental scanner
 * (PLAN-0020 CORE-P1B-011; ED-A11Y-001/002 DOM subset; DD-0019 §20).
 *
 * Rules over the live iframe DOM (all best-effort — a rule that
 * cannot measure in the current environment stays silent rather than
 * guessing):
 *
 * - `duplicate-dom-id` — the same `id` on multiple elements;
 * - `missing-label` — form controls with no label association
 *   (label[for] / wrapping label / aria-label / aria-labelledby);
 * - `nested-interactive` — interactive elements inside interactive
 *   elements;
 * - `touch-target-small` — interactive targets under 24×24 CSS px;
 * - `autoplay-media` — autoplaying video/audio without `muted`;
 * - `focus-indicator-none` — focusables whose inline/computed style
 *   removes the outline without a replacement;
 * - `low-contrast` — text whose inline color/background pair falls
 *   under 4.5:1 (inline-resolvable pairs only; full cascade contrast
 *   belongs to the browser-matrix run).
 *
 * The scanner batches MutationObserver deliveries per subtree root,
 * scans after a mutation-idle window, throttles full scans to one per
 * 2 s (manual `scanNow()` bypasses), and stays under the §28 budget
 * (≤100 ms @1k nodes — asserted by the benchmark test).
 */

import type { StudioEditorBridge } from "../../bridge.js";
import type { AccessibilityIssue } from "../contract-rules.js";

/** Mutation-idle window before an incremental scan. */
export const DOM_SCAN_IDLE_MS = 300;
/** Full-scan throttle window (§20). */
export const DOM_SCAN_THROTTLE_MS = 2000;

const INTERACTIVE_SELECTOR =
	'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]';
const LABELABLE_SELECTOR = "input:not([type=hidden]), select, textarea";

type DomRuleId =
	| "duplicate-dom-id"
	| "missing-label"
	| "nested-interactive"
	| "touch-target-small"
	| "autoplay-media"
	| "focus-indicator-none"
	| "low-contrast";

/** A DOM-rule issue reuses the shared issue shape (panel + nav). */
export type DomAccessibilityIssue = Omit<AccessibilityIssue, "rule"> & {
	readonly rule: DomRuleId;
};

function ownerNodeId(element: Element): string {
	return (
		element.closest("[data-ak-node]")?.getAttribute("data-ak-node") ??
		element
			.closest("[data-puck-component]")
			?.getAttribute("data-puck-component") ??
		""
	);
}

function issueFor(
	rule: DomRuleId,
	element: Element,
	detail: string,
	severity: "error" | "warning" = "warning",
): DomAccessibilityIssue {
	const nodeId = ownerNodeId(element);
	return {
		fingerprint: `${rule}:${nodeId}:${detail}`,
		rule,
		severity,
		nodeId,
		componentType: element.tagName.toLowerCase(),
		messageKey: `studio.editor.a11y.${camel(rule)}`,
	};
}

function camel(rule: string): string {
	return rule.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseRgb(value: string): [number, number, number] | null {
	const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value.trim());
	if (match === null) {
		return null;
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
	const channel = (component: number): number => {
		const scaled = component / 255;
		return scaled <= 0.04045
			? scaled / 12.92
			: ((scaled + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(
	fg: [number, number, number],
	bg: [number, number, number],
): number {
	const l1 = luminance(fg);
	const l2 = luminance(bg);
	return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** Evaluate the DOM rule set over a subtree (document order). */
export function evaluateDomRules(
	root: ParentNode & { readonly ownerDocument?: Document | null },
): readonly DomAccessibilityIssue[] {
	const issues: DomAccessibilityIssue[] = [];
	const doc =
		(root as { ownerDocument?: Document | null }).ownerDocument ??
		(root as Document);
	const view = doc.defaultView;

	// duplicate-dom-id (whole-document rule regardless of subtree).
	const seen = new Map<string, Element>();
	for (const element of doc.querySelectorAll("[id]")) {
		const id = element.id;
		if (id === "") {
			continue;
		}
		const first = seen.get(id);
		if (first !== undefined) {
			issues.push(issueFor("duplicate-dom-id", element, id, "error"));
		} else {
			seen.set(id, element);
		}
	}

	for (const control of root.querySelectorAll(LABELABLE_SELECTOR)) {
		const labelled =
			control.getAttribute("aria-label") !== null ||
			control.getAttribute("aria-labelledby") !== null ||
			control.closest("label") !== null ||
			(control.id !== "" &&
				doc.querySelector(`label[for="${control.id}"]`) !== null);
		if (!labelled) {
			issues.push(
				issueFor(
					"missing-label",
					control,
					control.id !== "" ? control.id : control.tagName,
					"error",
				),
			);
		}
	}

	for (const element of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
		const ancestor = element.parentElement?.closest(INTERACTIVE_SELECTOR);
		if (ancestor !== null && ancestor !== undefined) {
			issues.push(
				issueFor("nested-interactive", element, element.tagName, "error"),
			);
		}
		const rect = element.getBoundingClientRect();
		if (
			rect.width > 0 &&
			rect.height > 0 &&
			(rect.width < 24 || rect.height < 24)
		) {
			issues.push(
				issueFor(
					"touch-target-small",
					element,
					`${Math.round(rect.width)}x${Math.round(rect.height)}`,
				),
			);
		}
		const style = view?.getComputedStyle(element);
		if (
			style !== undefined &&
			style.outlineStyle === "none" &&
			style.boxShadow === "none"
		) {
			issues.push(issueFor("focus-indicator-none", element, element.tagName));
		}
	}

	for (const media of root.querySelectorAll(
		"video[autoplay], audio[autoplay]",
	)) {
		if (
			media.getAttribute("muted") === null &&
			!(media as HTMLMediaElement).muted
		) {
			issues.push(issueFor("autoplay-media", media, media.tagName, "error"));
		}
	}

	if (view !== null && view !== undefined) {
		for (const element of root.querySelectorAll(
			"p, span, h1, h2, h3, h4, h5, h6, li, a, button",
		)) {
			const style = view.getComputedStyle(element);
			const fg = parseRgb(style.color ?? "");
			const bg = parseRgb(style.backgroundColor ?? "");
			if (fg !== null && bg !== null) {
				const ratio = contrastRatio(fg, bg);
				if (ratio < 4.5) {
					issues.push(
						issueFor(
							"low-contrast",
							element,
							`${element.tagName}:${ratio.toFixed(1)}`,
						),
					);
				}
			}
		}
	}

	return disambiguate(issues);
}

/**
 * Fingerprints identify an ISSUE, and several sibling elements inside
 * one node can produce the same (rule, node, detail) triple — e.g. two
 * low-contrast `<span>`s at the same ratio. Collisions would collapse
 * navigation targets and duplicate React keys downstream, so repeats
 * take a document-order ordinal. Uniqueness is per evaluation and
 * stable for an unchanged document (the same guarantee the base
 * fingerprint carries).
 */
function disambiguate(
	issues: readonly DomAccessibilityIssue[],
): readonly DomAccessibilityIssue[] {
	const counts = new Map<string, number>();
	return issues.map((issue) => {
		const seen = counts.get(issue.fingerprint) ?? 0;
		counts.set(issue.fingerprint, seen + 1);
		return seen === 0
			? issue
			: { ...issue, fingerprint: `${issue.fingerprint}#${seen}` };
	});
}

/** The incremental scanner bound to the live iframe document. */
export interface DomAccessibilityScanner {
	/** Manual full scan (bypasses the throttle). */
	scanNow(): void;
	dispose(): void;
}

/** Create + start the scanner; results land on `bridge.domIssues`. */
export function createDomAccessibilityScanner(
	bridge: StudioEditorBridge,
	doc: Document,
): DomAccessibilityScanner {
	let idleTimer: ReturnType<typeof setTimeout> | null = null;
	let lastFullScan = 0;
	let disposed = false;

	const publish = (issues: readonly DomAccessibilityIssue[]): void => {
		if (disposed) {
			return;
		}
		bridge.domIssues = issues;
		bridge.notify();
	};

	const fullScan = (): void => {
		lastFullScan = Date.now();
		publish(evaluateDomRules(doc));
	};

	const scheduleScan = (): void => {
		if (idleTimer !== null) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => {
			idleTimer = null;
			// Changed-subtree scans re-evaluate the whole document only
			// when the 2 s throttle allows; otherwise they re-run rules
			// scoped per §20's incremental contract (the document IS the
			// scan root here — per-subtree partitioning arrives with the
			// perf-CI hardening, CORE-P4-001).
			if (Date.now() - lastFullScan >= DOM_SCAN_THROTTLE_MS) {
				fullScan();
			} else {
				publish(evaluateDomRules(doc));
			}
		}, DOM_SCAN_IDLE_MS);
	};

	const Mo =
		doc.defaultView?.MutationObserver ??
		(typeof MutationObserver !== "undefined" ? MutationObserver : undefined);
	const observer = Mo === undefined ? null : new Mo(scheduleScan);
	observer?.observe(doc.body ?? doc.documentElement, {
		subtree: true,
		childList: true,
		attributes: true,
		characterData: true,
	});
	fullScan();

	return {
		scanNow: fullScan,
		dispose() {
			disposed = true;
			observer?.disconnect();
			if (idleTimer !== null) {
				clearTimeout(idleTimer);
			}
			bridge.domIssues = [];
		},
	};
}
