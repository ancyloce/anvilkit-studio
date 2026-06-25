import { createFileRoute } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";
import MarketplaceCatalog, {
	type CatalogEntry,
} from "@/components/marketplace-catalog";
import { baseOptions } from "@/lib/layout.shared";
import feed from "@/registry/feed.json";
import marketplaceCss from "@/styles/marketplace.css?url";

interface RawEntry {
	slug: string;
	kind: CatalogEntry["kind"];
	name: string;
	description: string;
	packageName: string;
	version: string;
	category: string;
	tags?: string[];
	publisher: CatalogEntry["publisher"];
	verified: boolean;
	repository?: string;
	homepage?: string;
}

// Registry feed is imported as a static JSON module (no runtime fetch), then
// projected to the fields the UI needs — mirrors the old marketplace.astro.
const entries: CatalogEntry[] = (feed.entries as RawEntry[]).map((entry) => ({
	slug: entry.slug,
	kind: entry.kind,
	name: entry.name,
	description: entry.description,
	packageName: entry.packageName,
	version: entry.version,
	category: entry.category,
	tags: entry.tags ?? [],
	publisher: entry.publisher,
	verified: entry.verified,
	repository: entry.repository,
	homepage: entry.homepage,
}));

export const Route = createFileRoute("/marketplace")({
	head: () => ({
		meta: [{ title: "Marketplace · AnvilKit" }],
		links: [{ rel: "stylesheet", href: marketplaceCss }],
	}),
	component: Marketplace,
});

function Marketplace() {
	return (
		<HomeLayout {...baseOptions()}>
			<MarketplaceCatalog entries={entries} />
		</HomeLayout>
	);
}
