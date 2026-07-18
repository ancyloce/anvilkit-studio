// Companion to the typescript overrides in pnpm-workspace.yaml — see the
// comment above the scoped `*>typescript` overrides there for the full story.
//
// madge's TS parser chain (detective-typescript ->
// @typescript-eslint/typescript-estree) declares typescript as a PEER
// dependency. The workspace-wide `typescript: 7.0.2` override rewrites peer
// ranges and pnpm resolves peers from the dependent context, so both packages
// get the native tsgo typescript@7, which no longer exposes the JS compiler
// API they require at module load (`ts.Extension`, `ts.createCompilerHost`,
// ...). That crashes every `check:circular` and the root `pnpm madge` gate
// with "Cannot read properties of undefined (reading 'Cjs')".
//
// Scoped overrides cannot carve a peer out of a bare override (the bare pin
// still wins peer resolution), but they DO win for regular dependencies when
// listed before the bare pin. So: convert the typescript peer of exactly
// these two packages into a regular dependency here, and let the scoped
// `detective-typescript>typescript` / `@typescript-eslint/typescript-estree>
// typescript` overrides in pnpm-workspace.yaml pin it to 6.0.3 — the
// `@typescript/old` JS-based compiler that typescript@7.0.2 itself depends
// on, so no new compiler enters the graph.
// typedoc (api-snapshot + docs generators) is in the same boat: peer range
// `5.0.x ... 6.0.x`, old-API consumer (`ts.SyntaxKind` at import time), so
// under the 7.0.2 pin it crashes with "Cannot read properties of undefined
// (reading 'PropertyDeclaration')". Same conversion; still a single
// typedoc + typescript pair, which is what the `typedoc: 0.28.19` pin in
// pnpm-workspace.yaml exists to guarantee.
const OLD_TS_API_CONSUMERS = new Set([
	"detective-typescript",
	"@typescript-eslint/typescript-estree",
	"typedoc",
]);

function readPackage(pkg) {
	if (OLD_TS_API_CONSUMERS.has(pkg.name)) {
		if (pkg.peerDependencies) {
			delete pkg.peerDependencies.typescript;
		}
		pkg.dependencies = { ...pkg.dependencies, typescript: "6.0.3" };
	}
	return pkg;
}

module.exports = { hooks: { readPackage } };
