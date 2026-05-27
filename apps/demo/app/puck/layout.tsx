// Component stylesheets are scoped to the Puck routes (`/puck/editor` +
// `/puck/render`), which render the full `demoConfig`. Keeping them off
// the root layout means non-Puck pages (`/`, etc.) no longer parse ~9
// component sheets they don't use. Standalone component demo pages
// (`/hero`, `/navbar`) import the single sheet they need directly.
import "@anvilkit/bento-grid/styles.css";
import "@anvilkit/blog-list/styles.css";
import "@anvilkit/hero/styles.css";
import "@anvilkit/helps/styles.css";
import "@anvilkit/logo-clouds/styles.css";
import "@anvilkit/navbar/styles.css";
import "@anvilkit/pricing-minimal/styles.css";
import "@anvilkit/section/styles.css";
import "@anvilkit/statistics/styles.css";

export default function PuckLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	return children;
}
