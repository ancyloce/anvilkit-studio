# Plugin trust model

**Status:** Active — the current trust model for the shipping `0.1.x` line.
(Originally drafted as `phase4-014` pre-`v1.0.0-beta.0`; that tag was never
cut, but everything here applies to what ships today.)
**Review owner:** _unassigned_ (external reviewer recommended)
**Last updated:** 2026-08-04 — APIs, file paths, and the `decodeIR`
validation claim re-verified against the tree.

This document describes the trust boundaries between Anvilkit Studio,
the host application, and any loaded plugin — including the two
first-party plugins (`@anvilkit/plugin-export-html`,
`@anvilkit/plugin-ai-copilot`). It is the authoritative reference for
what each side can safely assume of the others and what they must
not.

## 1. Trust boundary

There are three principals, not two:

```
┌────────────────┐        ┌──────────────┐        ┌──────────┐
│     Studio     │ ◀────▶ │     host     │ ◀────▶ │  plugin  │
│ (this repo)    │        │  (your app)  │        │  (any)   │
└────────────────┘        └──────────────┘        └──────────┘
         │                        │                     │
         │    loads plugins       │  vets + composes    │
         │    on host's behalf    │     plugins         │
         │                        │                     │
         ▼                        ▼                     ▼
  renders editor UI,       holds secrets,       runs with full
  routes plugin events,    owns backend calls,  read/dispatch
  hydrates IR state        picks LLM provider   access to Data
```

- **Studio** is the code you install from npm (`@anvilkit/core` +
  plugins). It does not hold secrets, does not make outbound network
  calls on its own, and does not know what LLM the host chose.
- **Host** is your application: Next.js app, marketing site,
  headless CMS backend, etc. It vets the plugins it installs, owns
  the secrets, and owns the backend routes any plugin calls.
- **Plugins** are third-party (or first-party) packages the host
  opts into by passing them to the editor: `<Studio plugins={[...]} />`.
  (There is no `createStudio()` function — an earlier draft named one.
  The config-building helper is `createStudioConfig()`.) They are _not
  sandboxed_ (see §2).

The most important thing to internalise is this: **Studio trusts the
host; the host trusts the plugins it installs.** Studio does not and
cannot vet plugins on the host's behalf.

## 2. Plugin capabilities

A plugin, once registered, receives a `StudioPluginContext` (defined
in `@anvilkit/core/types`). That context gives the plugin:

- **Full read of the current Puck `Data`** via `ctx.getData()`. No
  field is redacted, no component is hidden.
- **Dispatch of Puck actions** via `ctx.getPuckApi().dispatch(...)`.
  A plugin can replace the entire document with
  `{ type: "setData", data: ... }`, insert a node, remove a node,
  move a node — anything the human editor can do.
- **The host's `studioConfig` snapshot** — the frozen, merged config
  produced by `createStudioConfig()` after layering defaults, environment
  variables, and host overrides. If the host puts secrets in there, the
  plugin sees them. Don't.
- **Event bus** via `ctx.emit()` / `ctx.on()` — plugin-to-plugin
  messaging with no access control.
- **Structured logging** via `ctx.log()`.
- **Export format registration** — a plugin can contribute a new
  export target and receive the full IR at export time.

Plugins run **in the same process and the same realm** as the host.
They are ES modules imported and executed directly. There is no
worker isolation, no sandbox, no capability-based permissioning.

In short: **installing a plugin is installing arbitrary code into
your app's runtime.** The threat model is the same as adding any
other npm package as a direct dependency.

## 3. Host responsibilities

Because Studio cannot vet plugins, the host must:

1. **Vet third-party plugins before installing.** Read the source,
   check the publish trail, pin to a version with a lockfile.
2. **Scope `generatePage()` backend access.** The AI copilot plugin
   calls a host-supplied function. That function is the _only_ place
   LLM credentials should live, and it should live on the host's
   server, not in client code. (See `phase4-010` for worked
   adapters.) Do not ship the adapter as a fetch-from-browser
   function with an embedded key — that leaks the key to anyone who
   views source. See the AI integration guide,
   `apps/docs/content/docs/guides/ai-integration.mdx`, §"Do not do
   this" (post-`phase4-010`).
3. **Apply a Content Security Policy** on the rendered export. The
   HTML exporter emits HTML that you serve to end users; a CSP that
   forbids inline event handlers, inline scripts, and untrusted
   script sources limits blast radius even in the unlikely event the
   exporter is bypassed.
4. **Treat plugin output as unprivileged data** when consuming it.
   If a plugin produces HTML your app later re-ingests, re-validate
   it; do not assume plugin A's output is safe input for plugin B.
5. **Don't put secrets in `studioConfig`.** Anything you put there
   is visible to every registered plugin.

## 4. `validateAiOutput()` guarantees

`@anvilkit/validator` exposes `validateAiOutput(response, components)`
— a Zod-backed gate that every LLM response must pass before the AI
copilot dispatches it to the Puck store. Implementation:
`packages/foundation/validator/src/validate-ai-output.ts`; call site:
`packages/extensions/plugins/plugin-ai-copilot/src/plugin.ts`
(the file was named `create-ai-copilot-plugin.ts` when this was drafted).

**What it enforces (errors that make `valid = false`):**

- `PageIR` shape: `version === "1"`, a root node with
  `type === "__root__"`, and an `assets` array. Anything not
  matching the Zod schema fails validation closed.
- Each child node's `type` must be in the
  `availableComponents` list derived from the host's Puck config.
  An LLM cannot summon a component the host did not declare.
- Each node's `props` must be a plain object of serialisable
  values.
- `assets[]` entries match the Zod `Asset` schema
  (id/kind/url/hash/sizeBytes/mimeType).
- `metadata` is an object (or absent).

**What it does NOT enforce:**

- The _content_ of string props. A validated `PageIR` can still
  contain `<script>alert(1)</script>` in a `headline` prop. The
  HTML exporter, not the validator, is responsible for escaping that
  string at emission time.
- URL safety of asset URLs or href props. The validator accepts any
  syntactically-valid URL; the exporter's `normalizeUrl()` is the
  gate that strips `javascript:`, `vbscript:`, and `data:` schemes
  at render time.
- Cost / size limits. An LLM returning a 10 MB IR document passes
  validation if it's well-formed. The plugin's `timeoutMs` (default
  30 s) is the host's only built-in cost guard; rate limiting must
  happen in the `generatePage()` implementation.
- Semantic correctness. A hero block with an empty `title` is a
  valid IR; it will render as "Untitled Hero" per the exporter's
  fallback, but nothing prevents an LLM from deliberately producing
  degenerate pages.

**Failure mode:** when validation fails, the plugin emits
`ai-copilot:error` with `code: "VALIDATION_FAILED"` and the Zod
issues array, and calls `ctx.log("error", ...)`. It never
dispatches. The IR is dropped.

## 5. HTML exporter XSS surface

The HTML exporter's threat model is that **every string field in the
IR is attacker-controlled**, because an LLM may have produced it and
end users may have typed it. The implementation
(`packages/extensions/plugins/plugin-export-html/src/emit/emit-html.ts`
+ `src/internal/escape-html.ts` in the same package) holds three
invariants:

1. **Every text field is routed through `escapeHtml()`** before it
   is concatenated into element content. `escapeHtml()` replaces
   `& < > " '`. No element content is computed with raw string
   interpolation.
2. **Every attribute value is routed through `escapeAttr()`**, which
   is `escapeHtml()` plus `=` → `&#61;`. All `class=`, `href=`,
   `src=`, `data-*=`, `datetime=`, `title=`, `alt=` attributes go
   through this.
3. **URL schemes are filtered by `normalizeUrl()`** before any
   `href` or image `src` is emitted. The filter drops any URL whose
   lowered, control-stripped form starts with `javascript:`,
   `vbscript:`, or `data:`. Control characters (0x00-0x20, 0x7F)
   and whitespace are stripped before the prefix comparison, so
   `"jav\tascript:"` and `" javascript:"` are both rejected.

**Known surface we explicitly block (see
`packages/extensions/plugins/plugin-export-html/src/__tests__/security.test.ts`,
currently 27 cases):**

- `<script>` injected via a text prop — escaped to `&lt;script&gt;`.
- `" onmouseover=alert(1)` injected via a string prop used in an
  attribute — the closing quote becomes `&quot;` and `=` becomes
  `&#61;`, so the attribute cannot break out.
- `javascript:alert(1)` as a nav or CTA `href` — rejected by
  `normalizeUrl`; the exporter renders the button as a disabled
  `<button>` element instead.
- Whitespace-camouflaged `javascript:` (tabs/newlines inside the
  scheme name) — stripped by `stripUnsafeAscii` before the compare.
- Mixed-case `JaVaScRiPt:` — rejected because the compare is
  case-insensitive.
- `data:text/html,<script>...` — rejected by the `data:` prefix.
- CSS injection via variant / size / theme props (e.g.
  `"x" } body { ..."`) — these props are written into
  `data-variant=` / `data-size=` / `data-theme=` attributes via
  `escapeAttr`, not into inline `style` attributes, so the attacker
  cannot close the attribute or reach CSS syntax.

**Surface we do not attempt to block:**

- `onerror=` / `onload=` as the _name_ of a user-supplied prop. The
  exporter only reads a fixed allow-list of prop keys per
  component; unknown prop names are silently ignored.
- Upstream XSS in the hosting page's own chrome. We emit HTML
  fragments under `<section>`/`<nav>`/`<article>`; the host is
  responsible for document-level defenses (CSP, X-Content-Type,
  trusted-types) around that.
- Exfiltration via DNS/image beacons (legitimate `<img src>` to an
  attacker-controlled host is syntactically valid HTML).
- Server-side rendering choices. The exporter emits a string; the
  host decides where to serve it and with which headers.

### Realtime `subscribe()` trust boundary (`phase6-018`)

The `@anvilkit/plugin-collab-yjs` plugin (alpha-channel; see
[`docs/policies/lts.md`](../policies/lts.md) § "Alpha-channel
packages") introduces a new threat surface that the pre-Phase-6
plugins did not have: the `SnapshotAdapter.subscribe()` callback
delivers a `PageIR` produced **remotely**, and the host dispatches
that IR into Puck via `setData`.

- `subscribe()` callbacks MUST be treated as untrusted input. The IR
  may have been authored by another peer running a malicious build of
  the plugin, or with a corrupted or hostile Y.Doc payload.
- The encoding boundary (`decodeIR()`,
  `packages/extensions/plugins/plugin-collab-yjs/src/utils/encode.ts`)
  validates `version === "1"` **and** the structural backbone of the root
  node (`root.id` / `root.type` are strings, plus `assets` / `metadata`
  shape when present). That check was widened after this section was
  written, but it is **robustness, not a security boundary** — the source
  says so explicitly. It still does NOT run the full Zod schema, does NOT
  enforce per-component prop allow-lists, and does NOT escape string
  values. Hosts must layer those checks on top — the same way the AI
  copilot routes `validateAiOutput()` before dispatch.
- The CRDT layer is content-blind. Lock metadata (`PageIRNode.meta.locked`)
  is **advisory only** at the CRDT boundary; enforcement is the
  host's responsibility (see
  [`docs/architecture/realtime-collab.md`](../architecture/realtime-collab.md) § 4).
- Awareness payloads (cursor / selection from y-protocols
  Awareness) are unauthenticated. Hosts that surface peer display
  names or avatars MUST escape them; do not interpolate
  `peer.displayName` into HTML without going through the same
  `escapeAttr` / `escapeHtml` pipeline used by the export plugins.

The full conflict-resolution and trust contract for the realtime
plugin lives in
[`docs/architecture/realtime-collab.md`](../architecture/realtime-collab.md).

### plugin-asset-manager — upload trust boundary

- `UploadAdapter.url` is a trust boundary. The host controls the adapter, but
  the plugin still treats the returned URL as untrusted input and gates it
  through `validateUploadResult()` before storing it in the registry or
  dispatching IR-shaped data.
- The default URL allowlist is `http`, `https`, and `blob`. Scheme-less URLs,
  `javascript:`, `vbscript:`, and any scheme outside the allowlist are
  rejected.
- The hostile-URL contract test (`plugin-hostile-url.test.ts`) covers the
  rejection path where an adapter returns `javascript:alert(1)`. The plugin
  emits `asset-manager:error` and does not update the registry or dispatch data.
- Phase `phase5-015` builds on this seam for resolver integration. That follow-up
  resolves `asset://<id>` references through the registry rather than trusting
  adapter URLs at export time.

## 6. Open findings

_None._

> New findings must be filed as P0/P1 issues and resolved before the next
> release cut. This section must stay empty (aside from the `_None_`
> marker) at release time. (The original gate named the `v1.0.0-beta.0`
> tag, which was never cut — the rule now applies per release.)

### Closed findings (history)

All three phase4-014 audit findings are now fixed in
`@anvilkit/validator` (iteration 5); the corresponding pin tests in
`packages/extensions/plugins/plugin-ai-copilot/src/__tests__/security.test.ts`
were flipped to assert `VALIDATION_FAILED` instead of the pre-fix
behaviour.

- **F-1 (P2, closed iteration 5):** Validator now emits
  `[INVALID_ROOT_TYPE]` when `root.type !== "__root__"`. Pin test:
  "rejects a response where root.type is not __root__".
- **F-2 (P1, closed iteration 5):** Validator now emits
  `[INVALID_CHILDREN]` when `children` is present but not an array.
  The plugin surfaces `VALIDATION_FAILED` instead of crashing
  `irToPuckPatch` with `.map is not a function`. Pin test:
  "rejects non-array children with INVALID_CHILDREN".
- **F-3 (P1, closed iteration 5):** Validator now walks node `props`
  recursively and emits `[NON_SERIALIZABLE_PROP]` for any function,
  symbol, or bigint value (with circular and depth-bounded
  protection). Pin test: "rejects function props as non-serialisable".
  The architecture's JSON-serialisability invariant is now enforced
  at the validator boundary.

## Registry feed trust boundary (`phase6-013`)

The marketplace registry feed at
`https://docs.anvilkit.dev/registry/feed.json` is the third-party
trust surface introduced in `v1.1.0` (M11). The boundary is:

```
host app  ◄──────  anvilkit add  ◄──────  registry feed (allow-list)
                                ▲
                                │
                     scorecard CI (per-PR)
```

Two trust commitments hold:

1. **Default-safe.** `anvilkit add <slug>` resolves only against
   entries with `verified: true`. An entry's `verified` flag is
   set only after the automated scorecard passes AND a manual
   maintainer review records approval (see
   [`docs/policies/marketplace-governance.md`](../policies/marketplace-governance.md) §§3-4).
2. **Opt-in raw npm.** `anvilkit add --unsafe <slug>` bypasses the
   allow-list and falls through to raw npm metadata. The CLI emits
   a red warning before invoking the package manager. The host is
   responsible for verifying provenance in this mode.

What the registry feed does NOT do:

- **It does not gate npm publish.** A package can be published to
  npm without ever appearing in the feed. The feed is purely a
  curated index — `anvilkit add --unsafe` and direct
  `pnpm add @scope/pkg` always remain available.
- **It does not pin transitive deps.** A verified entry's pinned
  `version` only constrains the entry package itself. Transitive
  dependencies are subject to whatever the npm registry serves at
  install time.
- **It does not run code on the host before install.** Resolution
  is read-only feed parsing; `anvilkit add` only spawns the
  package manager (`pnpm add` / `npm install`) once the user passes
  `--write`. No `postinstall` runs on the registry feed itself.

Removal triggers under
[`docs/policies/marketplace-governance.md`](../policies/marketplace-governance.md) §6 cover the
trust-model side: a confirmed trust-model violation forces removal
within 5 business days, independent of CVE disclosure timelines.

## References

All paths below were re-verified on 2026-08-04.

- `@anvilkit/plugin-export-html` —
  `packages/extensions/plugins/plugin-export-html/src/emit/emit-html.ts`,
  `.../src/internal/escape-html.ts`.
- `@anvilkit/plugin-ai-copilot` —
  `packages/extensions/plugins/plugin-ai-copilot/src/plugin.ts`,
  `.../src/types/types.ts`.
- `@anvilkit/validator` —
  `packages/foundation/validator/src/validate-ai-output.ts`
  (`validateAiOutput`) and `.../src/section.ts`
  (`validateAiSectionPatch`).
- `@anvilkit/plugin-asset-manager` — hostile-URL contract test at
  `packages/extensions/plugins/plugin-asset-manager/src/__tests__/plugin-hostile-url.test.ts`.
- `packages/tooling/cli/src/commands/add.ts` — `anvilkit add`
  resolution flow and the `--unsafe` opt-in. The production feed URL is
  pinned in `packages/tooling/cli/src/utils/registry-client.ts`.
- `apps/docs/src/registry/feed.schema.mjs` — canonical schema for the
  registry feed (it is a `.mjs` module, not the `.ts` file named in the
  original draft); the served artifact is
  `apps/docs/public/registry/feed.schema.json`.
- `.github/workflows/marketplace-scorecard.yml` — scorecard CI
  implementation (`phase6-014`).
- `docs/architecture/repository-structure.md` — package layering and the
  Studio/platform boundary.
- Host-side adapter patterns — `apps/docs/content/docs/guides/ai-integration.mdx`
  (plus `.zh` / `.ja` / `.ko` translations). The originating `phase4-010`
  task note no longer exists anywhere in the tree; the guide superseded
  it.
