import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

export default defineConfig({
	mdxOptions: {
		// Disable remark-image's static import + dimension probing: render
		// markdown images as plain runtime-URL <img> (Astro `public/`
		// semantics). One source template (canvas) references a preview.png
		// that was never generated; probing it ENOENTs and fails the build.
		// Plain <img> 404s that one at runtime, exactly like the live site.
		remarkImageOptions: false,
	},
});
