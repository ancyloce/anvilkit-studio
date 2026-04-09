/**
 * Generates a collision-resistant identifier.
 *
 * Prefers `crypto.randomUUID()` (RFC 4122 v4, cryptographically strong,
 * available in all modern browsers and Node.js ≥ 16.7) and falls back
 * to a `Math.random()`-based v4-shaped string for legacy environments
 * such as JSDOM < 16 or locked-down sandboxes without Web Crypto.
 *
 * @param prefix - Optional namespace segment joined with a `-`. Use this
 *   to label IDs by origin (e.g. `"plugin"`, `"node"`) so they are easy
 *   to spot in logs and React DevTools.
 * @returns A unique string of the form `"<prefix>-<uuid>"` or just the
 *   bare UUID when no prefix is given.
 *
 * @example
 * generateId();           // "0192ac5e-a9b3-7ce0-b4a9-9f4f8a4f5d2b"
 * generateId("plugin");   // "plugin-0192ac5e-a9b3-7ce0-b4a9-9f4f8a4f5d2b"
 */
export function generateId(prefix?: string): string {
	const uuid =
		typeof globalThis.crypto !== "undefined" &&
		typeof globalThis.crypto.randomUUID === "function"
			? globalThis.crypto.randomUUID()
			: fallbackUuid();
	return prefix ? `${prefix}-${uuid}` : uuid;
}

/**
 * RFC 4122 v4-shaped fallback used only when `crypto.randomUUID` is
 * unavailable. Not cryptographically secure — do not rely on it for
 * auth tokens or similar.
 */
function fallbackUuid(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
		const rand = Math.floor(Math.random() * 16);
		const value = char === "x" ? rand : (rand & 0x3) | 0x8;
		return value.toString(16);
	});
}
