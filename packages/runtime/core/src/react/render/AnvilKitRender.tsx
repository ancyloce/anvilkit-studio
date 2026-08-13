/**
 * @file `AnvilKitRender` — the ONE public rendering wrapper (PLAN-0025
 * §9.1, P4-01).
 *
 * Production pages, the preview draft route, and export previews all
 * render a persisted Puck document through this component and nothing
 * else: it runs the unified appearance compiler
 * (`compileDocumentAppearance`) over the EXACT `Data` it hands to
 * Puck's `<Render>`, so the stylesheet and the DOM can never be
 * derived from different documents (§9.2 step 5). The editor iframe
 * injects the same compiler output through
 * `PuckIframeAppearanceBridge` — one algorithm, four consumers (§1
 * condition 3).
 *
 * RSC-safe by construction: no hooks, no browser APIs, no
 * `"use client"`. Importing `Render` from the bare `@puckeditor/core`
 * specifier lets the package's `react-server` export condition serve
 * the RSC build to server components and the DOM build everywhere
 * else — never import the `/rsc` subpath here, or client consumers
 * (preview panes, tests) would break.
 *
 * The `<style>` element mirrors the editor bridge's conventions:
 * `data-anvilkit-appearance` marks the single injection point parity
 * tooling asserts on, and the CSP `nonce` propagates per §7.4.
 */

import type { Config, Metadata, UserGenerics } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import type { ReactNode } from "react";
import type { AppearanceCompilerCache } from "../../style-compiler/cache.js";
import type { CompiledAppearance } from "../../style-compiler/compile.js";
import { compileDocumentAppearance } from "../../style-compiler/compile.js";
import { documentRootAttributes } from "../../style-compiler/document-root.js";

export interface AnvilKitRenderProps<
	UserConfig extends Config = Config,
	G extends UserGenerics<UserConfig> = UserGenerics<UserConfig>,
> {
	/** The same `Config` the editor mounts — never a decorated copy. */
	readonly config: UserConfig;
	/**
	 * The document to render. When bindings/data sources apply, this
	 * must already be the RESOLVED document (§9.2 step 5): the compiler
	 * and `<Render>` both receive exactly this value.
	 */
	readonly data: G["UserData"];
	/** CSP nonce propagated onto the appearance `<style>` (§7.4). */
	readonly nonce?: string;
	/** Token mode; defaults to the design system's `defaultTokenMode`. */
	readonly tokenMode?: string;
	/** Puck `<Render>` metadata passthrough. */
	readonly metadata?: Metadata;
	/**
	 * Optional §7.5 compiler cache. Output-transparent: caching never
	 * changes CSS.
	 *
	 * Entries validate by object IDENTITY, so this only pays off where
	 * the same document object is compiled repeatedly — i.e. the editor.
	 * A server that deserializes a document per request can never hit it
	 * (review 0036 M-8), so do not reach for a module-level instance
	 * there; prefer {@link AnvilKitRenderProps.compiled}.
	 */
	readonly cache?: AppearanceCompilerCache;
	/**
	 * A pre-compiled appearance, from `compileDocumentAppearance()`.
	 *
	 * **The preferred way to use this component.** Compiling outside
	 * React keeps the render pure: nothing is computed, cached or
	 * reported during it, and the caller owns caching, diagnostics and
	 * logging — including whether any of that happens at all.
	 *
	 * It MUST be the compilation of exactly the `data` passed here, or
	 * the stylesheet and the DOM will describe different documents
	 * (§9.2 step 5).
	 */
	readonly compiled?: CompiledAppearance;
	/**
	 * Observability seam (§9.2 step 6): receives the full compilation
	 * result, diagnostics included. When omitted, non-empty diagnostics
	 * are surfaced through `console.warn` — the live path may not
	 * silently discard them (§7.4).
	 *
	 * @deprecated Pass {@link AnvilKitRenderProps.compiled} instead and
	 * inspect the result directly. This component is deliberately
	 * hook-free so it stays RSC-safe, which means there is no effect to
	 * defer this callback into: on the internal-compile path it is
	 * invoked **during render**, so React may call it more than once per
	 * commit (StrictMode) or for a render it then discards (concurrent
	 * rendering). It must therefore be idempotent and free of side
	 * effects — a constraint the `compiled` prop removes entirely
	 * (review 0036 M-7).
	 */
	readonly onCompiled?: (compiled: CompiledAppearance) => void;
}

/**
 * Render a Puck document with its compiled appearance stylesheet.
 *
 * The wrapper `<div data-ak-document>` carries the active token mode
 * so exports and parity tooling can key off one stable page root; the
 * embedded `<style data-anvilkit-appearance>` is the document's ONLY
 * appearance injection point.
 *
 * Both attributes come from the shared `documentRootAttributes` so the
 * editor canvas marks its own root identically (review 0036 L-6) — the
 * carrier differs per consumer, the vocabulary does not.
 */
export function AnvilKitRender<
	UserConfig extends Config = Config,
	G extends UserGenerics<UserConfig> = UserGenerics<UserConfig>,
>({
	config,
	data,
	nonce,
	tokenMode,
	metadata,
	cache,
	compiled: precompiled,
	onCompiled,
}: AnvilKitRenderProps<UserConfig, G>): ReactNode {
	// The clean path: the caller compiled outside React, so this render
	// computes nothing, mutates no cache, and reports to no one
	// (review 0036 M-7).
	const compiled =
		precompiled ??
		compileDocumentAppearance({ data, config, tokenMode, cache });
	if (precompiled === undefined) {
		// Legacy internal-compile path. Both branches below are side
		// effects in render — see the `onCompiled` deprecation note.
		if (onCompiled !== undefined) {
			onCompiled(compiled);
		} else if (compiled.diagnostics.length > 0) {
			console.warn(
				`[anvilkit] appearance compiler reported ${compiled.diagnostics.length} diagnostic(s) for the rendered document`,
				compiled.diagnostics,
			);
		}
	}
	return (
		<div {...documentRootAttributes(compiled)}>
			<style
				nonce={nonce}
				data-anvilkit-appearance=""
				// biome-ignore lint/security/noDangerouslySetInnerHtml: the CSS comes exclusively from the pure compiler, whose serializer escapes selectors and admits property names only from the schema (§7.4) — never from user-supplied strings.
				dangerouslySetInnerHTML={{ __html: compiled.css }}
			/>
			<Render config={config} data={data} metadata={metadata} />
		</div>
	);
}
