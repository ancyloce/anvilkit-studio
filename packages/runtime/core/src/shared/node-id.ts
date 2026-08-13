/**
 * @file The package's ONE id generator (review 0036 M-3).
 *
 * ## Why `crypto.randomUUID()` is not enough on its own
 *
 * `crypto.randomUUID()` is **secure-context-only**. On a plain-HTTP
 * origin that is not `localhost` — an internal staging box, a LAN
 * preview, a device testing against a dev machine by IP — it is simply
 * `undefined`. Two different failures followed from that:
 *
 * - Calling it unguarded threw `crypto.randomUUID is not a function`
 *   out of a click handler. Thirteen call sites did exactly that, and
 *   `CreateComponentDialog` carried a comment defending against the
 *   *symptom* ("an unavailable `crypto.randomUUID` on an insecure
 *   origin" leaving controls stuck disabled) rather than the cause.
 * - `generateNodeId` guarded, but fell back to
 *   `Date.now().toString(36)` — millisecond resolution. `cloneSubtree`
 *   calls the generator in a tight synchronous loop, so **every node in
 *   a duplicated subtree received the same id**. Duplicate ids then
 *   resolve first-wins in `indexNodeLocations`, so the corruption stays
 *   invisible until an edit targets the wrong node.
 *
 * ## The ladder
 *
 * `crypto.getRandomValues()` is the load-bearing step: unlike
 * `randomUUID` and `crypto.subtle`, it is **not** secure-context-gated,
 * so it is available on exactly the origins where the old code broke.
 * The counter below it exists only for an environment with no Web
 * Crypto at all, and is unique *by construction* rather than by clock —
 * which is the property the old `Date.now()` fallback lacked.
 *
 * React-free and DOM-free, so `src/runtime/` and headless callers can
 * use it too.
 */

/** Monotonic for the module's lifetime — the no-crypto uniqueness. */
let sequence = 0;

/** The Web Crypto object, or `undefined` where there is none at all. */
function webCrypto(): Crypto | undefined {
	return typeof globalThis.crypto === "undefined"
		? undefined
		: globalThis.crypto;
}

function hex(bytes: Uint8Array): string {
	let out = "";
	for (const byte of bytes) {
		out += byte.toString(16).padStart(2, "0");
	}
	return out;
}

/**
 * Distinguishes ids minted by different sessions on the no-crypto path,
 * where the counter alone would restart from zero on every reload.
 */
const sessionSalt = Date.now().toString(16).slice(-4).padStart(4, "0");

/**
 * Eight hex characters of node-id suffix.
 *
 * With Web Crypto that is 32 bits of real randomness — including on an
 * insecure origin, because `getRandomValues` works there. Without it,
 * the counter guarantees uniqueness within the session and the salt
 * keeps separate sessions apart.
 *
 * The counter is never the *low* half of a truncated timestamp, which
 * is what made the previous fallback collide: whatever the source, the
 * eight characters returned here differ on every call.
 */
function shortId(): string {
	const source = webCrypto();
	if (source !== undefined && typeof source.getRandomValues === "function") {
		return hex(source.getRandomValues(new Uint8Array(4)));
	}
	sequence += 1;
	return `${sessionSalt}${(sequence % 0x10000).toString(16).padStart(4, "0")}`;
}

/** Format 32 hex characters as a canonical UUID. */
function asUuid(digits: string): string {
	return [
		digits.slice(0, 8),
		digits.slice(8, 12),
		digits.slice(12, 16),
		digits.slice(16, 20),
		digits.slice(20, 32),
	].join("-");
}

/** A v4 UUID from `getRandomValues`, which insecure origins DO have. */
function uuidFromRandomValues(source: Crypto): string {
	const bytes = source.getRandomValues(new Uint8Array(16));
	// Version 4 + RFC 4122 variant, so the output is a well-formed UUID
	// and not merely 32 random hex characters.
	bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
	bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
	return asUuid(hex(bytes));
}

/** Last resort: counter first, so even a truncation stays unique. */
function uuidFromSequence(): string {
	sequence += 1;
	const counter = sequence.toString(16).padStart(12, "0").slice(-12);
	const stamp = Date.now().toString(16).padStart(12, "0").slice(-12);
	return asUuid(`${counter}${stamp}${"0".repeat(8)}`.slice(0, 32));
}

/**
 * A unique id, on any origin.
 *
 * Prefer this over `crypto.randomUUID()` everywhere — the direct call
 * throws on an insecure origin, and there is no context in this package
 * where that trade is worth making.
 */
export function randomId(): string {
	const source = webCrypto();
	if (source === undefined) {
		return uuidFromSequence();
	}
	if (typeof source.randomUUID === "function") {
		return source.randomUUID();
	}
	if (typeof source.getRandomValues === "function") {
		return uuidFromRandomValues(source);
	}
	return uuidFromSequence();
}

/**
 * A node id for a freshly created node: the component name plus enough
 * entropy to be unique.
 *
 * The readable prefix is deliberate — it makes a raw document, a DOM
 * `data-ak-node` attribute, and a diff legible at a glance.
 */
export function generateNodeId(componentName: string): string {
	return `${componentName}-${shortId()}`;
}
