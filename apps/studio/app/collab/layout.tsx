// The `/collab` demo renders the full `demoConfig` inside `<Studio>`, so it
// needs the same combined component stylesheet the Puck routes load (see
// `app/puck/layout.tsx`). One combined sheet (rather than the nine per-package
// sheets) keeps the responsive `md:*` utilities correctly ordered; importing
// the per-package sheets concatenates them and lets a later sheet's bare
// `.flex` / `.hidden` override an earlier one's `.md:hidden` / `.md:flex`,
// collapsing the Navbar to its mobile menu on desktop. Scoping it here keeps it
// off routes that don't use it. Core + Puck CSS are already global
// (`app/layout.tsx`).
import "@/lib/component-styles.css";

export default function CollabLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
