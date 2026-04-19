# `@anvilkit/example-usage-counter`

Worked example for the [AnvilKit plugin authoring guide](https://anvilkit.dev/guides/plugin-authoring/).
Counts how many times each component appears on the current page and
surfaces the totals through:

- `getCounts()` — synchronous snapshot.
- `subscribe(fn)` — push notifications for reactive UIs.
- `ctx.emit("usage-counter:update", counts)` — for other plugins.
- A `headerActions` entry that logs the snapshot via `ctx.log`.

## Install

```bash
pnpm add @anvilkit/example-usage-counter @anvilkit/core @puckeditor/core
```

## Usage

```ts
import { createStudioConfig } from "@anvilkit/core";
import { createUsageCounterPlugin } from "@anvilkit/example-usage-counter";

const usageCounter = createUsageCounterPlugin({ verbose: true });

const studioConfig = createStudioConfig({
	plugins: [usageCounter],
});

usageCounter.subscribe((counts) => {
	console.log(counts);
});
```

## Develop

```bash
pnpm -C examples/plugins/usage-counter build
pnpm -C examples/plugins/usage-counter test
```
