// The `/collab` demo renders the full `demoConfig` inside `<Studio>`, so
// it needs the same per-component stylesheets the Puck routes load (see
// `app/puck/layout.tsx`). Scoping them here keeps them off routes that
// don't use them. Core + Puck CSS are already global (`app/layout.tsx`).
import "@anvilkit/bento-grid/styles.css";
import "@anvilkit/blog-list/styles.css";
import "@anvilkit/hero/styles.css";
import "@anvilkit/helps/styles.css";
import "@anvilkit/logo-clouds/styles.css";
import "@anvilkit/navbar/styles.css";
import "@anvilkit/pricing-minimal/styles.css";
import "@anvilkit/section/styles.css";
import "@anvilkit/statistics/styles.css";

export default function CollabLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
