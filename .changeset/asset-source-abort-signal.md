---
"@anvilkit/core": minor
---

Add an optional `signal?: AbortSignal` parameter to `StudioAssetSource.upload()`.

The sidebar image module now creates an `AbortController` per upload batch and
aborts it on unmount / source change, so an in-flight upload stops consuming the
host endpoint when the editor navigates away. The parameter is optional and
backward compatible — existing sources that ignore it keep working unchanged.
