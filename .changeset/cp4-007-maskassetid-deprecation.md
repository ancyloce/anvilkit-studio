---
"@anvilkit/canvas-core": patch
---

Deprecate `CanvasImageNode.maskAssetId`, removal scheduled for
`@anvilkit/canvas-core@1.0.0` (ADR 0008 decision 3, PLAN-0035 `cp4-007`).

**No runtime behaviour is removed and nothing is unwired.** This is TSDoc, one
warning message and one header comment.

The image node's alpha-mask hook was never rendered by anything: the Konva stage
does not read it, and `serializePageToSvg` has always refused it with
`IMAGE_MASK_UNSUPPORTED`. Rather than finish it, ADR 0008 puts masking on the
**container** — `CanvasFrameNode.shape`, honoured identically by the editor and
by SVG export because both read the one `resolveFrameClipShape`.

**Migration:** wrap the image in a clipping `CanvasFrameNode` (`clip: true` plus
a `shape`) with the image as its child.

**Deprecated:** `CanvasImageNode.maskAssetId` and `CreateImageOptions.maskAssetId`
now carry `@deprecated` TSDoc naming the ADR, the migration and the `1.0.0`
removal. A tombstone table lives in the README under **Deprecated surface
(scheduled removals)**.

**Retained for the whole deprecation window** — all six live consumers stay
wired, so a document carrying the field parses, round-trips through
parse → serialize → parse unchanged, keeps its mask asset alive through the
reference-preservation invariant, and survives a cross-document paste with the
reference re-keyed. The Zod declaration in particular is deliberately kept:
`CanvasImageNodeSchema` is a `looseObject`, so removing it would preserve the key
but silently downgrade a typed field to an unknown one and drop its `min(1)`
check.

**Changed:** the `IMAGE_MASK_UNSUPPORTED` message. The code itself is permanent
(`SvgWarningCode` only ever grows, so no consumer switching on it breaks), but
the old text — "Image masks are not represented in SVG." — read as *not yet*,
as did the serializer's header rationale promising "a future vector-mask
implementation". Neither is true; the vector mask landed on the frame. The
message now names the clipping-frame replacement and the `1.0.0` removal.
Consumers asserting on the exact message string will need to update.
