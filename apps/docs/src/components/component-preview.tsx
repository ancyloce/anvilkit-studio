import { Callout } from "fumadocs-ui/components/callout";
import { type ReactNode, useEffect, useState } from "react";

// Live component preview for the generated component pages. The Starlight
// generator rendered `<Component client:only="react" {...defaultProps} />`;
// here `<ComponentPreview name="Button" />` lazy-loads `@anvilkit/<slug>`
// (+ its styles) and renders it CLIENT-ONLY — the packages are SSR-externalized
// (vite.config ssr.external) and many reach for `window`, so we never render
// them on the server. Each loader pulls the component's own styles.css so that
// CSS is scoped to preview pages instead of every docs page.
const LOADERS: Record<string, () => Promise<Record<string, unknown>>> = {
	BentoGrid: async () => {
		await import("@anvilkit/bento-grid/styles.css");
		return import("@anvilkit/bento-grid");
	},
	BlogList: async () => {
		await import("@anvilkit/blog-list/styles.css");
		return import("@anvilkit/blog-list");
	},
	Button: async () => {
		await import("@anvilkit/button/styles.css");
		return import("@anvilkit/button");
	},
	Helps: async () => {
		await import("@anvilkit/helps/styles.css");
		return import("@anvilkit/helps");
	},
	Hero: async () => {
		await import("@anvilkit/hero/styles.css");
		return import("@anvilkit/hero");
	},
	Input: async () => {
		await import("@anvilkit/input/styles.css");
		return import("@anvilkit/input");
	},
	LogoClouds: async () => {
		await import("@anvilkit/logo-clouds/styles.css");
		return import("@anvilkit/logo-clouds");
	},
	Navbar: async () => {
		await import("@anvilkit/navbar/styles.css");
		return import("@anvilkit/navbar");
	},
	PricingMinimal: async () => {
		await import("@anvilkit/pricing-minimal/styles.css");
		return import("@anvilkit/pricing-minimal");
	},
	Section: async () => {
		await import("@anvilkit/section/styles.css");
		return import("@anvilkit/section");
	},
	Statistics: async () => {
		await import("@anvilkit/statistics/styles.css");
		return import("@anvilkit/statistics");
	},
};

export function ComponentPreview({
	name,
	pkg,
}: {
	name?: string;
	pkg?: string;
}) {
	const [node, setNode] = useState<ReactNode>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		const loader = name ? LOADERS[name] : undefined;
		if (!name || !loader) {
			setError(`No preview registered for "${name ?? pkg ?? "component"}".`);
			return;
		}
		loader()
			.then((mod) => {
				if (cancelled) return;
				const Component = mod[name] as
					| ((props: Record<string, unknown>) => ReactNode)
					| undefined;
				if (typeof Component !== "function") {
					setError(`"${name}" is not exported by its package.`);
					return;
				}
				const defaultProps =
					(mod.defaultProps as Record<string, unknown>) ?? {};
				setNode(<Component {...defaultProps} />);
			})
			.catch((err: unknown) => {
				if (!cancelled) setError(String(err));
			});
		return () => {
			cancelled = true;
		};
	}, [name, pkg]);

	if (error) {
		return (
			<Callout type="warn" title="Preview unavailable">
				{error} Try it in the <a href="/playground">playground</a>.
			</Callout>
		);
	}

	return (
		<div
			className="not-prose anvilkit-component-preview"
			data-testid="component-preview"
		>
			{node ?? (
				<p className="text-fd-muted-foreground text-sm">Loading preview…</p>
			)}
		</div>
	);
}
