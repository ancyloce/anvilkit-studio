---
"@anvilkit/canvas-editor": minor
---

Zero-config asset ingress: images work with no adapter wired (PLAN-0035 §5 P1,
`cp1-001`…`cp1-006`).

A `<CanvasStudio>` mounted without `assetPicker` / `assetUploader` /
`onPickAsset` previously could not get an image onto the canvas by any route —
the Image tool was gated off and a drop showed *"This workspace has no upload
service configured"*. The editor now falls back to built-in local adapters.

- **Storage.** Uploaded bytes go to the browser's own IndexedDB (database
  `anvilkit-canvas-assets`) and are referenced from `ir.assets` by `blob:` URI,
  with intrinsic dimensions read per file so inserted nodes are correctly
  sized. Caps: **25 MiB per asset**, **200 MiB total**, both surfaced through
  the existing upload error toast (three new `canvas.upload.*` keys, all four
  locales). Where IndexedDB is unavailable — private browsing, disabled site
  storage, SSR — the store degrades to an in-memory `Map` with one console
  warning and never throws.
- **Adapters became overrides, not requirements**, and precedence is
  **any-of, not per-slot**: a host passing *any* of the three keeps its own
  adapters and the fallback is never constructed. Behaviour for an existing
  host is unchanged, and a regression test fails if the fallback is ever built
  under a host adapter.
- **New prop `disableLocalAssetFallback?: boolean`** (`CanvasStudioProps`,
  inherited by `CanvasWorkspaceProps`; optional, default `false`) — the third
  state between "host adapter" and "default fallback". Set it when
  browser-local storage would be the wrong promise, and the pre-PLAN-0035 hard
  stop returns intact.
- **Locally-stored images survive a reload.** On document load the editor
  re-mints a fresh object URL for every id the local store still holds and
  publishes it to the stage. **The document is never rewritten** — the fresh
  URI cannot reach `onChange`, a save, or an export — and every mint is
  balanced by a revoke across mount, document swap, asset delete and unmount.
- **Export carries the bytes off the machine.** `svg` embeds them as real
  base64 through core's existing fetch-asset seam (the `blob:` URI never
  reaches the output). `png`/`jpeg`/`webp`/`pdf` were never affected — they
  carry pixels. `json` inlines local assets as `data:` URIs while their
  combined source size is at most `DEFAULT_JSON_INLINE_ASSET_BYTES` (10 MiB)
  and, above that, emits one `LOCAL_ASSET_NOT_PORTABLE` warning **per image**
  rather than a silently unresolvable URI — plus `LOCAL_ASSET_VOLATILE_STORE`
  (`level: "error"`) when the store had degraded to memory.
- **New public exports:** `createJsonExporter`, `CanvasJsonExporterOptions`,
  `DEFAULT_JSON_INLINE_ASSET_BYTES`. Override the cap through the existing
  exporter channel:
  `createCanvasExportPlugin({ exporters: { json: createJsonExporter({ maxInlineAssetBytes }) } })`.

**Two known gaps, stated rather than buried.** Page thumbnails and the
offscreen raster/PDF export path still read the raw `ir.assets` instead of the
rehydrated table, so **after a reload** each shows the missing-asset
placeholder for an image the stage paints correctly. Both are zero-config-only,
both are invisible in a single session, and both need the same public-surface
change to fix. See `docs/assets.md` → Known gaps.
