/**
 * @file Shared dev-environment gate for the store `devtools` middleware.
 *
 * Each store wraps its `persist` middleware in zustand `devtools` so the
 * Redux DevTools extension can inspect/time-travel store actions in
 * development. The wrapper is inert when {@link devtoolsEnabled} is `false`
 * (production, SSR, or any environment without the extension), so the only
 * cost shipped to consumers is the (small) middleware wrapper itself.
 */

/**
 * `NODE_ENV` via `globalThis` — mirrors `config/env-parser` and
 * `plugin-fingerprint` (core's tsconfig has no `@types/node` in `types`, so
 * the bare `process` identifier is untyped). Absent ⇒ `undefined` ⇒ treated
 * as non-production.
 */
function nodeEnv(): string | undefined {
	return (
		globalThis as unknown as { process?: { env?: Record<string, string> } }
	).process?.env?.NODE_ENV;
}

/**
 * Gate the zustand `devtools` middleware so it is active only outside
 * production. Passed as the middleware's `enabled` option, so the DevTools
 * connection is never opened on the server or in a production bundle.
 */
export function devtoolsEnabled(): boolean {
	return nodeEnv() !== "production";
}
