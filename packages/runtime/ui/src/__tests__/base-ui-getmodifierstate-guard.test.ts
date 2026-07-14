import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression: base-ui's `isModifierKeySet()` in the Composite root calls
 * `event.getModifierState(key)` with no guard. Browser form autofill
 * (Chrome/Edge) dispatches a `keydown` lacking `getModifierState`, which
 * reaches Composite-backed components (Menu, Menubar, DropdownMenu,
 * NavigationMenu, Toggle…) and throws:
 *
 *   TypeError: e.getModifierState is not a function
 *
 * (cf. VSCode #205214, monaco-editor #4325, gitea #29414, vueuse #1440.)
 *
 * We ship a pnpm patch that guards the call:
 *   `typeof event.getModifierState === 'function' && event.getModifierState(key)`
 *
 * This test fails if the patch ever stops applying — e.g. a base-ui version
 * bump, or a lockfile regenerated without `patchedDependencies`. Both the
 * CJS and ESM builds must carry the guard, because Next.js / Rslib may load
 * either.
 */

const require = createRequire(import.meta.url);

const GUARD = "typeof event.getModifierState === 'function'";

// Both base-ui iterations the monorepo depends on. The legacy
// `@base-ui/react` is the
// renamed package used by packages/ui.
const PACKAGES = ["@base-ui/react"] as const;

function compositeRootFiles(pkg: string): string[] {
	// Resolve the installed package dir from this package's context.
	const pkgJson = require.resolve(`${pkg}/package.json`);
	const root = dirname(pkgJson);
	// 1.3.x / rc.0 layout: composite/root/...
	// 1.4.x layout:        internals/composite/root/...
	const rel = [
		"composite/root/useCompositeRoot.js",
		"esm/composite/root/useCompositeRoot.js",
		"internals/composite/root/useCompositeRoot.js",
		"esm/internals/composite/root/useCompositeRoot.js",
	];
	return rel.map((r) => join(root, r)).filter((f) => existsSync(f));
}

describe("base-ui getModifierState autofill guard (pnpm patch)", () => {
	for (const pkg of PACKAGES) {
		it(`${pkg}: every composite-root build carries the guard`, () => {
			const files = compositeRootFiles(pkg);
			// At least one build file must exist, or resolution changed.
			expect(files.length).toBeGreaterThan(0);
			for (const file of files) {
				const src = readFileSync(file, "utf8");
				// Sanity: this is the file with the modifier check.
				expect(src).toContain("isModifierKeySet");
				// The unguarded form must not survive.
				expect(src).not.toMatch(
					/[^&]\bif \(event\.getModifierState\(key\)\) \{/,
				);
				// The guard must be present.
				expect(src).toContain(GUARD);
			}
		});
	}
});
