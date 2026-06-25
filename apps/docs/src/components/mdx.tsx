import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import { ComponentPreview } from "./component-preview";

// Components registered globally so migrated MDX needs no per-file imports.
// Starlight → Fumadocs mapping applied by scripts/migrate-content.mjs:
//   <Aside>      → <Callout>
//   <Tabs>/<TabItem label> → <Tabs items={[]}>/<Tab value>
//   <CardGrid>/<Card>      → <Cards>/<Card>
//   <Steps>      → <Steps> (numbered list preserved)
export function getMDXComponents(components?: MDXComponents) {
	return {
		...defaultMdxComponents,
		Callout,
		Card,
		Cards,
		ComponentPreview,
		Step,
		Steps,
		Tab,
		Tabs,
		...components,
	} satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
	type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
