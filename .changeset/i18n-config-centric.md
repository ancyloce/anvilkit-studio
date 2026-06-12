---
"@anvilkit/core": minor
---

Config-centric i18n: centralize internationalization on `config.i18n`
— host-controlled locale, per-locale chrome message overrides, and a
built-in header language switcher — with **zero plugin recompiles on
language switch** (the `i18n` block is excluded from the compile
fingerprint; live changes overlay the chrome in place, so collab
transports and plugin state survive a switch). Migration guide:
`docs → Migration → Config-centric i18n`.

**New:**

- `config.i18n.locale` — when set explicitly on the raw `config` prop,
  the mount is locale-**controlled**: the value is authoritative and
  reactive, persistence is bypassed, and the first paint (including
  SSR) already shows the controlled locale. Mode is latched at mount
  (remount with a new React `key` to switch, like `storeId`); env
  (`ANVILKIT_I18N__LOCALE`) never triggers controlled mode.
- `StudioProps.onLocaleChange` — outbound seam: uncontrolled mounts
  notify after applying (cookie/router sync); controlled mounts notify
  *instead of* applying (controlled-`<input>` semantics).
- `config.i18n.showLocaleSwitch` (default `false`) — renders the
  built-in `<LanguageSwitcher>` in the header between plugin header
  actions and `headerEnd`; live-toggleable.
- `config.i18n.messages` now reaches the **rendered chrome** (it
  previously only fed `ctx.t`): per-locale overrides resolve above the
  built-in catalog/plugin packs, with `fallbackLocale` back-fill.
- `requestLocale` on the locale store — the switch-request seam the
  built-in switcher uses (applies + notifies when uncontrolled,
  notify-only when controlled).
- `ctx.t` is now **live**: it resolves the active locale and the live
  `config.i18n.messages` instead of freezing at the compile-time
  config value. (`ctx.studioConfig.i18n` remains the configured
  compile-time snapshot.)

**Deprecated:**

- `<Studio messages>` (flat, locale-agnostic map) — use
  `config.i18n.messages`. Still fully functional and still highest
  precedence through `0.1.x`; one-shot dev warning; **removal in
  `0.2.0`**.

**Behavior change (intentional, the one non-additive semantic):**

- An explicit `config.i18n.locale` previously acted as a
  seed-once-if-unpersisted default — a stale persisted user choice beat
  it. It now wins (controlled mode). The old seed-once semantics remain
  available via the `ANVILKIT_I18N__LOCALE` environment variable.
  Mounts that never set `config.i18n.locale` are byte-identical to
  before (persistence, seeding, defaults all unchanged).
