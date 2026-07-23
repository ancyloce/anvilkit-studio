# Canvas SVG asset node — threat model (FR-016)

**Status:** implemented, `canvas-m3-005`
**Review owner:** _unassigned_ (external reviewer recommended)
**Last updated:** 2026-07-12

This document is the authoritative reference for the `svg` Canvas IR
node kind (`CanvasSvgNode`, `packages/capabilities/canvas/core/src/ir/types.ts`).
It names the concrete threats raw SVG markup poses, and states why
`canvas-core`'s design closes them by construction rather than by
runtime sanitization.

## 1. The node never carries markup

`CanvasSvgNode` is defined as:

```ts
interface CanvasSvgNode extends CanvasNodeBase {
	type: "svg";
	assetId: string;
}
```

There is no `markup`, `content`, `raw`, or similar string field —
on the TypeScript type, on the Zod schema (`CanvasSvgNodeSchema`,
`packages/capabilities/canvas/core/src/ir/validators.ts`), or in any
builder (`createSvg()`). An `svg` node is exactly as "safe" as an
`image` node: it is a pointer (`assetId`) into the document's asset
table, resolved to a URI at render/serialize time through the same
`resolveImageHref()` path `image` nodes use. `canvas-core` never
parses, inlines, or executes SVG content — it only ever emits
`<image href="...">` references, in the SVG serializer
(`serialize/svg.ts` `emitSvg()`), the live Konva renderer
(`canvas-editor`'s `CanvasSvgNodeRenderer`), and PDF/raster export
(which rasterizes the live/Konva-rendered page, so it inherits
whatever the renderer drew — no separate SVG-aware code path exists
there to bypass).

This is schema-level prevention, not a documented convention: since
`CanvasNodeSchema` is a Zod discriminated union and `looseObject` only
preserves *unknown* keys for forward-compatibility (see
`canvas_core_schema_loose_discriminated` precedent — IR schemas stay
loose for collab-hostile-peer tolerance), a hostile peer that stuffs a
`markup` field onto a wire-level `svg` node gets an object the rest of
the pipeline simply never reads. There is no code path from "unknown
key on a parsed node" to "gets embedded in DOM/canvas output."

## 2. The three concrete threats this design closes

If `canvas-core` (or a future capability) ever accepted **inline** SVG
markup instead of an asset reference, it would reopen these:

1. **Script / `foreignObject` / event-handler execution.** SVG is a
   first-class HTML-embeddable format that can carry `<script>`,
   `<foreignObject>` (which can embed arbitrary XHTML, including
   `<script>` and form elements), and inline event-handler attributes
   (`onload`, `onclick`, etc. on any element). Rendering such markup
   as a live DOM node (e.g. via `dangerouslySetInnerHTML` or an inline
   `<svg>` in exported HTML) executes attacker-controlled script in
   the viewer's origin.
2. **External-resource exfiltration via `href`.** SVG elements
   (`<image>`, `<use>`, `<a>`, CSS `url(...)` in embedded `<style>`)
   can reference external URLs. A "designer" asset could beacon a
   tracking pixel, exfiltrate viewer IP/UA to an attacker-controlled
   host, or — if the export pipeline ever fetches such URLs
   server-side (e.g. for embed-mode inlining) — enable SSRF against
   internal network endpoints.
3. **Entity-expansion DoS ("billion laughs").** SVG is XML, and XML
   parsers that resolve internal general entities are vulnerable to
   entity-expansion bombs: a few hundred bytes of markup can expand
   to gigabytes in memory, hanging or crashing whatever parses it
   (a Node export worker, a browser tab, a PDF rasterizer).

Because `canvas-core` never parses SVG *text* — only asset *references*
resolved to `<image href>` — none of these three threats has a code
path into this repo today. There is nothing to sanitize because there
is nothing to parse.

## 3. Host responsibility: asset ingest is out of scope here

`canvas-core` performs **no** SVG parsing or sanitization. The moment
an SVG file becomes an asset (upload, URL import, AI-generated
vector), *something* in the host's asset-ingest layer decided to
accept it and produced the `CanvasAssetRef` (`uri`, `id`) that
`assetId` points at. That ingest boundary — not `canvas-core` — is
where the three threats above must be closed, because that is the
only point where raw SVG bytes exist in the system.

**Reference sanitizer profile for hosts:** run any user- or
AI-supplied SVG through [DOMPurify](https://github.com/cure53/DOMPurify)
configured for SVG, e.g.:

```js
DOMPurify.sanitize(svgText, {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: ["script", "foreignObject", "use"],
	FORBID_ATTR: ["onload", "onclick", "onerror"],
});
```

- `FORBID_TAGS` drops `<script>` and `<foreignObject>` outright (threat
  #1) and `<use>` (which can reference external/`xlink:href` content,
  contributing to threat #2) even though DOMPurify's SVG profile
  already strips executable content by default — belt-and-suspenders
  for a format this permissive.
- Reject or rewrite absolute external `href`/`xlink:href`/`url()`
  references at ingest time (threat #2) — do not defer this to
  render time.
- Enforce a decompressed-size ceiling and a max entity-expansion ratio
  before handing text to any XML parser (threat #3); most modern
  parsers (including the one behind DOMPurify in a browser context)
  disable external entity resolution by default, but internal entity
  expansion is a separate, still-live risk class.
- After sanitizing, store the *sanitized* result as the asset (as a
  `data:` URI or an uploaded file) and reference it by `assetId` —
  never store or transmit the original untrusted bytes as something
  the editor or exporter might later read directly.

## 4. Deferred: `inlineVectorSvg` capability flag

A future capability flag, `inlineVectorSvg` (not implemented), is
where true inline vector embedding — real `<svg>` markup in exported
output, preserving vector fidelity instead of rasterizing to
`<image>` — would live. It is explicitly deferred pending:

- A specified allowlist sanitizer (the DOMPurify profile above, or
  equivalent) running server-side at ingest time, never at render
  time.
- Its own size-budget line (entity-expansion and raw-byte ceilings),
  separate from the existing image asset budget, since inline SVG
  bytes land directly in export output rather than behind a URL.

Until that flag exists, every `svg` node round-trips through the
asset-reference / `<image>` path described in §1, and the SVG
serializer always emits the `SVG_INLINE_UNSUPPORTED` structured
warning (`canvas-m3-002`) on every `svg` node, unconditionally —
signalling to hosts that true vector fidelity was not preserved for
that node, even though the reference itself resolved cleanly.
