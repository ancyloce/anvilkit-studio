/**
 * @file Public barrel for `@anvilkit/core/templates` (task
 * `phase5-016`).
 *
 * The `templates` subpath ships the {@link AnvilkitTemplate} contract
 * — the shape every first-party and third-party template package
 * exports as its default. First-party seeds ship under
 * `@anvilkit/template-<slug>` (see `phase5-017`); a downstream CLI
 * (`anvilkit init --template <slug>`) consumes the same type.
 *
 * ### Scope
 *
 * Purely additive to the Core public surface. No new peer deps, no
 * new runtime barrels — the only runtime export is the lightweight
 * {@link isAnvilkitTemplate} structural guard. The main
 * `@anvilkit/core` bundle is unchanged; importing `templates` is an
 * opt-in subpath.
 *
 * @see {@link file://./../../../../docs/tasks/phase5-016-template-contract.md | phase5-016}
 * @see {@link file://./../../../../docs/decisions/003-core-templates-subpath.md | ADR 003}
 */

import type { PageIR } from "../types/ir.js";

/**
 * A static preview image for a template — produced once per template
 * by the Playwright capture pipeline (`phase5-017`). Consumed by the
 * docs catalog and CLI picker to render a thumbnail before the
 * template's full IR is loaded.
 *
 * Dimensions are carried alongside the URL so catalog layouts can
 * reserve space without a network round-trip, and `alt` is required
 * (not optional) so every catalog card has accessible text by
 * default.
 */
export interface AnvilkitTemplatePreview {
	/**
	 * Absolute or package-relative URL to the preview image. Templates
	 * typically ship a `preview.png` adjacent to their `package.json`
	 * and set `src` to `"./preview.png"`; the docs-site generator
	 * rewrites this to a CDN URL at build time.
	 */
	readonly src: string;
	/** Intrinsic width of the preview in pixels. */
	readonly width: number;
	/** Intrinsic height of the preview in pixels. */
	readonly height: number;
	/**
	 * Non-empty alternative text describing the preview. Required — a
	 * template that ships a preview must also ship accessible text.
	 */
	readonly alt: string;
}

/**
 * A single entry in a template's `packages` manifest — the name and
 * version of a component package the template's {@link PageIR}
 * depends on.
 *
 * Templates enumerate their package graph explicitly (rather than
 * deriving it from `pageIR`) so a docs catalog can list dependencies
 * without walking the tree and so a future installer can resolve a
 * lockfile from the manifest alone.
 */
export interface AnvilkitTemplatePackage {
	/** npm package name, e.g. `"@anvilkit/hero"`. */
	readonly name: string;
	/** Semver range or exact version, e.g. `"^1.0.0"`. */
	readonly version: string;
}

/**
 * The metadata half of a template — everything a catalog listing
 * needs to render a card, without loading the full {@link PageIR}.
 *
 * Split out from {@link AnvilkitTemplate} so downstream UIs can type
 * a lightweight listing (e.g. `AnvilkitTemplateManifest[]`) without
 * materializing every template's tree. The docs-site catalog route
 * (`phase5-018`) ships this shape in its static catalog JSON.
 */
export interface AnvilkitTemplateManifest {
	/**
	 * Stable URL-safe identifier. Lowercase, hyphen-separated. Used by
	 * the CLI (`--template <slug>`) and by the docs route
	 * (`/templates/<slug>`).
	 */
	readonly slug: string;
	/** Human-readable display name, e.g. `"Landing — SaaS"`. */
	readonly name: string;
	/**
	 * One-sentence description surfaced in the catalog card and the
	 * CLI picker. Should read as a prose sentence ending in a period.
	 */
	readonly description: string;
	/** Static thumbnail — see {@link AnvilkitTemplatePreview}. */
	readonly preview: AnvilkitTemplatePreview;
	/**
	 * Component packages the template depends on, in a deterministic
	 * order (alphabetical by package name is the convention first-
	 * party seeds follow). Consumers must treat this list as closed —
	 * a template may not reference components outside the listed set.
	 */
	readonly packages: ReadonlyArray<AnvilkitTemplatePackage>;
}

/**
 * A first-party or third-party Anvilkit template — a
 * {@link AnvilkitTemplateManifest} plus the full
 * {@link PageIR} tree that composes it.
 *
 * Shipped as the default export of a `@anvilkit/template-<slug>`
 * package. The CLI `anvilkit init --template <slug>` resolves this
 * object, writes the IR to the scaffolded project, and installs the
 * packages listed in {@link AnvilkitTemplateManifest.packages}.
 */
export interface AnvilkitTemplate extends AnvilkitTemplateManifest {
	/**
	 * The template's page tree. Must validate against the component
	 * schemas of every package listed in {@link packages} — first-
	 * party templates enforce this in CI via
	 * `validateAiOutput(pageIR, availableComponents)` (see
	 * `phase5-017` acceptance criteria).
	 */
	readonly pageIR: PageIR;
}

/**
 * Structural type guard for {@link AnvilkitTemplate}.
 *
 * Deliberately shallow: it verifies the top-level keys that matter
 * for the docs catalog and CLI pickers (slug / name / description /
 * preview / packages / pageIR.version) and does **not** re-validate
 * the component tree. Deep validation is the validator package's
 * job (`@anvilkit/validator`), run once per template at build time
 * in CI.
 *
 * @param value - Any value, typically the default export of a
 *   third-party `@anvilkit/template-*` package.
 * @returns `true` iff `value` is an object that conforms to the
 *   surface-level {@link AnvilkitTemplate} contract.
 */
export function isAnvilkitTemplate(value: unknown): value is AnvilkitTemplate {
	if (value === null || typeof value !== "object") {
		return false;
	}
	const t = value as Record<string, unknown>;
	if (
		typeof t.slug !== "string" ||
		typeof t.name !== "string" ||
		typeof t.description !== "string"
	) {
		return false;
	}
	const preview = t.preview;
	if (preview === null || typeof preview !== "object") {
		return false;
	}
	const p = preview as Record<string, unknown>;
	if (
		typeof p.src !== "string" ||
		typeof p.width !== "number" ||
		typeof p.height !== "number" ||
		typeof p.alt !== "string"
	) {
		return false;
	}
	if (!Array.isArray(t.packages)) {
		return false;
	}
	for (const pkg of t.packages) {
		if (pkg === null || typeof pkg !== "object") {
			return false;
		}
		const entry = pkg as Record<string, unknown>;
		if (typeof entry.name !== "string" || typeof entry.version !== "string") {
			return false;
		}
	}
	const pageIR = t.pageIR;
	if (pageIR === null || typeof pageIR !== "object") {
		return false;
	}
	const ir = pageIR as Record<string, unknown>;
	if (ir.version !== "1" || ir.root === null || typeof ir.root !== "object") {
		return false;
	}
	return true;
}
