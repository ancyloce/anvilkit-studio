---
"@anvilkit/canvas-core": minor
---

SVG export can reach browser-local images, and `isLocalObjectUri` is public
(PLAN-0035 §5 P1, `cp1-006`).

A document whose assets are browser-minted handles — which is what
`@anvilkit/canvas-editor`'s new zero-config fallback produces — used to export
as SVG with **no `<image>` element at all**.

- **Root cause.** `resolveImageHref` ran the URI scheme allowlist *before* the
  embed branch, so a `blob:` URI was rejected as `UNSAFE_URI` and the image was
  dropped in **every** `images` mode. The caller-supplied `fetchAsset` seam was
  never consulted, so supplying a fetcher could not have helped.
- **Now.** With a `fetchAsset` supplied, `images` not `"reference"`, and a
  browser-local object URI, the bytes are fetched and embedded through the
  existing `embedRemote` path — same base64 encoding, same MIME sanitization
  as any other embedded image. **What is emitted is a `data:` URI; the `blob:`
  URI never reaches the output**, and referencing `blob:` from an exported SVG
  remains impossible.
- **The allowlist is not weakened.** Exactly two schemes qualify — `blob:` and
  `filesystem:`, the complete set of opaque, same-origin, non-executable
  browser-minted handles. `javascript:`, `file:`, `ftp:` and everything else
  still drop unconditionally, fetcher or not.
- **Purely a recovery path.** It fires only where the previous behaviour was
  "drop the image entirely", so no export that worked before changes: with
  `images: "auto"` plus a fetcher, a remote URI is still referenced and the
  fetcher is not called.
- **Better diagnosis.** A local URI the fetcher cannot resolve now warns
  `MISSING_ASSET` ("the image is omitted") instead of `UNSAFE_URI` ("blocked
  scheme"), which was a misdiagnosis, and it is not warned twice.
  `resolveImageHref` is the single choke point for `image`, `svg` and `video`
  poster emission, so one change covers all three. **No `SvgWarningCode` was
  added or removed.**
- **New public export:** `isLocalObjectUri(uri)` — the one predicate a consumer
  needs to tell a browser-local handle from an address it can resolve.
