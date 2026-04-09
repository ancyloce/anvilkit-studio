// biome-ignore lint/suspicious/noExplicitAny: debounce accepts any function signature; `unknown[]` breaks Parameters<T>
type AnyFunction = (...args: any[]) => any;

/**
 * A debounced wrapper around a function, augmented with a `.cancel()`
 * method that discards any pending invocation.
 */
export type DebouncedFunction<T extends AnyFunction> = T & {
	/**
	 * Cancels any pending invocation. Calling `cancel()` on an idle
	 * debounced function is a no-op.
	 */
	cancel: () => void;
};

/**
 * Returns a debounced version of `fn` that delays invocation until
 * `wait` milliseconds have elapsed since the last call. If the returned
 * function is called again within the window, the timer resets. Calling
 * `.cancel()` drops any pending invocation without firing `fn`.
 *
 * The returned function always resolves to `undefined` synchronously —
 * the real return value of `fn` is dropped because it is deferred. The
 * type-level `T &` intersection exists so callers retain the original
 * parameter tuple; it does **not** imply the return value is preserved.
 *
 * @param fn - The function to debounce.
 * @param wait - Idle period in milliseconds before `fn` fires.
 * @returns A debounced function with a `.cancel()` method.
 *
 * @example
 * const save = debounce((data: FormData) => api.save(data), 300);
 * save(formA); // pending
 * save(formB); // resets timer, formA is dropped
 * // 300ms later → api.save(formB) fires.
 * save.cancel(); // drops formB if still pending.
 */
export function debounce<T extends AnyFunction>(
	fn: T,
	wait: number,
): DebouncedFunction<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const debounced = ((...args: Parameters<T>): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = undefined;
			fn(...args);
		}, wait);
	}) as DebouncedFunction<T>;

	debounced.cancel = (): void => {
		if (timer !== undefined) {
			clearTimeout(timer);
			timer = undefined;
		}
	};

	return debounced;
}
