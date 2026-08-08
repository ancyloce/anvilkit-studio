# ADR 0009: Canvas AI Provider — Ratifying Replicate

**Status:** Accepted — records a decision already taken in code, not a new selection
**Date:** 2026-08-07
**Resolves:** PLAN-0035 §5 P0 (`cp0-005`), §6 row 4
**Constrains:** `apps/studio` AI routes and provider selection, `@anvilkit/plugin-ai-image`, `cp5-R01`…`cp5-R04`
**Supersedes:** the provider-selection framing of `docs/archive/plans/0033-canvas-reference-ai-provider-0806-1336.md` (archived; §102 of that plan still lists "New SDK dependency" as an open risk)
**Sign-off:** Recommended 2026-08-07 (agent) · Owner sign-off: ☑ **approved 2026-08-07 (ancyloce)**

## Context

### The `cp0-005` task file's premise is stale, and this ADR corrects the record

`docs/tasks/cp0-005-ai-provider-selection.md:3` states: *"Nothing implements a provider; `apps/studio` references none."* **That is false, and was already known to be false when the task file was written.** PLAN-0035 was revised the same day (`docs/plans/0035-canvas-core-parity-phased-execution-0806-1854.md:113`) to read: *"**Ratification, not selection.** Replicate is already chosen and wired … no new dependency approval is pending. **No longer gates a phase**"*, and §6 row 4 (`:208`) strikes the decision through as *"Resolved before this plan was written."* `docs/tasks/README.md:230` records the same correction for the whole of P5. The task file's summary paragraph was not updated to match its own plan.

Every other claim in that summary paragraph **is** accurate and was re-verified for this ADR:

| Claim in `cp0-005:3` | Verified |
| --- | --- |
| 9 image job kinds | `packages/capabilities/canvas/core/src/ai-contracts.ts:3,12,19,27,32,46,55,65,72`, unioned at `:79-88` |
| 8 design job kinds | `packages/capabilities/canvas/core/src/ai-design-contracts.ts:42,50,58,65,74,87,94,102`, unioned at `:110-118` |
| Provider capability advertisement | `ai-design-contracts.ts:194-197` `AiProviderCapabilities` |
| Result quarantine validation | `ai-design-contracts.ts:200-209` `AiDesignQuarantineError` / `ValidateAiDesignJobResultOutcome` |
| In-flight job store | `packages/capabilities/canvas/editor/src/stores/ai-job-store.ts:51` `createAiJobStore` |
| **"Nothing implements a provider"** | **Refuted** — see below |

### What actually ships

Five Replicate-backed routes in the reference app, all funnelling through one helper:

| Job kind | Route | Model pinned in code |
| --- | --- | --- |
| `bg-remove` | `apps/studio/app/api/canvas/ai/bg-remove/route.ts:21` | `lucataco/remove-bg` |
| `text-to-image` | `apps/studio/app/api/canvas/ai/text-to-image/route.ts:36` | `stability-ai/sdxl` |
| `variation` | `apps/studio/app/api/canvas/ai/variation/route.ts:37` | `stability-ai/sdxl` (img2img via `prompt_strength`) |
| `inpaint` | `apps/studio/app/api/canvas/ai/inpaint/route.ts:35` | `stability-ai/stable-diffusion-inpainting` |
| `upscale` | `apps/studio/app/api/canvas/ai/upscale/route.ts:29` | `nightmareai/real-esrgan` |

Supporting surface, all verified in the working tree:

- `apps/studio/app/api/canvas/ai/_lib/replicate.ts` — 167 lines. `import Replicate from "replicate"` (`:11`); `readReplicateToken()` reads `process.env.REPLICATE_API_TOKEN` server-side (`:38-40`); `getReplicateClient()` constructs the client with `useFileOutput: false` (`:47-49`); `runImageRoute()` is the single shared lifecycle (`:111`) — token guard → `req.json()` (`:126`) → per-op `build` → `client.run()` (`:149`) → normalized `{ imageUrl }`.
- `apps/studio/lib/ai-image/replicate-image-provider.ts` — the client-side `AiImageProvider` that resolves asset ids to URLs, POSTs the route, fetches the produced image, and assetizes it through `createPostProcessPipeline`.
- `apps/studio/lib/ai-image/provider-selection.ts:21-23,25-32` — `NEXT_PUBLIC_AI_IMAGE_REAL === "1"` selects the Replicate provider; **the mock provider is the default** (`:31`), so the reference app is offline-safe and CI never calls a paid API.
- `packages/extensions/plugins/plugin-ai-image/src/mock/mock-ai-image-provider.ts:53` — the deterministic mock, a second full implementation of the same `AiImageProvider` contract.
- `apps/studio/e2e/canvas-ai.spec.ts:22-33` asserts 503 `PROVIDER_DISABLED` for all five ops when unconfigured; `:36-59` exercises the mock end-to-end.
- `apps/studio/.env.example:1-19` already documents both env vars.

The decision this task was scoped to make was made months ago and shipped. What follows records it, states the dependency verdict explicitly, and supplies the cost and content-safety notes that were never written down.

---

## Decision 1 — Ratify Replicate as the upstream provider

**Decision: ratify.** Replicate (`https://replicate.com`) is the upstream provider for AnvilKit Canvas AI image jobs in the reference app. Named per job kind:

- **Background removal** → **`lucataco/remove-bg`** (`bg-remove/route.ts:21`). A CarveKit `tracer_b7` deployment. Input `{ image }` — a single URL; no prompt, no tuning surface.
- **Text-to-image** → **`stability-ai/sdxl`** (`text-to-image/route.ts:36`). Input `{ prompt, negative_prompt?, width?, height?, seed? }`, built at `:19-35`.

**Reason.** Not "it is cheapest" and not "it is best" — the reason is that it is *already correct and already paid for in engineering time*:

1. **It covers all five shipped kinds behind one call shape.** `client.run(model, { input, signal })` (`_lib/replicate.ts:149`) serves background removal, SDXL text-to-image, SDXL img2img, SD inpainting, and Real-ESRGAN upscaling without per-provider branching. No competing provider offers that spread of models under one auth and one call shape.
2. **The provider seam makes this reversible cheaply.** `AiImageProvider` (`ai-contracts.ts:146-150`) is a bare function. Swapping upstreams is a change to five route files and one client provider — it touches no contract, no editor code, and no published package. Ratifying Replicate does not lock the project in; it stops paying for an open question that the code closed.
3. **Zero-cost default.** The mock is the default provider (`provider-selection.ts:31`), so a bare checkout, CI, and every E2E run cost nothing and reach no network. Choosing an upstream is an *operator* decision, not a product default — which is why "who holds the key" (Decision 3) has a clean answer.
4. **Two implementations already agree.** Mock and Replicate both satisfy `AiImageProvider` across five kinds. That is the evidence base `cp5-R04` was scoped to reason over; a provider change now would throw it away.

**Not ratified as a product default.** This ADR ratifies Replicate as *the reference app's* upstream. `@anvilkit/plugin-ai-image` stays provider-agnostic — it depends on `@anvilkit/canvas-core`, `@anvilkit/core`, `@anvilkit/utils` and `lucide-react` only (`packages/extensions/plugins/plugin-ai-image/package.json` dependencies block), and its README already tells embedders to *"Call your AI service of choice (Replicate, OpenAI, self-hosted SD, …)"* (`README.md:79`). Nothing published gains a provider dependency.

### Unpinned model references — a real defect, recorded here

`ModelCall.model` accepts both `owner/name` and `owner/name:version` (`_lib/replicate.ts:29`). All five routes use the **unpinned** form. Replicate then resolves to whatever the model owner has most recently published, which means output quality, input schema, hardware class, and therefore per-call cost can all change without a commit in this repo. This is not a blocker for a reference app, but it must not silently become the pattern a production embedder copies. See Follow-up F-1.

---

## Decision 2 — Dependency verdict: keep `replicate`, no new approval pending

**Decision: keep the already-installed `replicate` SDK. No new dependency is proposed, so no user confirmation is required by this ADR.**

The plan's stated preference is plain `fetch` over an SDK (`docs/archive/plans/0033-…:102`). That preference was expressed against a *hypothetical future* install. The install already happened:

- `apps/studio/package.json:73` — `"replicate": "^1.4.0"`, in `dependencies`.
- Resolved to `replicate@1.4.0` (`apps/studio/node_modules/replicate/package.json:3`).
- **License Apache-2.0** (`:8`) — clean for `cp6-006`'s SPDX audit.
- **Zero runtime dependencies** — the package declares no `dependencies` block at all. It adds one node to the tree, not a subtree.
- **Server-only.** Imported solely by `_lib/replicate.ts:11`, reached only from route handlers declaring `export const runtime = "nodejs"`. It cannot enter a client bundle, and `apps/studio` is `"private": true` (`package.json:5`) with no size-limit budget to blow.

### Reuse-first ladder, run in writing

Recorded per CLAUDE.md even though the verdict is "keep, not add", because the honest alternative on the table is *replacing* the SDK with `fetch`, and that choice deserves the same scrutiny.

| Layer | Option considered | Sufficient? |
| --- | --- | --- |
| 1. JS built-ins | `fetch` + `AbortController` + `URL` + a `setTimeout` polling loop | **No, not without reimplementing library behaviour.** Replicate's API is asynchronous: `POST /v1/predictions` returns a prediction that must be polled to a terminal state. Replacing `run()` means hand-rolling poll scheduling, backoff, terminal-state classification, and abort propagation into an in-flight prediction. CLAUDE.md's reuse-first rules forbid exactly this ("do not reinvent … library behaviour"). |
| 2. TypeScript features | Typing the raw wire shapes and narrowing the prediction union by hand | No. Types describe the protocol; they do not implement the polling loop. |
| 3. React APIs | — | Not applicable. This is a Node route handler; no React surface is involved. |
| 4. Node built-ins | `node:https`, `node:timers/promises` | No. Strictly lower-level than `fetch`; solves nothing `fetch` does not, and loses the Web `AbortSignal` plumbing the route already uses (`_lib/replicate.ts:151`). |
| 5. Existing repo code | `@anvilkit/utils`, `@anvilkit/core`; `plugin-ai-image/src/job/retry.ts` (`withRetry`, `RetryableError`) | **Partly, and already used** — but at the wrong layer. `retry.ts` retries a whole *job* from the client; it does not poll a single upstream prediction from the server. Reusing it would put a client-side retry idiom inside a route handler. |
| 6. Deps already in `apps/studio/package.json` | **`replicate@^1.4.0` (:73)**; `undici@^8.5.0` (:74) | **Yes — `replicate` is the answer.** `undici` is present for the WSL2 proxy workaround, not as an HTTP-client policy; using it here would still leave the polling loop hand-rolled. |
| 7. Libraries already accepted elsewhere in the workspace | none relevant | No other AI SDK exists anywhere in the workspace. A repo-wide grep of every `package.json` for `replicate`, `openai`, `@anthropic-ai/sdk`, `fal-ai`, `@fal-ai/*`, `together-ai`, `@google/generative-ai`, `@ai-sdk/*` returns **exactly one hit**: `apps/studio/package.json:73`. |

**Verdict: the SDK stays.** Layer 6 is satisfied by an already-installed, already-shipping, zero-transitive-dependency, Apache-2.0, server-only package. Replacing it with `fetch` would delete ~0 dependencies from the tree while adding a hand-written polling client — a net loss on every axis reuse-first optimizes for. The plan's `fetch`-over-SDK preference is honoured in spirit: no *new* SDK is being added, and the one present is the minimum viable surface.

**Nothing on this decision is pending user confirmation.** PLAN-0035 §6 row 4 already states *"no new dependency approval is pending"*; this ADR confirms it against the manifest.

---

## Decision 3 — Cost model and key custody

### Pricing

Replicate bills public models by **GPU-seconds consumed**, with a minority of models billed per output instead. Rates fetched from `https://replicate.com/pricing` on **2026-08-07**:

| Hardware | Rate |
| --- | --- |
| Nvidia T4 | $0.000225/sec ($0.81/hr) |
| Nvidia L40S | $0.000975/sec ($3.51/hr) |
| Nvidia A100 80GB | $0.001400/sec ($5.04/hr) |
| Nvidia H100 | $0.001525/sec ($5.49/hr) |

Per-call estimates for the two job kinds this decision is scoped to, taken from each model's own "Run time and cost" panel on the same date:

| Job kind | Model | Hardware | Typical run | Estimated cost/run |
| --- | --- | --- | --- | --- |
| Background removal | `lucataco/remove-bg` | Nvidia T4 | ~2 s | **≈ $0.00030** (~3,333 runs per $1) |
| Text-to-image | `stability-ai/sdxl` | Nvidia L40S | ~4 s | **≈ $0.0031** (~322 runs per $1) |

**These figures need re-confirmation before any budget commitment.** Three reasons, all structural rather than cautionary boilerplate: (a) they are Replicate's own averages over completed predictions, not a contractual rate card; (b) per-second billing means SDXL cost scales directly with `width`/`height` and step count, all of which the route passes through from the client (`text-to-image/route.ts:24-31`); (c) the routes reference models **unpinned** (Decision 1), so the model owner can change the hardware class under you. Treat both numbers as order-of-magnitude: background removal is sub-tenth-of-a-cent, text-to-image is low-single-digit tenths of a cent.

### Key custody for `apps/studio`

**Answer: nobody in this project holds a key. The operator running the reference app supplies their own.**

- **Env var:** `REPLICATE_API_TOKEN`, read at `apps/studio/app/api/canvas/ai/_lib/replicate.ts:39`, server-side only. Documented at `apps/studio/.env.example:14-15`.
- **Client gate:** `NEXT_PUBLIC_AI_IMAGE_REAL`, read at `apps/studio/lib/ai-image/provider-selection.ts:22`, documented at `.env.example:17-19`. Deliberately a *separate, public* flag so the secret never needs to be reachable from client code to decide whether the affordance is live.
- **Ships unset.** `.env.example` leaves both blank; `apps/studio/.env.local` in this checkout contains neither. With no token, every route answers 503 `PROVIDER_DISABLED` with a typed remediation message (`_lib/replicate.ts:117-122`), and the client selects the mock (`provider-selection.ts:31`).
- **CI holds no key.** A grep of `.github/workflows/` for `REPLICATE` returns nothing. `apps/studio/e2e/canvas-ai.spec.ts:17-20` *skips* the route-guard suite when a token is present locally — the suite is written to assert the unconfigured path, so CI cannot accidentally spend money.

**One cost-exposure caveat the operator must be told.** The five routes have **no authentication and no rate limiting**. There is no `apps/studio/middleware.ts`, and `runImageRoute` performs no session or origin check before calling the upstream. An operator who sets `REPLICATE_API_TOKEN` on a publicly reachable deployment has published a paid endpoint that anyone can drive. `cp5-R01` adds a body-size cap, which bounds *per-request* cost; it does not bound request *volume*. See Follow-up F-2.

---

## Decision 4 — Content safety: what Replicate does, and what remains ours

**This section is a finding, not a reassurance.**

### What the provider does

Replicate is a **model-hosting marketplace, not a moderation service**. It binds the account holder to an acceptable-use policy and reserves the right to act on abuse reports, but it does not classify prompts or outputs on the operator's behalf as a platform-level guarantee. Whatever safety behaviour exists is a property of the individual model deployment, and differs per model:

| Model | Safety behaviour |
| --- | --- |
| `stability-ai/sdxl` | Stability's SDXL deployments on Replicate conventionally expose an opt-out safety checker as a model input. **The routes never set it** — `text-to-image/route.ts:19-35` builds `{ prompt, negative_prompt?, width?, height?, seed? }` and nothing else, and `variation/route.ts:28-36` builds `{ image, prompt, prompt_strength, seed? }`. Whatever the model's default is therefore applies, unchanged, in both directions. **The exact field name and default could not be read from the model's input schema while writing this ADR and needs confirmation** — see Follow-up F-3. This ADR does not assert that a safety checker is active. |
| `lucataco/remove-bg` | None. A CarveKit `tracer_b7` segmentation model; it classifies foreground, not content. |
| `nightmareai/real-esrgan` | None. Super-resolution; it will faithfully upscale anything. |
| `stability-ai/stable-diffusion-inpainting` | Prompt-driven synthesis into a user-uploaded photograph — the highest-risk surface of the five, and the one with the least visibility from the route layer, which forwards `{ image, mask, prompt, seed? }` verbatim (`inpaint/route.ts:29-33`). |

### What this repository does — nothing

A grep across `apps/`, `packages/` and `docs/` for `moderat*`, `nsfw`, `safety.checker`, `content.safety`, `safety_checker` and `disable_safety` returns **zero product hits**. Every match is an unrelated use of "moderate" in prose or a test fixture id, plus the two planning documents that flagged this obligation without discharging it (`docs/archive/plans/0033-…:104`, `docs/tasks/cp0-005-ai-provider-selection.md:16`).

Concretely, the reference app has: no prompt filtering, no output classification, no per-user attribution on an AI job, no audit log of prompts or generated assets, no rate limit, no authentication on the AI routes, and no retention or deletion policy for generated assets (which land in a per-mount in-memory registry, `CanvasStudioClient.tsx:103-108`).

### Host responsibility — the documented position

The following are **explicitly the embedding host's responsibility** and are not, and will not be, discharged by AnvilKit Canvas:

1. Prompt and output policy, including whatever classification or human review the host's jurisdiction and product require.
2. Per-user attribution and abuse response — the contract carries a `jobId` (`ai-contracts.ts:100`) but no user identity, by design.
3. Authentication and rate limiting on whatever endpoint fronts an `AiImageProvider`.
4. Retention, deletion, and disclosure obligations for generated assets.
5. Compliance with the upstream provider's acceptable-use policy — the host holds the account and the key, so the host holds the obligation.

**Recommendation: do not build a moderation layer inside PLAN-0035.** It is provider-, jurisdiction-, and product-specific, and PLAN-0035 §7 already draws the line at core parity. **Do** discharge the *documentation* half now: `cp5-R02`'s fourth deliverable already asks for a paragraph in the AI docs stating that the mock is the default and CI never calls a paid API. Extend that paragraph to carry the five host responsibilities above. See Follow-up F-4.

---

## Contract fitness — confirmed for both job kinds, no changes required

`cp0-005`'s verification step 1 asks whether the chosen provider covers both job kinds *without contract changes*. **Confirmed, and demonstrated by shipped code rather than projected.**

**`AiImageBgRemoveRequest`** (`ai-contracts.ts:27-30`) is `{ kind: "bg-remove"; sourceAssetId: string }`. The client provider resolves `sourceAssetId` through the host asset registry and sends `{ ...request, sourceImageUrl }` (`replicate-image-provider.ts:82-88`); the route reads `sourceImageUrl` and emits `{ image }` for `lucataco/remove-bg` (`bg-remove/route.ts:11,20-23`). The model needs exactly one image and nothing the contract lacks. **No change required.**

**`AiImageTextToImageRequest`** (`ai-contracts.ts:3-10`) is `{ kind; prompt: string; negativePrompt?; width?; height?; seed? }`. Every field maps one-to-one onto an SDXL input — `prompt`→`prompt`, `negativePrompt`→`negative_prompt`, `width`→`width`, `height`→`height`, `seed`→`seed` (`text-to-image/route.ts:19-35`). The request needs no asset resolution at all and is forwarded whole (`replicate-image-provider.ts:79-80`). **No change required.**

Two observations are handed forward rather than resolved here, because `cp5-R04` owns them:

- **The wire-only `sourceImageUrl`.** It is not a member of any request interface; it rides alongside via object spread. Whether that is a correct transport detail or a contract gap is `cp5-R04`'s first question (`docs/tasks/cp5-R04-contract-fitness-verdict.md:18`) and this ADR deliberately does not pre-empt the verdict.
- **`AiProviderCapabilities` is defined, consumed, and not supplied.** `AiImagePanel` filters its op list through `capabilities.imageOps` when given one (`plugin-ai-image/src/react/ai-image-panel.tsx:250-252`), but `apps/studio` mounts it with only `jobClient` and `getLayerContext` (`CanvasStudioClient.tsx:222-225`). Omission means "assume everything supported" by design (`ai-design-contracts.ts:190-192`), so the panel renders all nine ops from `OP_ORDER` (`ai-image-panel.tsx:30-40`) while only five routes exist. The four unrouted kinds POST to a nonexistent path and degrade to a typed `HTTP_404` job error (`replicate-image-provider.ts:189-194`) — not a crash, but four affordances that cannot succeed. This is evidence for `cp5-R04`'s second question and a candidate assertion for `cp5-R02`. See Follow-up F-5.

## Alternatives considered

Recorded for completeness. None was evaluated in enough depth to displace a working integration, and this ADR does not claim otherwise — that is the point of ratifying rather than re-selecting.

| Alternative | Why not now |
| --- | --- |
| **fal.ai** | Comparable model catalogue and a faster reputation for SDXL-class inference. Would require a new dependency or a hand-rolled client, re-mapping five routes, and re-establishing the two-implementation evidence base `cp5-R04` depends on. No defect in the current integration motivates it. |
| **OpenAI Images (`gpt-image-*`)** | Strong text-to-image, but no background removal, no upscaler, and no Real-ESRGAN equivalent — it covers one of five shipped kinds. Would force a multi-provider route layer, which is strictly more surface than the problem has. |
| **Stability AI direct API** | Covers text-to-image and inpainting; not background removal or upscaling under one auth. Same multi-provider objection. |
| **Self-hosted (SD + rembg on own GPUs)** | Eliminates per-call cost and the key-custody question entirely, and is the right answer for a large-volume production embedder. Wrong answer for a *reference app*, which must run for a reader who has neither a GPU nor a key — which is precisely what the mock default already delivers, for free. |
| **Replace the SDK with plain `fetch`** | Adjudicated in Decision 2. Rejected: it removes zero dependencies and adds a hand-written prediction-polling client. |

## Consequences

- `cp0-005` becomes a ratification record. It gates nothing (PLAN-0035 §5 P0 `:113`), and `cp5-R01`…`cp5-R04` may proceed against it immediately.
- No dependency approval is outstanding. `cp6-006`'s licence audit inherits one new SPDX entry: `replicate@1.4.0`, Apache-2.0, zero transitive dependencies, `apps/studio` only, private package.
- The reference app's zero-cost default is now a *recorded invariant*, not an accident: mock provider by default, no key in the repo, no key in CI. `cp5-R02` is the task that makes it enforced rather than merely true.
- The absence of any moderation layer is now a written finding with a named owner (the embedding host) rather than an unexamined assumption.
- Swapping providers later remains a five-route change behind the `AiImageProvider` seam. This ADR creates no lock-in it did not find.

## Follow-up actions

| ID | Action | Owner task |
| --- | --- | --- |
| F-1 | Decide whether the five routes should pin `owner/name:version` rather than resolve floating model references. Unpinned means output quality, input schema, hardware class and per-call cost can all change without a commit here. | `cp5-R04` (contract verdict) or a standalone follow-up |
| F-2 | Document — in `.env.example` next to `REPLICATE_API_TOKEN` — that the AI routes are unauthenticated and unthrottled, so setting the token on a public deployment publishes a paid endpoint. `cp5-R01` caps body size, not request volume. | `cp5-R01` |
| F-3 | Confirm `stability-ai/sdxl`'s current input schema: whether a safety-checker input exists, its exact field name, and its default when unset. Then state in the AI docs whether generated output is filtered. Do not assert either way until read. | `cp5-R02` docs deliverable |
| F-4 | Extend `cp5-R02`'s AI-docs paragraph to carry the five host responsibilities from Decision 4 verbatim. | `cp5-R02` |
| F-5 | Either supply `AiProviderCapabilities` from `apps/studio` (five shipped `imageOps`) so the panel stops offering four ops that 404, or record deliberately that omission is correct and the 404 path is the intended degradation. | `cp5-R02` / `cp5-R04` |
| F-6 | Correct the stale `:131` citation for `req.json()` in `docs/tasks/cp5-R01-ai-request-size-cap.md:3` — the call is at `_lib/replicate.ts:126` in the current working tree. | `cp5-R01` at task start |

## Puck contract

Documentation only; no runtime surface is created, changed, or proposed by this ADR.

The subsystem it ratifies is Puck-compliant by construction and this decision preserves that. AI results are not a parallel document representation: a completed job yields a `resultAssetId` (`ai-contracts.ts:116`) which enters the canvas IR as an ordinary `image` node through the existing command runtime — `cp5-R03` commits it via the existing `image.replace` command, explicitly *"not a bespoke mutation"* (`docs/tasks/cp5-R03-selection-seam-and-ai-commit.md:21`). The canvas surface reaches Puck through `@anvilkit/plugin-canvas-studio`, and nothing here alters that boundary. No provider state affects rendering; no state lives outside declared fields; editor, preview, production render and export continue to read the one IR.
