"use client";

/**
 * @file `decoratePuckConfig` — capability-driven config decoration
 * (PLAN-0020 CORE-P0-011; DD-0019 §8; DD-DEC-015/-016; §7.2
 * invariant 11).
 *
 * Reads `metadata.editor` per component and wraps renders for
 * declared style targets. **Memoization is correctness-critical, not
 * an optimization**: Puck resets its app store whenever the config
 * identity changes, so the decorated config must be identity-stable
 * across renders — cached by input identity (WeakMap) with a
 * fingerprint fallback (via the existing `createConfigFingerprinter`
 * infrastructure) for hosts that recreate a content-identical config
 * object each render.
 *
 * Legacy rules (§8): absent metadata ≡ `styleTarget: "none"` — the
 * component, its fields, slots, drawer behavior, and preview are
 * untouched; Core never guesses a component root or adds wrappers
 * globally. `enableAuthoring: false` (and therefore `chrome="puck"`,
 * which never enables it) returns the input config **by reference**.
 */

import type { EditorCapabilityMetadata } from "@anvilkit/contracts/editor";
import { ANVILKIT_AUTHORING_KEY } from "@anvilkit/contracts/editor";
import type { Config as PuckConfig } from "@puckeditor/core";
import { createElement, type ReactNode, useContext } from "react";
import { EditorInvariantError } from "../../editor/diagnostics.js";
import { createConfigFingerprinter } from "../components/plugin-fingerprint.js";
import { AuthoringBoundary } from "./AuthoringBoundary.js";
import type { ResolvedAuthoringStyle } from "../../editor/style/resolve-authoring-style.js";
import { AuthoringStyleContext } from "./authoring-style-context.js";
import {
	BindingRenderContext,
	BindingRenderProvider,
} from "./bindings/render-context.js";

/** Options for {@link decoratePuckConfig} (DD-0019 §8, verbatim). */
export interface DecoratePuckConfigOptions {
	readonly enableAuthoring: boolean;
	readonly onUnsupportedCapability?: (
		componentType: string,
		capability: keyof EditorCapabilityMetadata["capabilities"],
	) => void;
}

/**
 * Read and structurally validate a component config's
 * `metadata.editor` declaration (DD-0019 §8). Shared by config
 * decoration and the capability registry so both apply the same
 * legacy rules: malformed or absent metadata reads as `undefined`
 * (≡ `styleTarget: "none"`).
 */
export function readEditorMetadata(
	component: unknown,
): EditorCapabilityMetadata | undefined {
	const metadata = (
		component as { metadata?: { editor?: unknown } } | undefined
	)?.metadata?.editor;
	if (
		typeof metadata !== "object" ||
		metadata === null ||
		(metadata as { version?: unknown }).version !== "1"
	) {
		return undefined;
	}
	const styleTarget = (metadata as { styleTarget?: unknown }).styleTarget;
	if (
		styleTarget !== "root" &&
		styleTarget !== "wrapper" &&
		styleTarget !== "none"
	) {
		return undefined;
	}
	return metadata as EditorCapabilityMetadata;
}

type AnyRender = (props: Record<string, unknown>) => ReactNode;

/**
 * Build the stable decorated render for one component type. Created
 * once per decoration (identity-cached), so React sees a stable
 * component and existing error boundaries keep working.
 */
function createDecoratedRender(
	original: AnyRender,
	styleTarget: "root" | "wrapper",
): AnyRender {
	function EditorDecoratedRender(props: Record<string, unknown>): ReactNode {
		const lookup = useContext(AuthoringStyleContext);
		const bindingLookup = useContext(BindingRenderContext);
		const nodeId = typeof props.id === "string" ? props.id : undefined;
		const resolved =
			lookup !== null && nodeId !== undefined ? lookup(nodeId) : undefined;
		const binding =
			bindingLookup !== null && nodeId !== undefined
				? bindingLookup.lookup(nodeId)
				: null;

		// A visibility binding removes the node only where the author is
		// not editing it (§19). Design mode keeps it selectable and marks
		// it instead — a node you cannot select is one you cannot repair.
		if (binding !== null && binding.hiddenInPreview && binding.previewMode) {
			return null;
		}

		// A repeat binding renders the node once per record. Each row gets
		// its own scope carrying `item`/`index`, so bindings *inside* the
		// row read their own record rather than the whole collection.
		// Render contexts only — no durable Puck nodes are created (§19).
		if (
			binding?.repeat != null &&
			bindingLookup !== null &&
			nodeId !== undefined
		) {
			return binding.repeat.map((context) =>
				createElement(
					BindingRenderProvider,
					{
						key: context.key,
						bindings: bindingLookup.bindings,
						preview: bindingLookup.preview,
						scope: {
							...bindingLookup.scope,
							item: context.item,
							index: context.index,
						},
						children: renderNode(original, props, styleTarget, resolved),
					},
				),
			);
		}
		return renderNode(original, props, styleTarget, resolved);
	}
	return EditorDecoratedRender as AnyRender;
}

/**
 * The unconditional render for one node — shared by the plain path and
 * by each repeated row, so a repeat cannot drift from normal rendering.
 */
function renderNode(
	original: AnyRender,
	props: Record<string, unknown>,
	styleTarget: "root" | "wrapper",
	resolved: ResolvedAuthoringStyle | undefined,
): ReactNode {
	if (styleTarget === "wrapper") {
		return createElement(AuthoringBoundary, { resolved }, original(props));
	}
	if (resolved === undefined) {
		// No editor mounted (or nothing authored): identical render.
		return original(props);
	}
	return original({
		...props,
		editorStyle: resolved.inlineStyle,
		editorClassName:
			resolved.classNames.length > 0
				? resolved.classNames.join(" ")
				: undefined,
		editorDataAttributes: resolved.dataAttributes,
	});
}

interface DecorationCacheEntry {
	readonly fingerprint: string;
	readonly decorated: PuckConfig;
}

const byIdentity = new WeakMap<object, DecorationCacheEntry>();
let lastFingerprint: string | null = null;
let lastDecorated: PuckConfig | null = null;
const fingerprintConfig = createConfigFingerprinter();

function assertNoSidecarSlotCollision(config: PuckConfig): void {
	const rootFields = (
		config as {
			root?: { fields?: Record<string, { type?: unknown } | undefined> };
		}
	).root?.fields;
	const collision = rootFields?.[ANVILKIT_AUTHORING_KEY];
	if (collision !== undefined && collision?.type === "slot") {
		// Invariant 11 (§7.2): Puck's field walker zone-processes nested
		// objects under slot-field names, so a colliding slot field would
		// corrupt the sidecar. Always fail fast — this is a config bug.
		throw new EditorInvariantError(
			`the root config must not define a slot field named "${ANVILKIT_AUTHORING_KEY}" — it would corrupt the authoring sidecar (invariant 11)`,
		);
	}
}

/**
 * Decorate a Puck config for authoring (DD-0019 §8, verbatim
 * signature). Immutable: the input config is never modified; the
 * decorated copy shares every untouched member by reference and
 * preserves the caller's generic config type.
 */
export function decoratePuckConfig<UserConfig extends PuckConfig>(
	config: UserConfig,
	options: DecoratePuckConfigOptions,
): UserConfig {
	if (!options.enableAuthoring) {
		return config;
	}
	assertNoSidecarSlotCollision(config);

	const identityHit = byIdentity.get(config);
	if (identityHit !== undefined) {
		return identityHit.decorated as UserConfig;
	}
	const fingerprint = fingerprintConfig(config);
	if (lastFingerprint === fingerprint && lastDecorated !== null) {
		// Content-identical config recreated by the host: reuse the prior
		// decorated identity so Puck's app store is not reset.
		byIdentity.set(config, { fingerprint, decorated: lastDecorated });
		return lastDecorated as UserConfig;
	}

	const components: Record<string, unknown> = {};
	let touched = 0;
	for (const [type, component] of Object.entries(
		(config as { components?: Record<string, unknown> }).components ?? {},
	)) {
		const metadata = readEditorMetadata(component);
		if (metadata === undefined || metadata.styleTarget === "none") {
			components[type] = component;
			continue;
		}
		const original = (component as { render?: AnyRender }).render;
		if (typeof original !== "function") {
			components[type] = component;
			continue;
		}
		components[type] = {
			...(component as object),
			render: createDecoratedRender(original, metadata.styleTarget),
		};
		touched += 1;
	}

	const decorated =
		touched === 0
			? config
			: ({ ...(config as object), components } as UserConfig);
	byIdentity.set(config, { fingerprint, decorated });
	lastFingerprint = fingerprint;
	lastDecorated = decorated;
	return decorated;
}
