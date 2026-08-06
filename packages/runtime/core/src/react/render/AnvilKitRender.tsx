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
	 * Optional §7.5 compiler cache (e.g. a module-level instance in a
	 * server route). Output-transparent: caching never changes CSS.
	 */
	readonly cache?: AppearanceCompilerCache;
	/**
	 * Observability seam (§9.2 step 6): receives the full compilation
	 * result, diagnostics included. When omitted, non-empty diagnostics
	 * are surfaced through `console.warn` — the live path may not
	 * silently discard them (§7.4).
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
	onCompiled,
}: AnvilKitRenderProps<UserConfig, G>): ReactNode {
	const compiled = compileDocumentAppearance({
		data,
		config,
		tokenMode,
		cache,
	});
	if (onCompiled !== undefined) {
		onCompiled(compiled);
	} else if (compiled.diagnostics.length > 0) {
		console.warn(
			`[anvilkit] appearance compiler reported ${compiled.diagnostics.length} diagnostic(s) for the rendered document`,
			compiled.diagnostics,
		);
	}
	return (
		<div data-ak-document="" data-ak-token-mode={tokenMode ?? "default"}>
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
