---
"@anvilkit/core": patch
---

Fix `<Studio>` swallowing the real error on plugin compilation failure.

`writeStudioLog` passed `Error` instances straight through to host
loggers and `console`. `Error`'s `name`/`message`/`stack`/`cause` are
non-enumerable own properties, so any serialization of the log meta (the
Next.js dev overlay, `JSON.stringify`-based host loggers, copy-pasted
bug reports) collapsed the error to `{}` — surfacing only the useless
`[studio] plugin compilation failed {}`.

`redactLogMeta` now normalizes `Error` values to a plain, fully
enumerable `{ name, message, stack, cause }` shape, recursing into
`cause` (depth-bounded) so wrapper errors like
`StudioPluginError("Plugin \"x\" failed to register")` no longer hide
the developer-facing root reason. Secret-key redaction is unchanged.
