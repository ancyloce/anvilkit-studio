---
"@anvilkit/plugin-ai-copilot": patch
---

Fix AI Copilot–generated components not syncing to other collaborators in
collab mode. `irToPuckPatch` omitted the `zones` key for flat pages and emitted
`root: {}`. Puck's `setData` reducer shallow-merges the payload over
`state.data` (and `walkAppState` re-emits `state.data.zones`), so a page
generation left stale ghost zones / a stale root in the data Puck's `onChange`
reported. The collab plugin then converted that corrupted data to IR and
broadcast it, so peers never received the generated components. `irToPuckPatch`
now always returns a complete, replace-safe `Data` snapshot (explicit `zones`,
`root.props`); `applySectionPatch` now always materializes `zones` so section
regeneration is likewise replace-safe.
