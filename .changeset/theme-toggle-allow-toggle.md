---
"@anvilkit/core": minor
---

Honor `config.theme.allowToggle` with a built-in header theme toggle.
The flag has shipped in the schema (default `true`, documented as "the
built-in theme toggle button is rendered in the header") since the
config system landed, but no renderer existed. The new `<ThemeToggle>`
— a dropdown with Light / Dark / System bound to the per-instance theme
store, with a trigger icon reflecting the current preference — now
renders in the header's system-controls cluster (between the plugin
header actions and the language switcher).

**Heads-up — deliberate visual addition:** because the shipped default
is `true`, the toggle appears for every anvilkit-chrome host on
upgrade. Hosts that manage theme externally opt out with:

```tsx
<Studio config={{ theme: { allowToggle: false } }} />
```

Selections persist per `storeId` (`anvilkit-core-theme-${storeId}`),
exactly like the pre-existing imperative `setMode` path. Labels are
localized (`studio.theme.{label,light,dark,system}`) across the bundled
en/zh/ja/ko packs.
