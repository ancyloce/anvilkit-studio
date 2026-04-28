import { useMemo, useState } from "react";

/**
 * Filterable React island for the `/marketplace` route.
 *
 * Hydrates with the registry feed entries already serialized into
 * the Astro page (no runtime fetch). Renders a chip-based filter
 * row over `kind` / `verified` plus a free-text search box, then a
 * responsive card grid.
 *
 * Phase 6 / M11 / `phase6-012`.
 */

export interface CatalogEntry {
	readonly slug: string;
	readonly kind: "plugin" | "template" | "component";
	readonly name: string;
	readonly description: string;
	readonly packageName: string;
	readonly version: string;
	readonly category: string;
	readonly tags: ReadonlyArray<string>;
	readonly publisher: "first-party" | "verified" | "community";
	readonly verified: boolean;
	readonly repository?: string;
	readonly homepage?: string;
}

interface Props {
	readonly entries: ReadonlyArray<CatalogEntry>;
}

type KindFilter = "all" | CatalogEntry["kind"];
type VerifiedFilter = "all" | "verified" | "unverified";

export default function MarketplaceCatalog({ entries }: Props) {
	const [kind, setKind] = useState<KindFilter>("all");
	const [verified, setVerified] = useState<VerifiedFilter>("all");
	const [query, setQuery] = useState("");

	const filtered = useMemo(() => {
		const needle = query.trim().toLowerCase();
		return entries.filter((entry) => {
			if (kind !== "all" && entry.kind !== kind) return false;
			if (verified === "verified" && !entry.verified) return false;
			if (verified === "unverified" && entry.verified) return false;
			if (needle === "") return true;
			return (
				entry.name.toLowerCase().includes(needle) ||
				entry.description.toLowerCase().includes(needle) ||
				entry.packageName.toLowerCase().includes(needle) ||
				entry.tags.some((t) => t.toLowerCase().includes(needle))
			);
		});
	}, [entries, kind, verified, query]);

	const counts = useMemo(() => {
		return entries.reduce(
			(acc, e) => {
				acc[e.kind]++;
				return acc;
			},
			{ template: 0, plugin: 0, component: 0 } as Record<
				CatalogEntry["kind"],
				number
			>,
		);
	}, [entries]);

	return (
		<div className="anvilkit-marketplace" data-testid="marketplace-root">
			<header className="anvilkit-marketplace__header">
				<h1 className="anvilkit-marketplace__title">Marketplace</h1>
				<p className="anvilkit-marketplace__lead">
					{entries.length} curated{" "}
					{pluralise(entries.length, "entry", "entries")}
					{" — "}
					{counts.template}{" "}
					{pluralise(counts.template, "template", "templates")}, {counts.plugin}{" "}
					{pluralise(counts.plugin, "plugin", "plugins")}, and{" "}
					{counts.component}{" "}
					{pluralise(counts.component, "component", "components")}. Install any
					verified entry with <code>npx anvilkit add &lt;slug&gt;</code>. See{" "}
					<a
						className="anvilkit-marketplace__link"
						href="https://github.com/ancyloce/anvilkit-studio/blob/main/docs/policies/marketplace-governance.md"
					>
						governance policy
					</a>{" "}
					for the verification rules.
				</p>
			</header>

			<div className="anvilkit-marketplace__filters">
				<FilterGroup label="Kind">
					<Chip
						label={`All (${entries.length})`}
						active={kind === "all"}
						onClick={() => setKind("all")}
						testId="filter-kind-all"
					/>
					<Chip
						label={`Templates (${counts.template})`}
						active={kind === "template"}
						onClick={() => setKind("template")}
						testId="filter-kind-template"
					/>
					<Chip
						label={`Plugins (${counts.plugin})`}
						active={kind === "plugin"}
						onClick={() => setKind("plugin")}
						testId="filter-kind-plugin"
					/>
					<Chip
						label={`Components (${counts.component})`}
						active={kind === "component"}
						onClick={() => setKind("component")}
						testId="filter-kind-component"
					/>
				</FilterGroup>

				<FilterGroup label="Verified">
					<Chip
						label="All"
						active={verified === "all"}
						onClick={() => setVerified("all")}
						testId="filter-verified-all"
					/>
					<Chip
						label="Verified only"
						active={verified === "verified"}
						onClick={() => setVerified("verified")}
						testId="filter-verified-yes"
					/>
					<Chip
						label="Unverified"
						active={verified === "unverified"}
						onClick={() => setVerified("unverified")}
						testId="filter-verified-no"
					/>
				</FilterGroup>

				<input
					type="search"
					className="anvilkit-marketplace__search"
					placeholder="Search by name, package, or tag…"
					aria-label="Search marketplace entries"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					data-testid="filter-search"
				/>
			</div>

			<p
				className="anvilkit-marketplace__count"
				data-testid="marketplace-count"
				data-count={filtered.length}
			>
				Showing {filtered.length} of {entries.length}
			</p>

			{filtered.length === 0 ? (
				<div className="anvilkit-marketplace__empty">
					No marketplace entries match the current filters.
				</div>
			) : (
				<div
					className="anvilkit-marketplace__grid"
					data-testid="marketplace-grid"
				>
					{filtered.map((entry) => (
						<MarketplaceCard
							key={`${entry.kind}:${entry.slug}`}
							entry={entry}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function FilterGroup({
	label,
	children,
}: {
	readonly label: string;
	readonly children: React.ReactNode;
}) {
	return (
		<div className="anvilkit-marketplace__filter-group">
			<span className="anvilkit-marketplace__filter-label">{label}</span>
			<div className="anvilkit-marketplace__filter-buttons">{children}</div>
		</div>
	);
}

function Chip({
	label,
	active,
	onClick,
	testId,
}: {
	readonly label: string;
	readonly active: boolean;
	readonly onClick: () => void;
	readonly testId?: string;
}) {
	return (
		<button
			type="button"
			className="anvilkit-marketplace__chip"
			data-active={active}
			data-testid={testId}
			onClick={onClick}
		>
			{label}
		</button>
	);
}

function MarketplaceCard({ entry }: { readonly entry: CatalogEntry }) {
	const installCommand = `npx anvilkit add ${entry.slug}`;
	return (
		<article
			className="anvilkit-marketplace__card"
			data-testid="marketplace-card"
			data-kind={entry.kind}
			data-slug={entry.slug}
			data-verified={entry.verified}
		>
			<div className="anvilkit-marketplace__card-header">
				<h2 className="anvilkit-marketplace__card-title">{entry.name}</h2>
				<span
					className={`anvilkit-marketplace__badge ${
						entry.verified
							? "anvilkit-marketplace__badge--verified"
							: "anvilkit-marketplace__badge--unverified"
					}`}
					data-testid={
						entry.verified ? "card-badge-verified" : "card-badge-unverified"
					}
				>
					{entry.verified ? "Verified" : "Unverified"}
				</span>
			</div>
			<div className="anvilkit-marketplace__card-meta">
				<code>{entry.packageName}</code>
				<span>v{entry.version}</span>
				<span>·</span>
				<span>{entry.kind}</span>
				<span>·</span>
				<span>{entry.category}</span>
			</div>
			<p className="anvilkit-marketplace__card-description">
				{entry.description}
			</p>
			<pre
				className="anvilkit-marketplace__card-install"
				data-testid="card-install-command"
			>
				{installCommand}
			</pre>
			<div className="anvilkit-marketplace__card-footer">
				<span>{entry.publisher}</span>
				<span>
					{entry.repository !== undefined ? (
						<a
							className="anvilkit-marketplace__link"
							href={entry.repository}
							rel="noreferrer"
						>
							Source
						</a>
					) : null}
					{entry.homepage !== undefined ? (
						<>
							{entry.repository !== undefined ? " · " : null}
							<a
								className="anvilkit-marketplace__link"
								href={entry.homepage}
								rel="noreferrer"
							>
								Docs
							</a>
						</>
					) : null}
				</span>
			</div>
		</article>
	);
}

function pluralise(n: number, singular: string, plural: string): string {
	return n === 1 ? singular : plural;
}
