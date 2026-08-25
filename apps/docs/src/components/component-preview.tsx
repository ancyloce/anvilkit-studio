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
	Blockquote: async () => {
		await import("@anvilkit/blockquote/styles.css");
		return import("@anvilkit/blockquote");
	},
	BlogList: async () => {
		await import("@anvilkit/blog-list/styles.css");
		return import("@anvilkit/blog-list");
	},
	Button: async () => {
		await import("@anvilkit/button/styles.css");
		return import("@anvilkit/button");
	},
	Code: async () => {
		await import("@anvilkit/code/styles.css");
		return import("@anvilkit/code");
	},
	Columns: async () => {
		await import("@anvilkit/columns/styles.css");
		return import("@anvilkit/columns");
	},
	Container: async () => {
		await import("@anvilkit/container/styles.css");
		return import("@anvilkit/container");
	},
	Grid: async () => {
		await import("@anvilkit/grid/styles.css");
		return import("@anvilkit/grid");
	},
	Heading: async () => {
		await import("@anvilkit/heading/styles.css");
		return import("@anvilkit/heading");
	},
	Helps: async () => {
		await import("@anvilkit/helps/styles.css");
		return import("@anvilkit/helps");
	},
	Hero: async () => {
		await import("@anvilkit/hero/styles.css");
		return import("@anvilkit/hero");
	},
	Icon: async () => {
		await import("@anvilkit/icon/styles.css");
		return import("@anvilkit/icon");
	},
	Image: async () => {
		await import("@anvilkit/image/styles.css");
		return import("@anvilkit/image");
	},
	Input: async () => {
		await import("@anvilkit/input/styles.css");
		return import("@anvilkit/input");
	},
	Link: async () => {
		await import("@anvilkit/link/styles.css");
		return import("@anvilkit/link");
	},
	List: async () => {
		await import("@anvilkit/list/styles.css");
		return import("@anvilkit/list");
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
	RichText: async () => {
		await import("@anvilkit/rich-text/styles.css");
		return import("@anvilkit/rich-text");
	},
	Section: async () => {
		await import("@anvilkit/section/styles.css");
		return import("@anvilkit/section");
	},
	Spacer: async () => {
		await import("@anvilkit/spacer/styles.css");
		return import("@anvilkit/spacer");
	},
	Stack: async () => {
		await import("@anvilkit/stack/styles.css");
		return import("@anvilkit/stack");
	},
	Statistics: async () => {
		await import("@anvilkit/statistics/styles.css");
		return import("@anvilkit/statistics");
	},
	Text: async () => {
		await import("@anvilkit/text/styles.css");
		return import("@anvilkit/text");
	},
	Video: async () => {
		await import("@anvilkit/video/styles.css");
		return import("@anvilkit/video");
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
