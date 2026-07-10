// The combined component stylesheet (one Tailwind pass over every component
// source) is scoped to the routes that render the full `demoConfig` — the Puck
// routes (`/puck/editor` + `/puck/render`) here and the public published-page
// route (`app/[...slug]`) — so non-config pages (`/`, etc.) don't parse it.
// Using one combined sheet (rather than the nine per-package sheets) keeps the
// responsive `md:*` utilities correctly ordered; see `@/lib/component-styles.css`.
// Standalone component demo pages (`/hero`, `/navbar`) import their single sheet.
import "@/lib/component-styles.css";

export default function PuckLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
