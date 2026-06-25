import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
	DocsBody,
	DocsDescription,
	DocsPage,
	DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { Suspense } from "react";
import { HomeContent } from "@/components/home-content";
import { useMDXComponents } from "@/components/mdx";
import { splitLocale } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

// Root catch-all: serves migrated docs at the SITE ROOT so the live Starlight
// URLs (`/getting-started`, `/guides/...`, `/components/...`) are preserved.
// Specific routes (`/`, `/api/search`, `/playground`, ...) take precedence over
// this splat.
//
// i18n: a leading non-default locale segment (`/zh/...`, `/ja/...`, `/ko/...`) is
// peeled off as the active locale. A locale-only path (`/zh`) renders the
// localized marketing home; everything else resolves a doc, falling back to the
// English page when a translation is missing.
export const Route = createFileRoute("/$")({
	component: Page,
	loader: async ({ params }) => {
		const segments = params._splat?.split("/").filter(Boolean) ?? [];
		const { locale, slugs } = splitLocale(segments);

		if (slugs.length === 0) {
			return { kind: "home" as const, locale };
		}

		const data = await serverLoader({ data: { slugs, locale } });
		await clientLoader.preload(data.path);
		return { kind: "doc" as const, locale, ...data };
	},
});

const serverLoader = createServerFn({ method: "GET" })
	.inputValidator((input: { slugs: string[]; locale: string }) => input)
	.handler(async ({ data: { slugs, locale } }) => {
		const page = source.getPage(slugs, locale);
		if (!page) throw notFound();

		return {
			path: page.path,
			pageTree: await source.serializePageTree(source.getPageTree(locale)),
		};
	});

const clientLoader = browserCollections.docs.createClientLoader({
	component({ toc, frontmatter, default: MDX }) {
		return (
			<DocsPage toc={toc}>
				<DocsTitle>{frontmatter.title}</DocsTitle>
				<DocsDescription>{frontmatter.description}</DocsDescription>
				<DocsBody>
					<MDX components={useMDXComponents()} />
				</DocsBody>
			</DocsPage>
		);
	},
});

function Page() {
	const data = Route.useLoaderData();

	if (data.kind === "home") {
		return <HomeContent locale={data.locale} />;
	}

	return <DocPage path={data.path} pageTree={data.pageTree} />;
}

function DocPage({
	path,
	pageTree,
}: {
	path: string;
	pageTree: Awaited<ReturnType<typeof source.serializePageTree>>;
}) {
	const loaded = useFumadocsLoader({ path, pageTree });

	return (
		<DocsLayout {...baseOptions()} tree={loaded.pageTree}>
			<Suspense>{clientLoader.useContent(loaded.path)}</Suspense>
		</DocsLayout>
	);
}
