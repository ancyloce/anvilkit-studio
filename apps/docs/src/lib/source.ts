import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";
import { lucideIconsPlugin } from "fumadocs-core/source/lucide-icons";
import { i18n } from "./i18n";
import { docsRoute } from "./shared";

export const source = loader({
	source: docs.toFumadocsSource(),
	baseUrl: docsRoute,
	i18n,
	plugins: [lucideIconsPlugin()],
});
