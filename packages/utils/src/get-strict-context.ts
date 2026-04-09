import { createContext, useContext } from "react";
import type { Provider } from "react";

/**
 * Sentinel value used as the context's default. Any real consumer is
 * required to pass their own value via the provider — if `useContext`
 * returns this sentinel, we know the consumer is outside the provider
 * tree and can throw a helpful error.
 *
 * Using a unique symbol (rather than `null` or `undefined`) lets
 * `getStrictContext` support context values that are legitimately
 * nullable.
 */
const UNSET: unique symbol = Symbol("@anvilkit/utils/strict-context/unset");
type Unset = typeof UNSET;

/**
 * Creates a React context paired with a hook that throws a descriptive
 * error when used outside its provider. The returned tuple is designed
 * to be destructured into a single module, producing the common
 * `<FooProvider>` + `useFoo()` pattern with no repeated boilerplate.
 *
 * Why this exists instead of using `createContext` directly:
 *
 * - Missing-provider bugs are one of the most common React footguns
 *   and the default behavior (silently return the context default) is
 *   the worst possible outcome — consumers see `undefined` deep inside
 *   a component tree with no stack trace pointing at the real cause.
 * - Hand-rolling the throw-if-unset check on every context adds noise
 *   and gets forgotten. Centralizing it here makes it automatic.
 *
 * @param name - Identifier used in the missing-provider error message
 *   and as the context's `displayName` (visible in React DevTools).
 *   Typically matches the exported provider, e.g. `"StudioConfig"` →
 *   `<StudioConfigProvider>` + `useStudioConfig()`.
 * @returns A tuple `[Provider, useContext]` ready to be destructured.
 *
 * @example
 * const [StudioConfigProvider, useStudioConfig] =
 *   getStrictContext<StudioConfig>("StudioConfig");
 *
 * // Inside a component:
 * function SettingsPanel() {
 *   const config = useStudioConfig(); // throws if no provider above
 *   return <div>{config.apiKey}</div>;
 * }
 */
export function getStrictContext<T>(
	name: string,
): readonly [Provider<T>, () => T] {
	const context = createContext<T | Unset>(UNSET);
	context.displayName = name;

	function useStrictContext(): T {
		const value = useContext(context);
		if (value === UNSET) {
			throw new Error(
				`\`use${name}\` must be used within <${name}Provider>.`,
			);
		}
		return value;
	}

	return [context.Provider as unknown as Provider<T>, useStrictContext] as const;
}
