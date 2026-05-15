/**
 * @file Position heuristic: map the rendered text/image element under the
 * drop point back to the exact prop (top-level or array/object nested
 * path) on the Puck node whose value produced it — so a drop replaces
 * the *corresponding* text/image, not a heuristically-guessed prop.
 *
 * No per-component DOM markers exist, so the mapping is by value:
 * read the rendered element's text / image URL, then find the prop
 * whose string value matches. Inherent limits (empty or duplicated
 * values can't be disambiguated by value) are handled by the caller
 * falling back to the candidate-prop resolver.
 *
 * DOM scans are geometry-based (rect contains the point, smallest area
 * wins) so they see past Puck's body-level overlay portal — the same
 * reason component resolution uses geometry.
 */

export type PropPath = readonly (string | number)[];

interface StringEntry {
	readonly path: PropPath;
	readonly value: string;
}

function normalizeWhitespace(s: string): string {
	return s.replace(/\s+/g, " ").trim();
}

/** Strip query/hash, decode; return "" on failure. */
export function normalizeUrl(u: string): string {
	const cut = u.split(/[?#]/)[0] ?? u;
	try {
		return decodeURIComponent(cut).trim();
	} catch {
		return cut.trim();
	}
}

function basename(u: string): string {
	const parts = normalizeUrl(u).split("/");
	return (parts[parts.length - 1] ?? "").toLowerCase();
}

const IMAGE_URL_RE = /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i;

export function looksLikeImageUrl(s: string): boolean {
	if (s === "") return false;
	if (/^data:image\//i.test(s)) return true;
	return IMAGE_URL_RE.test(s);
}

/**
 * Every string leaf in `props` with its path. Skips any `id` key (Puck
 * component/array-item identifiers are never user content).
 */
export function collectStringPaths(node: unknown): StringEntry[] {
	const out: StringEntry[] = [];
	const walk = (value: unknown, path: PropPath): void => {
		if (typeof value === "string") {
			out.push({ path, value });
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((item, i) => walk(item, [...path, i]));
			return;
		}
		if (value !== null && typeof value === "object") {
			for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
				if (k === "id") continue;
				walk(v, [...path, k]);
			}
		}
	};
	walk(node, []);
	return out;
}

/**
 * Path to the string prop whose value renders as `targetText`.
 * Exact (whitespace-normalized) match first; then containment, choosing
 * the value closest in length to the target (most specific). `null`
 * when nothing plausibly matches.
 */
export function findStringPropPath(
	props: unknown,
	targetText: string,
): PropPath | null {
	const norm = normalizeWhitespace(targetText);
	if (norm === "") return null;
	const entries = collectStringPaths(props);

	for (const e of entries) {
		if (normalizeWhitespace(e.value) === norm) return e.path;
	}

	let best: { path: PropPath; delta: number } | null = null;
	for (const e of entries) {
		const v = normalizeWhitespace(e.value);
		if (v === "") continue;
		if (!v.includes(norm) && !norm.includes(v)) continue;
		const delta = Math.abs(v.length - norm.length);
		if (best === null || delta < best.delta) best = { path: e.path, delta };
	}
	return best?.path ?? null;
}

/**
 * Path to the string prop holding `targetUrl`: exact normalized URL,
 * then equal basename, then suffix containment. `null` when none.
 */
export function findUrlPropPath(
	props: unknown,
	targetUrl: string,
): PropPath | null {
	const nt = normalizeUrl(targetUrl);
	if (nt === "") return null;
	const bt = basename(targetUrl);
	const entries = collectStringPaths(props);

	for (const e of entries) {
		if (normalizeUrl(e.value) === nt) return e.path;
	}
	if (bt !== "") {
		for (const e of entries) {
			if (basename(e.value) === bt) return e.path;
		}
	}
	for (const e of entries) {
		const v = normalizeUrl(e.value);
		if (v !== "" && (v.endsWith(nt) || nt.endsWith(v))) return e.path;
	}
	return null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Immutable deep set; clones only along `path`. Preserves every sibling. */
export function setPropAtPath<T extends Record<string, unknown>>(
	props: T,
	path: PropPath,
	value: unknown,
): T {
	if (path.length === 0) return props;
	const set = (node: unknown, p: PropPath): unknown => {
		const [k, ...tail] = p;
		const next =
			tail.length === 0
				? value
				: set(
						Array.isArray(node)
							? (node as unknown[])[k as number]
							: isRecord(node)
								? node[k as string]
								: undefined,
						tail,
					);
		if (Array.isArray(node)) {
			const copy = node.slice();
			copy[k as number] = next;
			return copy;
		}
		return { ...(isRecord(node) ? node : {}), [k as string]: next };
	};
	return set(props, path) as T;
}

/** Read the value at `path` (best-effort, `undefined` if absent). */
export function getAtPath(props: unknown, path: PropPath): unknown {
	let node: unknown = props;
	for (const k of path) {
		if (Array.isArray(node)) node = node[k as number];
		else if (isRecord(node)) node = node[k as string];
		else return undefined;
	}
	return node;
}

function rectContains(r: DOMRect, x: number, y: number): boolean {
	return (
		r.width > 0 &&
		r.height > 0 &&
		x >= r.left &&
		x <= r.right &&
		y >= r.top &&
		y <= r.bottom
	);
}

function directText(el: Element): string {
	let s = "";
	for (const n of Array.from(el.childNodes)) {
		if (n.nodeType === 3 /* TEXT_NODE */) s += n.textContent ?? "";
	}
	return normalizeWhitespace(s);
}

function* descendants(root: Element): Generator<Element> {
	yield root;
	for (const child of Array.from(root.children)) yield* descendants(child);
}

/**
 * Trimmed direct text of the smallest element inside `root` that both
 * contains the point and has its own (non-descendant) text. `null`
 * when the point isn't over any text leaf.
 */
export function findTextElementAt(
	root: Element,
	x: number,
	y: number,
): string | null {
	let best: { text: string; area: number } | null = null;
	for (const el of descendants(root)) {
		const r = el.getBoundingClientRect();
		if (!rectContains(r, x, y)) continue;
		const text = directText(el);
		if (text === "") continue;
		const area = r.width * r.height;
		if (best === null || area < best.area) best = { text, area };
	}
	return best?.text ?? null;
}

function bgUrl(el: Element): string | null {
	const win = el.ownerDocument?.defaultView;
	if (!win) return null;
	const bg = win.getComputedStyle(el).backgroundImage;
	if (!bg || bg === "none") return null;
	const m = /url\(["']?(.*?)["']?\)/.exec(bg);
	return m?.[1] ?? null;
}

/**
 * Current URL of the smallest `<img>` (preferred) or background-image
 * element inside `root` that contains the point. `null` when none.
 */
export function findImageTargetAt(
	root: Element,
	x: number,
	y: number,
): string | null {
	let best: { url: string; area: number } | null = null;
	for (const el of descendants(root)) {
		const r = el.getBoundingClientRect();
		if (!rectContains(r, x, y)) continue;
		const area = r.width * r.height;
		let url: string | null = null;
		if (el.tagName === "IMG") {
			const img = el as HTMLImageElement;
			url = img.currentSrc || img.getAttribute("src") || img.src || null;
		} else {
			url = bgUrl(el);
		}
		if (url === null || url === "") continue;
		if (best === null || area < best.area) best = { url, area };
	}
	return best?.url ?? null;
}

/**
 * Cheap dragover-time check (props only, no DOM walk): does the node
 * expose anything the given drag kind could plausibly replace? Drives
 * the highlight only — the drop path is still strict.
 */
export function hasReplaceableTarget(
	props: unknown,
	kind: "text" | "image",
): boolean {
	const entries = collectStringPaths(props);
	if (kind === "text") return entries.length > 0;
	return entries.some((e) => looksLikeImageUrl(e.value));
}
