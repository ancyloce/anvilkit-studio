import { createFileRoute } from "@tanstack/react-router";
import { HomeContent } from "@/components/home-content";
import { i18n } from "@/lib/i18n";

// Default-locale (English) home at the site root. Localized homes (`/zh`, `/ja`,
// `/ko`) are served by the docs splat (`$.tsx`) and reuse <HomeContent>.
export const Route = createFileRoute("/")({
	component: Home,
});

function Home() {
	return <HomeContent locale={i18n.defaultLanguage} />;
}
