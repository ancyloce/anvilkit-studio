/**
 * @file Drag payload contract for sidebar → canvas drag-and-drop
 * replacement.
 *
 * The sidebar (text snippets / image assets) is the drag *source*; the
 * canvas iframe is the drop *target*. A private MIME type isolates our
 * payload so Puck's own native drag-and-drop never reacts to it and our
 * iframe drop handler never reacts to Puck (or arbitrary OS) drags —
 * this is the mechanism that keeps the new feature from interfering
 * with existing functionality.
 *
 * Two extra zero-byte "marker" MIME types carry the payload *kind* so
 * the `dragover` handler can give correct hover feedback: per the HTML
 * drag-and-drop spec the payload body is unreadable during `dragover`,
 * but `DataTransfer.types` is always inspectable.
 *
 * Mirrors the custom-MIME + `text/plain` fallback pattern already used
 * by `overrides/fields/field-types/ArrayField.tsx`
 * (`ARRAY_ITEM_DRAG_TYPE`).
 */

/** Base MIME type — its data is the JSON-encoded {@link CanvasDropPayload}. */
export const ANVILKIT_CANVAS_DROP_TYPE = "application/x-anvilkit-canvas-drop";

/** Zero-byte marker types — presence signals the payload kind. */
const TEXT_MARKER_TYPE = `${ANVILKIT_CANVAS_DROP_TYPE}-text`;
const IMAGE_MARKER_TYPE = `${ANVILKIT_CANVAS_DROP_TYPE}-image`;

export type CanvasDropKind = "text" | "image";

export type CanvasDropPayload =
	| { readonly kind: "text"; readonly body: string }
	| { readonly kind: "image"; readonly url: string; readonly alt: string };

/**
 * Serialize a payload onto a drag `DataTransfer`. Sets the private
 * type, a kind marker, and a `text/plain` fallback (so dropping onto a
 * plain text input outside the canvas still yields something sane).
 */
export function encodeDropPayload(
	dataTransfer: DataTransfer,
	payload: CanvasDropPayload,
): void {
	dataTransfer.setData(ANVILKIT_CANVAS_DROP_TYPE, JSON.stringify(payload));
	dataTransfer.setData(
		payload.kind === "text" ? TEXT_MARKER_TYPE : IMAGE_MARKER_TYPE,
		"",
	);
	dataTransfer.setData(
		"text/plain",
		payload.kind === "text" ? payload.body : payload.url,
	);
}

/** Cheap presence check usable during `dragover` (no body read). */
export function hasCanvasDropPayload(dataTransfer: DataTransfer): boolean {
	return Array.from(dataTransfer.types).includes(ANVILKIT_CANVAS_DROP_TYPE);
}

/**
 * Read the payload *kind* without reading the body — valid during
 * `dragover`. Returns `null` when no/foreign payload is present.
 */
export function peekDropKind(
	dataTransfer: DataTransfer,
): CanvasDropKind | null {
	const types = Array.from(dataTransfer.types);
	if (types.includes(IMAGE_MARKER_TYPE)) return "image";
	if (types.includes(TEXT_MARKER_TYPE)) return "text";
	return null;
}

/**
 * Strict parse of the full payload — call on `drop`. Returns `null` for
 * absent, foreign, or malformed data (never throws).
 */
export function readDropPayload(
	dataTransfer: DataTransfer,
): CanvasDropPayload | null {
	const raw = dataTransfer.getData(ANVILKIT_CANVAS_DROP_TYPE);
	if (raw === "") return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== "object") return null;
	const candidate = parsed as Record<string, unknown>;
	if (candidate["kind"] === "text" && typeof candidate["body"] === "string") {
		return { kind: "text", body: candidate["body"] };
	}
	if (
		candidate["kind"] === "image" &&
		typeof candidate["url"] === "string" &&
		typeof candidate["alt"] === "string"
	) {
		return { kind: "image", url: candidate["url"], alt: candidate["alt"] };
	}
	return null;
}
