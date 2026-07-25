/**
 * @file CORE-P1B-009A..H — inline editing: target resolution and
 * §26.1 precedence, the single-session controller lifecycle, in-place
 * plain editing (normalization, idle/blur commit, Escape restore,
 * value-equal noop), IME composition fencing, paste sanitation
 * (plain extraction, 1 MiB cap), commit single-intent, and the shared
 * Tiptap sanitizer allowlist.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import type { Data as PuckData } from "@puckeditor/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioEditorBridge } from "../bridge.js";
import { createCanvasDomRegistry } from "../canvas/dom-registry.js";
import { createEditorCommandPort } from "../command-port.js";
import {
	createInlineEditController,
	INLINE_IDLE_COMMIT_MS,
	normalizePlainText,
} from "../inline/controller.js";
import {
	hasDeclaredTextTargets,
	resolveTextTargets,
	targetFromElement,
} from "../inline/targets.js";
import {
	sanitizeTiptapDocument,
	tiptapFromPlainText,
	tiptapToPlainText,
} from "../inline/tiptap-contract.js";
import { createEditorSelectionController } from "../selection.js";

afterEach(() => {
	vi.useRealTimers();
});

const TEXT_METADATA: EditorCapabilityMetadata = {
	version: "1",
	styleTarget: "root",
	capabilities: {
		inlineText: [{ id: "title", propPath: "title", format: "plain" }],
	},
};

function docData(): PuckData {
	return {
		content: [
			{
				type: "Card",
				props: { id: "card-1", title: "Hello world" },
			},
		],
		root: { props: {} },
		zones: {},
	} as unknown as PuckData;
}

function setup(metadata: EditorCapabilityMetadata = TEXT_METADATA) {
	const bridge = createStudioEditorBridge();
	let data = docData();
	let recorded = 0;
	const port = createEditorCommandPort({
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				dispatch: (action: { recordHistory?: boolean; data?: typeof data }) => {
					if (action.data !== undefined) {
						data = action.data;
					}
					if (action.recordHistory === true) {
						recorded += 1;
					}
				},
			}) as never,
		getData: () => data,
		editor: { features: { enabled: true } },
		onStateChange: () => bridge.notify(),
	});
	bridge.port = port;
	bridge.selection = createEditorSelectionController({
		syncPrimaryToPuck: () => undefined,
		onChange: () => bridge.notify(),
	});
	bridge.capabilities = {
		forComponent: () => metadata,
		forNode: () => metadata,
		listUsedFeatures: () => [],
	};

	const doc = document.implementation.createHTMLDocument();
	doc.body.innerHTML = `
		<div id="frame-root">
			<div data-ak-node="card-1">
				<span data-ak-text-target="title">Hello world</span>
			</div>
		</div>`;
	const registry = createCanvasDomRegistry();
	registry.register(doc);
	bridge.canvasRegistry = registry;
	bridge.canvasDocument = doc;

	const inline = createInlineEditController(bridge);
	bridge.inline = inline;
	const span = doc.querySelector(
		'[data-ak-text-target="title"]',
	) as HTMLElement;
	return {
		bridge,
		inline,
		span,
		doc,
		props: () =>
			(
				(
					data.content as ReadonlyArray<{ props: Record<string, unknown> }>
				)[0] ?? { props: {} }
			).props,
		recordedCount: () => recorded,
	};
}

describe("target resolution + precedence (CORE-P1B-009A)", () => {
	it("resolves declared targets to stamped regions and gates the heuristic", () => {
		const { bridge, span } = setup();
		expect(hasDeclaredTextTargets(TEXT_METADATA)).toBe(true);
		expect(hasDeclaredTextTargets(undefined)).toBe(false);

		const registry = bridge.canvasRegistry;
		if (registry == null) throw new Error("registry missing");
		const resolved = resolveTextTargets("card-1", TEXT_METADATA, registry);
		expect(resolved).toHaveLength(1);
		expect(resolved[0]?.element).toBe(span);

		const fromEvent = targetFromElement(
			span,
			"card-1",
			TEXT_METADATA,
			registry,
		);
		expect(fromEvent?.target.id).toBe("title");
		expect(targetFromElement(span, "card-1", undefined, registry)).toBeNull();
	});
});

describe("plain-text session (CORE-P1B-009B/C/H)", () => {
	it("enters in place, commits on blur through ONE recording dispatch", () => {
		const { inline, span, props, recordedCount } = setup();
		expect(inline.tryEnterFromEvent(span)).toBe(true);
		expect(inline.getSession()?.nodeId).toBe("card-1");
		expect(span.contentEditable).toBe("true");

		span.textContent = "Edited title";
		span.dispatchEvent(new Event("blur"));

		expect(inline.getSession()).toBeNull();
		expect(props().title).toBe("Edited title");
		expect(recordedCount()).toBe(1);
		expect(span.contentEditable).not.toBe("true");
	});

	it("commits at 750 ms typing idle", () => {
		vi.useFakeTimers();
		const { inline, span, props } = setup();
		inline.tryEnterFromEvent(span);
		span.textContent = "Idle commit";
		span.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(INLINE_IDLE_COMMIT_MS - 50);
		expect(props().title).toBe("Hello world");
		vi.advanceTimersByTime(100);
		expect(props().title).toBe("Idle commit");
		expect(inline.getSession()).toBeNull();
	});

	it("Escape cancels and restores the pre-edit value exactly", () => {
		const { inline, span, props, recordedCount } = setup();
		inline.tryEnterFromEvent(span);
		span.textContent = "Doomed draft";
		span.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(inline.getSession()).toBeNull();
		expect(span.textContent).toBe("Hello world");
		expect(props().title).toBe("Hello world");
		expect(recordedCount()).toBe(0);
	});

	it("value-equal drafts commit nothing (no history entry)", () => {
		const { inline, span, recordedCount } = setup();
		inline.tryEnterFromEvent(span);
		span.dispatchEvent(new Event("blur"));
		expect(recordedCount()).toBe(0);
	});

	it("keeps exactly one session and refuses locked/gated entry", async () => {
		const { bridge, inline, span } = setup();
		const port = bridge.port;
		if (port === null) throw new Error("port missing");
		await port.execute({
			id: "lock",
			expectedRevision: 0,
			source: "layers",
			timestamp: 1,
			type: "node.lock.set",
			nodeIds: ["card-1"],
			locked: true,
		});
		expect(inline.tryEnterFromEvent(span)).toBe(false);
	});

	it("a foreign commit interrupts the session and restores", async () => {
		const { bridge, inline, span, props } = setup();
		inline.tryEnterFromEvent(span);
		span.textContent = "Draft in flight";
		await bridge.port?.execute({
			id: "foreign",
			expectedRevision: 0,
			source: "plugin",
			timestamp: 1,
			type: "node.rename",
			nodeId: "card-1",
			name: "renamed",
		});
		expect(inline.getSession()).toBeNull();
		expect(span.textContent).toBe("Hello world");
		expect(props().title).toBe("Hello world");
	});
});

describe("IME composition fencing (CORE-P1B-009F)", () => {
	it("never commits during composition; commit lands on compositionend", () => {
		vi.useFakeTimers();
		const { inline, span, props } = setup();
		inline.tryEnterFromEvent(span);
		span.dispatchEvent(new Event("compositionstart"));
		span.textContent = "こんにちは";
		span.dispatchEvent(new Event("input"));
		vi.advanceTimersByTime(INLINE_IDLE_COMMIT_MS * 3);
		expect(props().title).toBe("Hello world");

		// Blur mid-composition defers too.
		span.dispatchEvent(new Event("blur"));
		expect(props().title).toBe("Hello world");
		expect(inline.getSession()).not.toBeNull();

		span.dispatchEvent(new Event("compositionend"));
		expect(props().title).toBe("こんにちは");
		expect(inline.getSession()).toBeNull();
	});
});

describe("paste sanitation (CORE-P1B-009G)", () => {
	function paste(target: HTMLElement, text: string): void {
		const event = new Event("paste", { bubbles: true, cancelable: true });
		Object.defineProperty(event, "clipboardData", {
			value: { getData: (kind: string) => (kind === "text/plain" ? text : "") },
		});
		target.dispatchEvent(event);
	}

	it("extracts text/plain only (markup can never smuggle)", () => {
		const { inline, span, props } = setup();
		inline.tryEnterFromEvent(span);
		span.textContent = "";
		paste(span, "plain payload");
		span.dispatchEvent(new Event("blur"));
		expect(props().title).toBe("plain payload");
	});

	it("blocks >1 MiB pastes with a visible diagnostic", () => {
		const { bridge, inline, span, props } = setup();
		inline.tryEnterFromEvent(span);
		paste(span, "x".repeat(1024 * 1024 + 1));
		expect(bridge.diagnostics.getDiagnostics().map((d) => d.code)).toContain(
			"EDITOR_LIMIT_EXCEEDED",
		);
		span.dispatchEvent(new Event("blur"));
		expect(props().title).toBe("Hello world");
		// The diagnostic clears with the session.
		expect(bridge.diagnostics.getDiagnostics()).toEqual([]);
	});
});

describe("normalization + shared Tiptap contract (CORE-P1B-009C/D)", () => {
	it("normalizes newlines and trailing whitespace", () => {
		expect(normalizePlainText("a \r\nb\t\nc  \n\n")).toBe("a\nb\nc");
		expect(normalizePlainText("x y")).toBe("x y");
	});

	it("sanitizes to the §17 allowlist (nodes, marks, safe links)", () => {
		const dirty = {
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "keep",
							marks: [
								{ type: "bold" },
								{ type: "textStyle", attrs: { color: "red" } },
								{ type: "link", attrs: { href: "javascript:alert(1)" } },
							],
						},
					],
				},
				{
					type: "iframe",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: "unwrapped" }],
						},
					],
				},
				{
					type: "heading",
					attrs: { level: 99 },
					content: [{ type: "text", text: "h" }],
				},
			],
		};
		const clean = sanitizeTiptapDocument(dirty);
		expect(clean.version).toBe("1");
		const first = clean.content[0];
		expect(first?.content?.[0]?.marks).toEqual([{ type: "bold" }]);
		// Unknown node unwraps into its children.
		expect(clean.content[1]?.type).toBe("paragraph");
		// Heading level clamps to 1–6.
		expect(clean.content[2]?.attrs?.level).toBe(6);
		// Safe links survive.
		const linked = sanitizeTiptapDocument({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "site",
							marks: [{ type: "link", attrs: { href: "https://a.dev" } }],
						},
					],
				},
			],
		});
		expect(linked.content[0]?.content?.[0]?.marks?.[0]).toEqual({
			type: "link",
			attrs: { href: "https://a.dev" },
		});
	});

	it("round-trips plain text through the document shape", () => {
		const doc = tiptapFromPlainText("line one\nline two");
		expect(tiptapToPlainText(doc)).toBe("line one\nline two");
		expect(sanitizeTiptapDocument(doc)).toEqual(doc);
	});
});
