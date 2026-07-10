/**
 * Asserts that `condition` is truthy, throwing an `Error` with the
 * given `message` otherwise. Because the return type is
 * `asserts condition`, TypeScript narrows `condition` for the caller
 * on the success path — no `if`/`throw` boilerplate required.
 *
 * Use this at boundaries where a `"this should never happen"`
 * invariant must hold (e.g. the plugin engine receiving a compiled
 * runtime that claims a plugin exists by id). Do **not** use it for
 * user-facing validation — reach for `@anvilkit/validator` for that.
 *
 * @param condition - Any value; falsy throws.
 * @param message - The error message. Should describe the invariant
 *   that was violated, not the literal failure mode.
 *
 * @example
 * function getPlugin(id: string) {
 *   const plugin = registry.get(id);
 *   invariant(plugin, `Plugin "${id}" is not registered`);
 *   // TS now knows `plugin` is not undefined.
 *   return plugin;
 * }
 */
export function invariant(
	condition: unknown,
	message: string,
): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}
