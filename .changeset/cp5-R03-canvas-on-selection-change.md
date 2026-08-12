---
"@anvilkit/canvas-editor": minor
---

New host seam: `onSelectionChange` (PLAN-0035 §5 P5, `cp5-R03`).

- **`onSelectionChange?: (nodeId: string | null) => void`**
  (`CanvasStudioProps`, inherited by `CanvasWorkspaceProps`; optional). It
  mirrors `onActivePageChange` exactly: it fires **once on mount** with the
  initial value and thereafter **only on change**. Redundant fires are
  suppressed structurally — the bridge subscribes to a derived `string | null`
  rather than to the selection array, so calling `setSelection(["r1"])`
  repeatedly (a fresh array every time) does not re-notify.
- **A multi-selection reports `null`.** The callback names *one* node; naming
  one of N would be arbitrary, and a host acting on it could then mutate a node
  the user did not choose.
- **It costs an unwired host nothing.** The subscription lives in a leaf
  component mounted only when the prop is supplied, so a host that does not
  pass it renders exactly the tree it rendered before.
- **Why it exists:** it is the missing half of an AI round trip. A host can now
  know which node is selected and commit an `image.replace` against it, closing
  the loop from "the panel produced a result" to "the result is on the canvas".
  Note the host obligation this exposes: an AI result names an asset in the
  *host's* registry, not in the document, so a host must commit the `asset.put`
  alongside the `image.replace` — the same atomic pair the drag-to-replace path
  has always used.
