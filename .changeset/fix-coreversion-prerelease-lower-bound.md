---
"@anvilkit/core": patch
---

Fix `isCoreVersionCompatible` rejecting stable installs against a
prerelease-tagged caret/tilde lower bound.

`satisfiesCaret` / `satisfiesTilde` treated "the range's lower bound
carries a prerelease" as "only same-`[major,minor,patch]`-tuple versions
may match". That is not the npm/semver rule: a prerelease tag restricts
the _version under test_ when it is itself a prerelease, never a stable
release inside the range window. So `^0.1.0-alpha` wrongly rejected the
stable install `0.1.3`, and any plugin declaring such a `coreVersion`
(e.g. the demo's `anvilkit-demo-smoke-test`) failed compilation with
`Plugin "..." requires @anvilkit/core "^0.1.0-alpha" but the installed
version is "0.1.3"`, leaving `<Studio>` rendering nothing.

The prerelease admission rule is now factored into `prereleaseAllowed`
and applied after the normal lower/upper bound checks, matching npm
`semver.satisfies` across a full caret/tilde × version parity sweep
(190 combinations, zero mismatches). Upper-bound behavior is unchanged
— `^0.1.0-alpha` still excludes `0.2.0`/`0.2.0-alpha`.
