/**
 * @file The running version of `@anvilkit/core`.
 *
 * Hand-maintained to match the `version` field of
 * `packages/core/package.json`. A colocated test asserts the two stay
 * in sync, so any drift is caught at `pnpm test` time rather than at
 * plugin-load time in a downstream host.
 *
 * This constant is the reference value `compilePlugins()` uses to
 * validate every {@link StudioPluginMeta.coreVersion} declaration at
 * compile time. See `runtime/compile-plugins.ts` for the range check.
 *
 * ### Why hand-maintained instead of generated?
 *
 * Rslib's bundleless build preserves a 1:1 `src → dist` mapping, and
 * wiring a codegen step to stamp `package.json`'s version into this
 * file would add build-order complexity for a single string. The test
 * in `version.test.ts` is the forcing function that keeps the two in
 * sync, which is simpler and equally robust.
 */
export const CORE_VERSION = "0.1.0-alpha.0";
