# `@anvilkit/example-export-json`

Worked example for the [AnvilKit export pipeline guide](https://anvilkit.dev/guides/export-pipeline/).
A minimal `StudioPlugin` that contributes a single
`ExportFormatDefinition` — serializing the normalized `PageIR` as a
JSON document.

Use it as a starting point for your own exporter (React source, MDX,
PDF, ZIP, …). Every exporter that ships on AnvilKit consumes IR the
same way this one does.

## Install

```bash
pnpm add @anvilkit/example-export-json @anvilkit/core @puckeditor/core
```

## Usage

```ts
import { createStudioConfig } from "@anvilkit/core";
import { createExportJsonPlugin } from "@anvilkit/example-export-json";

const studioConfig = createStudioConfig({
	plugins: [createExportJsonPlugin()],
});
```

The registered format id is `"json"`. Host apps dispatch on the id
via `useExportStore.exportAs("json", options)`.

## Develop

```bash
pnpm -C examples/plugins/export-json build
pnpm -C examples/plugins/export-json test
```
