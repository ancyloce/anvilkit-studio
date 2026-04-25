/**
 * Node ESM resolve/load hook that turns every `*.css` import into an
 * empty module. Used by the bench harness when importing built
 * component packages (`@anvilkit/<slug>/dist/styles.css`) that are
 * normally injected by the bundler. Node's native ESM loader rejects
 * `.css` extensions with `ERR_UNKNOWN_FILE_EXTENSION`; this shim
 * resolves them to `data:text/javascript` exporting nothing.
 *
 * Registered from `bench/bench-env.mjs`.
 */

export async function resolve(specifier, context, nextResolve) {
	if (specifier.endsWith(".css") || /\.css\?[^/]*$/.test(specifier)) {
		return {
			shortCircuit: true,
			url: `data:text/javascript,export%20default%20null%3B`,
			format: "module",
		};
	}
	return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
	if (url.startsWith("file://") && url.endsWith(".css")) {
		return {
			format: "module",
			source: "export default null;",
			shortCircuit: true,
		};
	}
	return nextLoad(url, context);
}
